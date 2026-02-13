package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	models "github.com/rk280392/harvesterNavigator/internal/models"
	"github.com/rk280392/harvesterNavigator/internal/services/batch"
	"github.com/rk280392/harvesterNavigator/internal/services/engine"
	"github.com/rk280392/harvesterNavigator/internal/services/health"
	"github.com/rk280392/harvesterNavigator/internal/services/lhva"
	"github.com/rk280392/harvesterNavigator/internal/services/node"
	"github.com/rk280392/harvesterNavigator/internal/services/pdb"
	"github.com/rk280392/harvesterNavigator/internal/services/pod"
	"github.com/rk280392/harvesterNavigator/internal/services/replicas"
	"github.com/rk280392/harvesterNavigator/internal/services/upgrade"
	"github.com/rk280392/harvesterNavigator/internal/services/vm"
	"github.com/rk280392/harvesterNavigator/internal/services/vmi"
	"github.com/rk280392/harvesterNavigator/internal/services/vmim"
	"github.com/rk280392/harvesterNavigator/internal/services/volume"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

type DataFetcher struct {
	client        *kubernetes.Clientset
	dynamicClient dynamic.Interface
	batchFetcher  *batch.BatchFetcher
	volumeService *volume.VolumeService
	pdbChecker    *pdb.HealthChecker
}

func CreateDataFetcher(clientset *kubernetes.Clientset, dynamicClient dynamic.Interface) *DataFetcher {
	return &DataFetcher{
		client:        clientset,
		dynamicClient: dynamicClient,
		batchFetcher:  batch.CreateBatchFetcher(clientset),
		volumeService: volume.CreateVolumeService(clientset),
		pdbChecker:    pdb.NewHealthChecker(clientset, dynamicClient),
	}
}

func (df *DataFetcher) fetchFullClusterData() (models.FullClusterData, error) {
	var allData models.FullClusterData
	start := time.Now()

	upgradeInfo, err := upgrade.FetchLatestUpgrade(df.client)
	if err != nil {
		log.Printf("Warning: could not fetch upgrade information: %v", err)
		upgradeInfo = nil
	} else {
		allData.UpgradeInfo = upgradeInfo
		log.Printf("Upgrade info: %s -> %s (%s)",
			upgradeInfo.PreviousVersion, upgradeInfo.Version, upgradeInfo.State)
	}
	log.Println("Starting cluster data fetch...")

	log.Println("Running health checks...")
	healthChecker := health.CreateHealthChecker(df.client, upgradeInfo)
	healthSummary := healthChecker.RunAllChecks(context.Background())
	allData.HealthChecks = healthSummary
	log.Printf("Health checks completed: %d passed, %d failed, %d warnings",
		healthSummary.PassedChecks, healthSummary.FailedChecks, healthSummary.WarningChecks)

	var nodeWg sync.WaitGroup
	nodeWg.Add(1)
	go func() {
		defer nodeWg.Done()
		if err := df.fetchNodeData(&allData); err != nil {
			log.Printf("Warning: Node data fetch failed: %v", err)
		}
	}()

	nodeWg.Add(1)
	go func() {
		defer nodeWg.Done()
		upgradeInfo, err := upgrade.FetchLatestUpgrade(df.client)
		if err != nil {
			log.Printf("Warning: could not fetch upgrade information: %v", err)
		} else {
			allData.UpgradeInfo = upgradeInfo
			log.Printf("Upgrade info: %s -> %s (%s)",
				upgradeInfo.PreviousVersion, upgradeInfo.Version, upgradeInfo.State)
		}
	}()

	vmData, err := df.fetchVMData()
	if err != nil {
		log.Printf("Error fetching VM data: %v", err)
		return allData, err
	}
	allData.VMs = vmData

	nodeWg.Wait()

	elapsed := time.Since(start)
	log.Printf("Cluster data fetch completed in %v", elapsed)
	return allData, nil
}

