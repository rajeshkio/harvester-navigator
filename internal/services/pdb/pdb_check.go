// Create new file: internal/services/pdb/health_checker.go

package pdb

import (
	"context"
	"fmt"
	"log"
	"time"

	models "github.com/rk280392/harvesterNavigator/internal/models"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// HealthChecker provides PDB health checking functionality
type HealthChecker struct {
	client        *kubernetes.Clientset
	dynamicClient dynamic.Interface
}

// NewHealthChecker creates a new PDB health checker
func NewHealthChecker(client *kubernetes.Clientset, dynamicClient dynamic.Interface) *HealthChecker {
	return &HealthChecker{
		client:        client,
		dynamicClient: dynamicClient,
	}
}

// CheckPDBHealth performs comprehensive PDB health check for a specific node
func (hc *HealthChecker) CheckPDBHealth(nodeName string) (*models.PDBHealthStatus, error) {
	log.Printf("Checking PDB health for node: %s", nodeName)

	status := &models.PDBHealthStatus{
		NodeName:    nodeName,
		LastChecked: time.Now(),
		Issues:      []models.PDBIssueDetail{},
		Severity:    "low",
	}

	// Step 1: Find all PDBs that reference this node
	pdbs, err := hc.getPDBsForNode(nodeName)
	if err != nil {
		return status, fmt.Errorf("failed to get PDBs for node %s: %v", nodeName, err)
	}

	// Step 2: Get instance manager data for verification
	instanceManagers, err := hc.getInstanceManagers()
	if err != nil {
		return status, fmt.Errorf("failed to get instance managers: %v", err)
	}

	// Step 3: Check each PDB for issues
	for _, pdb := range pdbs {
		issues := hc.validatePDB(pdb, instanceManagers, nodeName)
		status.Issues = append(status.Issues, issues...)
	}

	// Step 4: Determine overall health status
	status.IssueCount = len(status.Issues)
	status.HasIssues = status.IssueCount > 0

	if status.HasIssues {
		// Check volume health to determine if it's safe to delete PDBs
		status.CanSafelyDelete = hc.areVolumesHealthy()

		// Determine severity based on issue types
		status.Severity = hc.calculateSeverity(status.Issues)
	}

	log.Printf("PDB health check complete for %s: %d issues found", nodeName, status.IssueCount)
	return status, nil
}

// getPDBsForNode finds all PDBs that claim to protect resources on the specified node
func (hc *HealthChecker) getPDBsForNode(nodeName string) ([]models.PDBDetail, error) {
	// Get PDBs from the longhorn-system namespace
	pdbList, err := hc.client.PolicyV1().PodDisruptionBudgets("longhorn-system").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list PDBs: %v", err)
	}

	var pdbs []models.PDBDetail
	for _, pdb := range pdbList.Items {
		// Check if this PDB references our target node
		if nodeSelector, exists := pdb.Spec.Selector.MatchLabels["longhorn.io/node"]; exists && nodeSelector == nodeName {
			pdbDetail := models.PDBDetail{
				Name:      pdb.Name,
				Namespace: pdb.Namespace,
				NodeName:  nodeSelector,
				Labels:    pdb.Labels,
				CreatedAt: pdb.CreationTimestamp.Time,
			}

			if pdb.Spec.MinAvailable != nil {
				pdbDetail.MinAvailable = pdb.Spec.MinAvailable.IntVal
			}

			pdbs = append(pdbs, pdbDetail)
		}
	}

	return pdbs, nil
}

// getInstanceManagers fetches all Longhorn instance managers
func (hc *HealthChecker) getInstanceManagers() ([]models.InstanceManagerInfo, error) {
	// Use dynamic client to get Longhorn instance managers
	imGVR := schema.GroupVersionResource{
		Group:    "longhorn.io",
		Version:  "v1beta2",
		Resource: "instancemanagers",
	}

	imList, err := hc.dynamicClient.Resource(imGVR).Namespace("longhorn-system").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list instance managers: %v", err)
	}

	var instanceManagers []models.InstanceManagerInfo
	for _, item := range imList.Items {
		im := hc.parseInstanceManager(&item)
		if im != nil {
			instanceManagers = append(instanceManagers, *im)
		}
	}

	return instanceManagers, nil
}

