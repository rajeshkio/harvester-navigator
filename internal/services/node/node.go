package node

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	models "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// Helper function for safe string extraction
func getString(data map[string]interface{}, key string) string {
	if val, ok := data[key].(string); ok {
		return val
	}
	return ""
}

// Helper function for safe map extraction
func getStringMap(data map[string]interface{}, key string) map[string]string {
	if val, ok := data[key].(map[string]interface{}); ok {
		result := make(map[string]string)
		for k, v := range val {
			if str, ok := v.(string); ok {
				result[k] = str
			}
		}
		return result
	}
	return nil
}

// FetchAllKubernetesNodes retrieves all standard Kubernetes nodes
func FetchAllKubernetesNodes(client *kubernetes.Clientset) ([]interface{}, error) {
	nodesRaw, err := client.RESTClient().Get().AbsPath("/api/v1/nodes").Do(context.Background()).Raw()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Kubernetes nodes: %w", err)
	}

	var nodeData map[string]interface{}
	if err := json.Unmarshal(nodesRaw, &nodeData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal Kubernetes nodes: %w", err)
	}

	items, ok := nodeData["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("items field not found in Kubernetes node response")
	}

	return items, nil
}

// ParseKubernetesNodeData extracts essential info from standard Kubernetes nodes
func ParseKubernetesNodeData(nodes []interface{}) (map[string]*models.KubernetesNodeInfo, error) {
	results := make(map[string]*models.KubernetesNodeInfo)

	for _, nodeItem := range nodes {
		nodeMap, ok := nodeItem.(map[string]interface{})
		if !ok {
			continue
		}

		metadata, _ := nodeMap["metadata"].(map[string]interface{})
		nodeName := getString(metadata, "name")
		if nodeName == "" {
			continue
		}

		nodeInfo := &models.KubernetesNodeInfo{
			Name: nodeName,
		}

		// Extract labels to determine node roles
		if labels, ok := metadata["labels"].(map[string]interface{}); ok {
			nodeInfo.Roles = extractNodeRoles(labels)
		}

		// Extract annotations for additional metadata
		if _, ok := metadata["annotations"].(map[string]interface{}); ok {
			nodeInfo.Annotations = getStringMap(metadata, "annotations")
		}

		// Extract node addresses
		if status, ok := nodeMap["status"].(map[string]interface{}); ok {
			if addresses, ok := status["addresses"].([]interface{}); ok {
				for _, addr := range addresses {
					if addrMap, ok := addr.(map[string]interface{}); ok {
						addrType := getString(addrMap, "type")
						address := getString(addrMap, "address")

						switch addrType {
						case "InternalIP":
							nodeInfo.InternalIP = address
						case "ExternalIP":
							nodeInfo.ExternalIP = address
						case "Hostname":
							nodeInfo.Hostname = address
						}
					}
				}
			}

			// Extract node conditions
			if conditions, ok := status["conditions"].([]interface{}); ok {
				for _, cond := range conditions {
					if condMap, ok := cond.(map[string]interface{}); ok {
						nodeInfo.Conditions = append(nodeInfo.Conditions, models.NodeCondition{
							Type:               getString(condMap, "type"),
							Status:             getString(condMap, "status"),
							LastTransitionTime: getString(condMap, "lastTransitionTime"),
							LastHeartbeatTime:  getString(condMap, "lastHeartbeatTime"),
							Reason:             getString(condMap, "reason"),
							Message:            getString(condMap, "message"),
						})
					}
				}
			}

			// Extract node info
			if nodeInfoData, ok := status["nodeInfo"].(map[string]interface{}); ok {
				nodeInfo.NodeInfo = models.NodeSystemInfo{
					Architecture:            getString(nodeInfoData, "architecture"),
					BootID:                  getString(nodeInfoData, "bootID"),
					ContainerRuntimeVersion: getString(nodeInfoData, "containerRuntimeVersion"),
					KernelVersion:           getString(nodeInfoData, "kernelVersion"),
					KubeProxyVersion:        getString(nodeInfoData, "kubeProxyVersion"),
					KubeletVersion:          getString(nodeInfoData, "kubeletVersion"),
					MachineID:               getString(nodeInfoData, "machineID"),
					OperatingSystem:         getString(nodeInfoData, "operatingSystem"),
					OSImage:                 getString(nodeInfoData, "osImage"),
					SystemUUID:              getString(nodeInfoData, "systemUUID"),
				}
			}

			// Extract capacity and allocatable resources
			if _, ok := status["capacity"].(map[string]interface{}); ok {
				nodeInfo.Capacity = getStringMap(status, "capacity")
			}
			if _, ok := status["allocatable"].(map[string]interface{}); ok {
				nodeInfo.Allocatable = getStringMap(status, "allocatable")
			}
			if spec, ok := nodeMap["spec"].(map[string]interface{}); ok {
				if unschedulable, ok := spec["unschedulable"].(bool); ok {
					nodeInfo.Unschedulable = unschedulable
				}
			}
			// Extract volumes attached and in use
			if volumesAttached, ok := status["volumesAttached"].([]interface{}); ok {
				for _, vol := range volumesAttached {
					if volMap, ok := vol.(map[string]interface{}); ok {
						nodeInfo.VolumesAttached = append(nodeInfo.VolumesAttached, models.VolumeAttachment{
							Name:       getString(volMap, "name"),
							DevicePath: getString(volMap, "devicePath"),
						})
					}
				}
			}

			if volumesInUse, ok := status["volumesInUse"].([]interface{}); ok {
				for _, vol := range volumesInUse {
					if volStr, ok := vol.(string); ok {
						nodeInfo.VolumesInUse = append(nodeInfo.VolumesInUse, volStr)
					}
				}
			}
		}

		results[nodeName] = nodeInfo
	}

	for nodeName, nodeInfo := range results {
		fmt.Printf("DEBUG node: %s, Unschedulable=%v, Roles=%v\n", nodeName, nodeInfo.Unschedulable, nodeInfo.Roles)
	}

	return results, nil
}