// fetchNodeData fetches and processes node information
func (df *DataFetcher) fetchNodeData(allData *models.FullClusterData) error {
	log.Println("Fetching Longhorn node data...")
	longhornNodes, err := vm.FetchAllLonghornNodes(df.client)
	if err != nil {
		return err
	}
	log.Printf("Successfully fetched %d Longhorn node resources from API.", len(longhornNodes))

	parsedLonghornNodes, err := vm.ParseLonghornNodeData(longhornNodes)
	if err != nil {
		return err
	}
	log.Printf("Successfully parsed %d Longhorn nodes for the dashboard.", len(parsedLonghornNodes))

	// Fetch Kubernetes node data
	log.Println("Fetching Kubernetes node data...")
	kubernetesNodes, err := node.FetchAllKubernetesNodes(df.client)
	if err != nil {
		log.Printf("Warning: Could not fetch Kubernetes node data: %v", err)
		// Continue with just Longhorn data
		basicNodes := make([]models.NodeWithMetrics, len(parsedLonghornNodes))
		for i, lhNode := range parsedLonghornNodes {
			basicNodes[i] = models.NodeWithMetrics{NodeInfo: lhNode}
		}
		allData.Nodes = basicNodes
		return nil
	}

	parsedKubernetesNodes, err := node.ParseKubernetesNodeData(kubernetesNodes)
	if err != nil {
		log.Printf("Warning: Could not parse Kubernetes node data: %v", err)
	} else {
		log.Printf("Successfully parsed %d Kubernetes nodes.", len(parsedKubernetesNodes))

		// Fetch running pod counts efficiently
		log.Println("Fetching running pod counts...")
		podCounts, err := node.FetchRunningPodCounts(df.client)
		if err != nil {
			log.Printf("Warning: Could not fetch pod counts: %v", err)
			podCounts = make(map[string]int)
		} else {
			log.Printf("Successfully fetched pod counts for %d nodes.", len(podCounts))
		}

		log.Println("Checking PDB health for all nodes...")
		pdbHealthResults, err := df.pdbChecker.CheckAllNodesPDB()
		if err != nil {
			log.Printf("Warning: Could not perform PDB health checks: %v", err)
			pdbHealthResults = make(map[string]*models.PDBHealthStatus)
		} else {
			log.Printf("PDB health checks completed for %d nodes", len(pdbHealthResults))
		}
		// Merge node data
		mergedNodes := make([]models.NodeWithMetrics, len(parsedLonghornNodes))
		for i, longhornNode := range parsedLonghornNodes {
			nodeWithMetrics := models.NodeWithMetrics{NodeInfo: longhornNode}

			if k8sNode, exists := parsedKubernetesNodes[longhornNode.Name]; exists {
				nodeWithMetrics.KubernetesNodeInfo = k8sNode
				if podCount, exists := podCounts[longhornNode.Name]; exists {
					nodeWithMetrics.RunningPods = podCount
				}
			}
			if pdbHealth, exists := pdbHealthResults[longhornNode.Name]; exists {
				nodeWithMetrics.PDBHealthStatus = pdbHealth
			}
			mergedNodes[i] = nodeWithMetrics
		}
		log.Println("Checking PDB health for all nodes...")

		allData.Nodes = mergedNodes
		log.Printf("Successfully merged node data for %d nodes.", len(mergedNodes))
	}

	return nil
}

