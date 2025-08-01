package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	models "github.com/rk280392/harvesterNavigator/internal/models"
	"github.com/rk280392/harvesterNavigator/internal/services/batch"
	"github.com/rk280392/harvesterNavigator/internal/services/engine"
	"github.com/rk280392/harvesterNavigator/internal/services/health"
	"github.com/rk280392/harvesterNavigator/internal/services/node"
	"github.com/rk280392/harvesterNavigator/internal/services/pod"
	"github.com/rk280392/harvesterNavigator/internal/services/replicas"
	"github.com/rk280392/harvesterNavigator/internal/services/upgrade"
	"github.com/rk280392/harvesterNavigator/internal/services/vm"
	"github.com/rk280392/harvesterNavigator/internal/services/vmi"
	"github.com/rk280392/harvesterNavigator/internal/services/volume"
	"k8s.io/client-go/kubernetes"
)

// DataFetcher handles efficient data fetching with batching and caching
type DataFetcher struct {
	client        *kubernetes.Clientset
	batchFetcher  *batch.BatchFetcher
	volumeService *volume.VolumeService
}

// CreateDataFetcher creates a data fetcher
func CreateDataFetcher(clientset *kubernetes.Clientset) *DataFetcher {
	return &DataFetcher{
		client:        clientset,
		batchFetcher:  batch.CreateBatchFetcher(clientset),
		volumeService: volume.CreateVolumeService(clientset),
	}
}

// fetchFullClusterData efficiently fetches all cluster data using batch operations
func (df *DataFetcher) fetchFullClusterData() (models.FullClusterData, error) {
	var allData models.FullClusterData
	start := time.Now()

	log.Println("🚀 Starting cluster data fetch...")

	// Step 1: Run health checks (quick operation)
	log.Println("Running health checks...")
	healthChecker := health.CreateHealthChecker(df.client)
	healthSummary := healthChecker.RunAllChecks(context.Background())
	allData.HealthChecks = healthSummary
	log.Printf("✅ Health checks completed: %d passed, %d failed, %d warnings",
		healthSummary.PassedChecks, healthSummary.FailedChecks, healthSummary.WarningChecks)

	// Step 2: Fetch node data (parallel with VMs)
	var nodeWg sync.WaitGroup
	nodeWg.Add(1)
	go func() {
		defer nodeWg.Done()
		if err := df.fetchNodeData(&allData); err != nil {
			log.Printf("Warning: Node data fetch failed: %v", err)
		}
	}()

	// Step 3: Fetch upgrade info (quick operation, parallel)
	nodeWg.Add(1)
	go func() {
		defer nodeWg.Done()
		upgradeInfo, err := upgrade.FetchLatestUpgrade(df.client)
		if err != nil {
			log.Printf("Warning: could not fetch upgrade information: %v", err)
		} else {
			allData.UpgradeInfo = upgradeInfo
			log.Printf("✅ Upgrade info: %s -> %s (%s)",
				upgradeInfo.PreviousVersion, upgradeInfo.Version, upgradeInfo.State)
		}
	}()

	// Step 4: Fetch VM data optimized
	vmData, err := df.fetchVMData()
	if err != nil {
		log.Printf("Error fetching VM data: %v", err)
		return allData, err
	}
	allData.VMs = vmData

	// Wait for node and upgrade data
	nodeWg.Wait()

	elapsed := time.Since(start)
	log.Printf("🎉 Cluster data fetch completed in %v", elapsed)
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
			mergedNodes[i] = nodeWithMetrics
		}

		allData.Nodes = mergedNodes
		log.Printf("✅ Successfully merged node data for %d nodes.", len(mergedNodes))
	}

	return nil
}

// fetchVMData fetches VM data using batch operations
func (df *DataFetcher) fetchVMData() ([]models.VMInfo, error) {
	log.Println("🔥 Fetching VM data with batch processing...")

	// Step 1: Fetch all VM metadata
	vmList, err := vm.FetchAllVMData(df.client, "apis/kubevirt.io/v1", "", "virtualmachines")
	if err != nil {
		return nil, err
	}
	log.Printf("Found %d VMs. Processing with batch operations...", len(vmList))

	// Step 2: Extract PVC requirements from VMs
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

	// Step 3: Batch fetch all volume details
	volumeDetails, err := df.volumeService.BatchFetchVolumeDetails(pvcRequests)
	if err != nil {
		log.Printf("Warning: Batch volume fetch failed: %v", err)
		volumeDetails = make(map[string]*volume.VolumeDetails)
	}

	// Step 4: Batch fetch pod information for PVCs
	podMapping, err := df.volumeService.GetPodFromVolumeBatch(pvcRequests)
	if err != nil {
		log.Printf("Warning: Batch pod fetch failed: %v", err)
		podMapping = make(map[string]string)
	}

	// Step 5: Process VMs with batched data
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
	log.Printf("✅ Processed %d VMs with batch operations", len(vmInfos))
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

		// Get pod information
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

		// Process Longhorn-specific data if available
		if volDetails.IsLonghornCSI && volDetails.VolumeHandle != "" {
			df.processLonghornData(vmInfo, volDetails.VolumeHandle)
		}
	}

	// Fetch VMI details (still individual calls but much fewer)
	paths := getDefaultResourcePaths(namespace)
	vmiData, err := vmi.FetchVMIDetails(df.client, vmInfo.Name, paths.VMIPath, namespace, "virtualmachineinstances")
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "vmi",
			Resource: vmInfo.Name,
			Message:  fmt.Sprintf("Could not fetch VMI details: %v", err),
			Severity: "warning",
		})
	} else {
		vmiStatus, _ := vmi.ParseVMIData(vmiData)
		vmInfo.VMIInfo = vmiStatus
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