// extractNodeRoles determines the roles of a node based on its labels
func extractNodeRoles(labels map[string]interface{}) []string {
	var roles []string

	// Check for control-plane role
	if _, exists := labels["node-role.kubernetes.io/control-plane"]; exists {
		roles = append(roles, "control-plane")
	}
	// Check for master role (legacy)
	if _, exists := labels["node-role.kubernetes.io/master"]; exists {
		if !contains(roles, "control-plane") {
			roles = append(roles, "control-plane")
		}
	}

	// Check for etcd role
	if _, exists := labels["node-role.kubernetes.io/etcd"]; exists {
		roles = append(roles, "etcd")
	}

	// Check for worker role (sometimes implicit)
	if _, exists := labels["node-role.kubernetes.io/worker"]; exists {
		roles = append(roles, "worker")
	}

	// If no specific roles found, assume worker
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	return roles
}

// contains checks if a slice contains a string
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// MergeNodeData combines Longhorn node data with Kubernetes node data
func MergeNodeData(longhornNodes []models.NodeInfo, kubernetesNodes map[string]*models.KubernetesNodeInfo, podCounts map[string]int) []models.NodeWithMetrics {
	var results []models.NodeWithMetrics

	for _, longhornNode := range longhornNodes {
		nodeWithMetrics := models.NodeWithMetrics{
			NodeInfo: longhornNode,
		}

		if k8sNode, exists := kubernetesNodes[longhornNode.Name]; exists {
			nodeWithMetrics.KubernetesNodeInfo = k8sNode

			if podCount, exists := podCounts[longhornNode.Name]; exists {
				nodeWithMetrics.RunningPods = podCount
			}

			log.Printf("Successfully merged node data for %s: roles=%v, IP=%s, pods=%d",
				longhornNode.Name, k8sNode.Roles, k8sNode.InternalIP, nodeWithMetrics.RunningPods)
		} else {
			log.Printf("Warning: No Kubernetes node data found for Longhorn node %s", longhornNode.Name)
		}

		results = append(results, nodeWithMetrics)
	}

	return results
}

// GetPrimaryNodeConditions extracts the most important conditions for display
func GetPrimaryNodeConditions(conditions []models.NodeCondition) map[string]models.NodeCondition {
	result := make(map[string]models.NodeCondition)

	// Priority conditions to extract
	priorityConditions := []string{"Ready", "MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"}

	for _, condition := range conditions {
		for _, priority := range priorityConditions {
			if condition.Type == priority {
				result[priority] = condition
				break
			}
		}
	}

	return result
}

// FormatNodeRoles creates a human-readable roles string
func FormatNodeRoles(roles []string) string {
	if len(roles) == 0 {
		return "worker"
	}
	return strings.Join(roles, ", ")
}

// GetNodeConditionStatus returns a simple status for a condition type
func GetNodeConditionStatus(conditions []models.NodeCondition, conditionType string) string {
	for _, condition := range conditions {
		if condition.Type == conditionType {
			return condition.Status
		}
	}
	return "Unknown"
}

// FetchRunningPodCounts gets the number of running pods per node
func FetchRunningPodCounts(client *kubernetes.Clientset) (map[string]int, error) {
	podsRaw, err := client.RESTClient().Get().AbsPath("/api/v1/pods").Do(context.Background()).Raw()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch pods: %w", err)
	}

	var podData map[string]interface{}
	if err := json.Unmarshal(podsRaw, &podData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal pods: %w", err)
	}

	items, ok := podData["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("items field not found in pods response")
	}

	podCounts := make(map[string]int)

	for _, item := range items {
		podMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		// Get pod spec to find the node name
		spec, ok := podMap["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		nodeName := getString(spec, "nodeName")
		if nodeName == "" {
			continue // Skip pods not assigned to a node
		}

		// Get pod status to check if it's running
		status, ok := podMap["status"].(map[string]interface{})
		if !ok {
			continue
		}

		phase := getString(status, "phase")
		if phase == "Running" || phase == "Succeeded" {
			podCounts[nodeName]++
		}
	}

	return podCounts, nil
}