// fetchVMData fetches VM data using batch operations
func (df *DataFetcher) fetchVMData() ([]models.VMInfo, error) {
	log.Println("Fetching VM data with batch processing...")

	vmList, err := vm.FetchAllVMData(df.client, "apis/kubevirt.io/v1", "", "virtualmachines")
	if err != nil {
		return nil, err
	}
	log.Printf("Found %d VMs. Processing with batch operations...", len(vmList))
	var pvcRequests []batch.PVCRequest
	vmToPVC := make(map[int]string) // VM index to PVC name mapping

	for i, vmData := range vmList {
		vmInfo := &models.VMInfo{Errors: []models.VMError{}}

		metadata, ok := vmData["metadata"].(map[string]interface{})
		if !ok {
			continue
		}

		namespace, _ := metadata["namespace"].(string)
		vmName, _ := metadata["name"].(string)
		vmInfo.Namespace = namespace
		vmInfo.Name = vmName

		// Parse VM metadata to get PVC name
		if err := vm.ParseVMMetaData(vmData, vmInfo); err != nil {
			log.Printf("Warning: Could not parse VM metadata for %s: %v", vmName, err)
			continue
		}

		if vmInfo.ClaimNames != "" {
			pvcRequests = append(pvcRequests, batch.PVCRequest{
				Name:      vmInfo.ClaimNames,
				Namespace: namespace,
			})
			vmToPVC[i] = vmInfo.ClaimNames
		}
	}

	log.Printf("Identified %d PVCs to fetch for VMs", len(pvcRequests))

	volumeDetails, err := df.volumeService.BatchFetchVolumeDetails(pvcRequests)
	if err != nil {
		log.Printf("Warning: Batch volume fetch failed: %v", err)
		volumeDetails = make(map[string]*volume.VolumeDetails)
	}

	podMapping, err := df.volumeService.GetPodFromVolumeBatch(pvcRequests)
	if err != nil {
		log.Printf("Warning: Batch pod fetch failed: %v", err)
		podMapping = make(map[string]string)
	}

	vmInfos := make([]models.VMInfo, 0, len(vmList))
	var wg sync.WaitGroup
	var vmMutex sync.Mutex

	// Process VMs in batches to avoid overwhelming the system
	batchSize := 20
	for i := 0; i < len(vmList); i += batchSize {
		end := i + batchSize
		if end > len(vmList) {
			end = len(vmList)
		}

		wg.Add(1)
		go func(start, end int) {
			defer wg.Done()

			batchVMs := make([]models.VMInfo, 0, end-start)

			for j := start; j < end; j++ {
				vmInfo := df.processVMWithBatchedData(j, vmList[j], vmToPVC, volumeDetails, podMapping)
				if vmInfo != nil {
					batchVMs = append(batchVMs, *vmInfo)
				}
			}

			vmMutex.Lock()
			vmInfos = append(vmInfos, batchVMs...)
			vmMutex.Unlock()
		}(i, end)
	}

	wg.Wait()
	log.Printf("Processed %d VMs with batch operations", len(vmInfos))
	return vmInfos, nil
}