// parseInstanceManager extracts relevant data from an instance manager resource
func (hc *HealthChecker) parseInstanceManager(obj *unstructured.Unstructured) *models.InstanceManagerInfo {
	name := obj.GetName()
	namespace := obj.GetNamespace()

	// Get spec.nodeID
	nodeID, _, _ := unstructured.NestedString(obj.Object, "spec", "nodeID")

	// Get spec.type
	imType, _, _ := unstructured.NestedString(obj.Object, "spec", "type")

	// Get status.currentState
	state, _, _ := unstructured.NestedString(obj.Object, "status", "currentState")

	// Get status.instanceEngines (map of engine names)
	engines := []string{}
	if engineMap, found, _ := unstructured.NestedMap(obj.Object, "status", "instanceEngines"); found {
		for engineName := range engineMap {
			engines = append(engines, engineName)
		}
	}

	return &models.InstanceManagerInfo{
		Name:      name,
		Namespace: namespace,
		NodeID:    nodeID,
		Engines:   engines,
		Type:      imType,
		State:     state,
		CreatedAt: obj.GetCreationTimestamp().Time,
	}
}

// validatePDB checks a single PDB for various issues
func (hc *HealthChecker) validatePDB(pdb models.PDBDetail, instanceManagers []models.InstanceManagerInfo, targetNode string) []models.PDBIssueDetail {
	var issues []models.PDBIssueDetail

	// Find the corresponding instance manager
	var correspondingIM *models.InstanceManagerInfo
	for _, im := range instanceManagers {
		if im.Name == pdb.Name {
			correspondingIM = &im
			break
		}
	}

	// Issue 1: PDB exists but no corresponding instance manager
	if correspondingIM == nil {
		issues = append(issues, models.PDBIssueDetail{
			PDBName:      pdb.Name,
			IssueType:    "stale_pdb",
			Description:  fmt.Sprintf("PDB %s exists but no corresponding instance manager found", pdb.Name),
			ExpectedNode: targetNode,
			Resolution:   fmt.Sprintf("Delete stale PDB: kubectl delete pdb %s -n longhorn-system", pdb.Name),
			SafetyCheck:  true, // Safe since no actual IM exists
		})
		return issues
	}

	// Issue 2: Node mismatch - PDB points to one node, IM is on another
	if correspondingIM.NodeID != targetNode {
		issues = append(issues, models.PDBIssueDetail{
			PDBName:      pdb.Name,
			IssueType:    "node_mismatch",
			Description:  fmt.Sprintf("PDB %s claims to protect instance manager on %s, but IM is actually on %s", pdb.Name, targetNode, correspondingIM.NodeID),
			ExpectedNode: targetNode,
			ActualNode:   correspondingIM.NodeID,
			Resolution:   fmt.Sprintf("Delete PDB: kubectl delete pdb %s -n longhorn-system", pdb.Name),
			SafetyCheck:  true, // Longhorn will recreate with correct node
		})
	}

	// Issue 3: Stale engine references - IM claims engines that don't exist
	if len(correspondingIM.Engines) > 0 {
		staleEngines, err := hc.findStaleEngines(correspondingIM.Engines)
		if err != nil {
			log.Printf("Warning: Could not check stale engine references for %s: %v", pdb.Name, err)
		} else if len(staleEngines) > 0 {
			issues = append(issues, models.PDBIssueDetail{
				PDBName:      pdb.Name,
				IssueType:    "stale_engine_references",
				Description:  fmt.Sprintf("Instance manager %s has stale references to %d deleted engines", pdb.Name, len(staleEngines)),
				ExpectedNode: targetNode,
				ActualNode:   correspondingIM.NodeID,
				StaleEngines: staleEngines,
				Resolution:   fmt.Sprintf("Delete PDB to clear stale references: kubectl delete pdb %s -n longhorn-system", pdb.Name),
				SafetyCheck:  hc.areVolumesHealthy(), // Only safe if volumes are healthy
			})
		}
	}

	return issues
}