// processVMWithBatchedData processes a single VM using pre-fetched batch data
func (df *DataFetcher) processVMWithBatchedData(
	vmIndex int,
	vmData map[string]interface{},
	vmToPVC map[int]string,
	volumeDetails map[string]*volume.VolumeDetails,
	podMapping map[string]string,
) *models.VMInfo {
	vmInfo := &models.VMInfo{Errors: []models.VMError{}}

	metadata, ok := vmData["metadata"].(map[string]interface{})
	if !ok {
		return nil
	}

	namespace, _ := metadata["namespace"].(string)
	vmName, _ := metadata["name"].(string)
	vmInfo.Namespace = namespace
	vmInfo.Name = vmName

	// Parse VM metadata
	if err := vm.ParseVMMetaData(vmData, vmInfo); err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "metadata",
			Resource: vmName,
			Message:  fmt.Sprintf("Could not parse VM metadata: %v", err),
			Severity: "warning",
		})
		return vmInfo
	}

	// Skip if no PVC
	if vmInfo.ClaimNames == "" {
		return vmInfo
	}

	// Get volume details from batch data
	pvcKey := fmt.Sprintf("pvc-%s-%s", namespace, vmInfo.ClaimNames)
	if volDetails, exists := volumeDetails[pvcKey]; exists {
		vmInfo.VolumeName = volDetails.VolumeHandle
		vmInfo.PVCStatus = models.PVCStatus(volDetails.Status)
		vmInfo.StorageClass = volDetails.StorageClass
		vmInfo.VolumeRobustness = volDetails.Robustness
		vmInfo.VolumeState = volDetails.State
		if vmInfo.VolumeName != "" {
			paths := getDefaultResourcePaths(namespace)
			lhvaData, err := lhva.FetchLHVAData(df.client, vmInfo.VolumeName, paths.LHVAPath, "longhorn-system", "volumeattachments")
			if err != nil {
				log.Printf("Failed to fetch LHVA data for %s: %v", vmInfo.VolumeName, err)
			} else {
				lhvaStatus, err := lhva.ParseLHVAStatus(lhvaData)
				if err == nil {
					vmInfo.AttachmentTicketsStatusRaw = lhvaStatus
				}
				lhvaSpec, err := lhva.ParseLHVASpec(lhvaData)
				if err == nil {
					vmInfo.AttachmentTicketsSpecRaw = lhvaSpec
				}
			}
		}

		// Pod collection will happen after VMI processing

		// Process Longhorn-specific data if available
		if volDetails.IsLonghornCSI && volDetails.VolumeHandle != "" {
			df.processLonghornData(vmInfo, volDetails.VolumeHandle)
		}
	}

	// Fetch VMI details (still individual calls but much fewer)
	paths := getDefaultResourcePaths(namespace)
	vmiData, err := vmi.FetchVMIDetails(df.client, vmInfo.Name, paths.VMIPath, namespace, "virtualmachineinstances")
	if err != nil {
		// Check if it's a "not found" error for terminating VMs
		if strings.Contains(err.Error(), "could not find the requested resource") ||
			strings.Contains(err.Error(), "not found") {
			if vmInfo.PrintableStatus == "Terminating" {
				vmInfo.Errors = append(vmInfo.Errors, models.VMError{
					Type:     "vmi",
					Resource: vmInfo.Name,
					Message:  "VMI does not exist (VM is terminating)",
					Severity: "info",
				})
			} else {
				vmInfo.Errors = append(vmInfo.Errors, models.VMError{
					Type:     "vmi",
					Resource: vmInfo.Name,
					Message:  "VMI does not exist (VM may not be running)",
					Severity: "warning",
				})
			}
		} else {
			vmInfo.Errors = append(vmInfo.Errors, models.VMError{
				Type:     "vmi",
				Resource: vmInfo.Name,
				Message:  fmt.Sprintf("Failed to fetch VMI: %v", err),
				Severity: "warning",
			})
		}
		// If VMI fetch fails, try VMIM directly
		vmimDataList, err := vmim.FetchAllVMIMsForVMI(df.client, vmInfo.Name, paths.VMIMPath, namespace)
		if err == nil && len(vmimDataList) > 0 {
			vmimStatus, err := vmim.ParseVMIMData(vmimDataList, df.client)
			if err == nil {
				vmInfo.VMIMInfo = vmimStatus
			}
		}
	} else {
		vmiStatus, err := vmi.ParseVMIData(df.client, vmiData, namespace)
		if err != nil {
			vmInfo.Errors = append(vmInfo.Errors, models.VMError{
				Type:     "vmi-parse",
				Resource: vmInfo.Name,
				Message:  fmt.Sprintf("Could not parse VMI data: %v", err),
				Severity: "warning",
			})
		} else {
			vmInfo.VMIInfo = vmiStatus
		}
	}

	// Fetch VMIM details (migrations for this VMI)
	vmimDataList, err := vmim.FetchAllVMIMsForVMI(df.client, vmInfo.Name, paths.VMIMPath, namespace)
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "vmim",
			Resource: vmInfo.Name,
			Message:  fmt.Sprintf("Could not fetch VMIM details: %v", err),
			Severity: "info", // Non-critical since not all VMs have migrations
		})
	} else {
		vmimStatus, err := vmim.ParseVMIMData(vmimDataList, df.client)
		if err != nil {
			log.Printf("Warning: Could not parse VMIM data for VM %s: %v", vmInfo.Name, err)
		} else {
			vmInfo.VMIMInfo = vmimStatus
		}
	}

	// Get pod information for all active pods (post-VMI processing)
	if len(vmInfo.VMIInfo) > 0 && vmInfo.VMIInfo[0].ActivePodNames != nil {
		var allPodInfo []models.PodInfo
		paths := getDefaultResourcePaths(namespace)

		// Fetch details for each active pod
		for podUID, podName := range vmInfo.VMIInfo[0].ActivePodNames {
			if podName != "" {
				podData, err := pod.FetchPodDetails(df.client, podName, paths.PodPath, namespace, "pods")
				if err != nil {
					// Add fallback pod info with unknown status
					nodeID := vmInfo.VMIInfo[0].ActivePods[podUID]
					allPodInfo = append(allPodInfo, models.PodInfo{
						VMI:    vmInfo.Name,
						NodeID: nodeID,
						Status: "Unknown",
					})
				} else {
					podInfoList, err := pod.ParsePodData(podData)
					if err == nil && len(podInfoList) > 0 {
						allPodInfo = append(allPodInfo, podInfoList...)
					}
				}
			}
		}
		vmInfo.PodInfo = allPodInfo
	} else {
		// Fallback to original single pod logic if no VMI info
		if podName, exists := podMapping[pvcKey]; exists {
			vmInfo.PodName = podName

			// Fetch pod details if needed
			if podName != "" {
				paths := getDefaultResourcePaths(namespace)
				podData, err := pod.FetchPodDetails(df.client, podName, paths.PodPath, namespace, "pods")
				if err != nil {
					vmInfo.Errors = append(vmInfo.Errors, models.VMError{
						Type:     "pod",
						Resource: podName,
						Message:  fmt.Sprintf("Could not fetch pod details: %v", err),
						Severity: "warning",
					})
				} else {
					ownerRef, _ := pod.ParsePodData(podData)
					vmInfo.PodInfo = ownerRef
				}
			}
		}
	}

	return vmInfo
}

// processLonghornData processes Longhorn-specific data using batch-fetched information
func (df *DataFetcher) processLonghornData(vmInfo *models.VMInfo, volumeHandle string) {
	// Get replica details from batch data
	replicaData := df.volumeService.GetReplicaDetails(volumeHandle)
	if len(replicaData) > 0 {
		var replicaInfos []models.ReplicaInfo
		for _, replica := range replicaData {
			if replicaInfo, err := extractReplicaInfoFromBatch(replica); err == nil {
				replicaInfos = append(replicaInfos, replicaInfo)
			}
		}
		vmInfo.ReplicaInfo = replicaInfos
	}

	// Get engine details from batch data
	engineData := df.volumeService.GetEngineDetails(volumeHandle)
	if len(engineData) > 0 {
		var engineInfos []models.EngineInfo
		for _, engine := range engineData {
			if engineInfo, err := extractEngineInfoFromBatch(engine); err == nil {
				engineInfos = append(engineInfos, engineInfo)
			}
		}
		vmInfo.EngineInfo = engineInfos
	}
}

// Helper functions to extract info from batch data
func extractReplicaInfoFromBatch(replica map[string]interface{}) (models.ReplicaInfo, error) {
	// Use existing replicas package logic but with pre-fetched data
	return replicas.ExtractReplicaInfoFromMap(replica)
}

func extractEngineInfoFromBatch(engineData map[string]interface{}) (models.EngineInfo, error) {
	// Use existing engine package logic but with pre-fetched data
	return engine.ExtractEngineInfoFromMap(engineData)
}