// findStaleEngines checks if engines claimed by IM actually exist as resources
func (hc *HealthChecker) findStaleEngines(claimedEngines []string) ([]string, error) {
	// Use dynamic client to check engines
	engineGVR := schema.GroupVersionResource{
		Group:    "longhorn.io",
		Version:  "v1beta2",
		Resource: "engines",
	}

	engineList, err := hc.dynamicClient.Resource(engineGVR).Namespace("longhorn-system").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list engines: %v", err)
	}

	// Create set of actual engine names
	actualEngines := make(map[string]bool)
	for _, item := range engineList.Items {
		actualEngines[item.GetName()] = true
	}

	// Find stale engine references (claimed but don't exist)
	var staleEngines []string
	for _, claimedEngine := range claimedEngines {
		if !actualEngines[claimedEngine] {
			staleEngines = append(staleEngines, claimedEngine)
		}
	}

	return staleEngines, nil
}

// areVolumesHealthy checks if volumes are in good state (simplified check)
func (hc *HealthChecker) areVolumesHealthy() bool {
	// Use dynamic client to check volume health
	volumeGVR := schema.GroupVersionResource{
		Group:    "longhorn.io",
		Version:  "v1beta2",
		Resource: "volumes",
	}

	volumeList, err := hc.dynamicClient.Resource(volumeGVR).Namespace("longhorn-system").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("Warning: Could not check volume health: %v", err)
		return false // Be conservative
	}

	healthyCount := 0
	totalCount := 0

	for _, item := range volumeList.Items {
		totalCount++

		// Get volume state
		state, found, _ := unstructured.NestedString(item.Object, "status", "state")
		robustness, robustnessFound, _ := unstructured.NestedString(item.Object, "status", "robustness")

		// Consider volume healthy if attached and healthy/robust
		if found && robustnessFound {
			if (state == "attached" || state == "detached") && (robustness == "healthy" || robustness == "robust") {
				healthyCount++
			}
		}
	}

	// Consider volumes healthy if >90% are in good state
	if totalCount == 0 {
		return true // No volumes, safe to proceed
	}

	healthRatio := float64(healthyCount) / float64(totalCount)
	return healthRatio > 0.9
}

// calculateSeverity determines overall severity based on issue types
func (hc *HealthChecker) calculateSeverity(issues []models.PDBIssueDetail) string {
	hasCritical := false
	hasHigh := false
	hasMedium := false

	for _, issue := range issues {
		switch issue.IssueType {
		case "stale_engine_references":
			if !issue.SafetyCheck {
				hasCritical = true // Stale engine references + unhealthy volumes = critical
			} else {
				hasHigh = true
			}
		case "node_mismatch":
			hasHigh = true
		case "stale_pdb":
			hasMedium = true
		}
	}

	if hasCritical {
		return "critical"
	}
	if hasHigh {
		return "high"
	}
	if hasMedium {
		return "medium"
	}
	return "low"
}

// CheckAllNodesPDB performs PDB health checks for all nodes
func (hc *HealthChecker) CheckAllNodesPDB() (map[string]*models.PDBHealthStatus, error) {
	// Get all nodes first
	nodeList, err := hc.client.CoreV1().Nodes().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %v", err)
	}

	results := make(map[string]*models.PDBHealthStatus)

	for _, node := range nodeList.Items {
		nodeName := node.Name
		pdbHealth, err := hc.CheckPDBHealth(nodeName)
		if err != nil {
			log.Printf("Warning: Failed to check PDB health for node %s: %v", nodeName, err)
			// Create error status
			results[nodeName] = &models.PDBHealthStatus{
				NodeName:    nodeName,
				HasIssues:   true,
				IssueCount:  1,
				Issues:      []models.PDBIssueDetail{},
				Severity:    "medium",
				LastChecked: time.Now(),
			}
		} else {
			results[nodeName] = pdbHealth
		}
	}

	return results, nil
}
