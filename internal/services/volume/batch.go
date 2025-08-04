package volume

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/rk280392/harvesterNavigator/internal/services/batch"
	"github.com/rk280392/harvesterNavigator/internal/services/pvc"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// VolumeService provides batch volume operations
type VolumeService struct {
	client       *kubernetes.Clientset
	batchFetcher *batch.BatchFetcher
	longhornData map[string]map[string]interface{}
	mutex        sync.RWMutex
}

// CreateVolumeService creates a volume service
func CreateVolumeService(client *kubernetes.Clientset) *VolumeService {
	return &VolumeService{
		client:       client,
		batchFetcher: batch.CreateBatchFetcher(client),
	}
}

// BatchFetchVolumeDetails fetches volume details for multiple PVCs efficiently
func (vs *VolumeService) BatchFetchVolumeDetails(pvcRequests []batch.PVCRequest) (map[string]*VolumeDetails, error) {
	// Step 1: Pre-fetch all Longhorn resources once
	if err := vs.preloadLonghornData(); err != nil {
		log.Printf("Warning: Could not preload Longhorn data: %v", err)
	}

	// Step 2: Batch fetch all PVCs
	pvcData := vs.batchFetcher.BatchFetchPVCs(pvcRequests)

	// Step 3: Extract PV names from PVCs
	pvNames := make([]string, 0, len(pvcRequests))
	pvcToPV := make(map[string]string)

	for _, req := range pvcRequests {
		pvcKey := fmt.Sprintf("pvc-%s-%s", req.Namespace, req.Name)
		if data, exists := pvcData[pvcKey]; exists {
			if pvName, err := pvc.ParsePVCSpec(data); err == nil && pvName != "" {
				pvNames = append(pvNames, pvName)
				pvcToPV[pvcKey] = pvName
			}
		}
	}

	// Step 4: Batch fetch all PVs
	pvData := vs.batchFetcher.BatchFetchPVs(pvNames)

	// Step 5: Process all volume details
	result := make(map[string]*VolumeDetails)
	var wg sync.WaitGroup
	var resultMutex sync.Mutex

	for _, req := range pvcRequests {
		wg.Add(1)
		go func(pvcReq batch.PVCRequest) {
			defer wg.Done()

			pvcKey := fmt.Sprintf("pvc-%s-%s", pvcReq.Namespace, pvcReq.Name)
			pvName, hasPV := pvcToPV[pvcKey]

			if !hasPV {
				// PVC not bound or missing
				resultMutex.Lock()
				result[pvcKey] = &VolumeDetails{
					PVCName:   pvcReq.Name,
					Namespace: pvcReq.Namespace,
					Status:    "Pending",
				}
				resultMutex.Unlock()
				return
			}

			pvKey := fmt.Sprintf("pv-%s", pvName)
			pvDataMap, hasPVData := pvData[pvKey]
			pvcDataMap, hasPVCData := pvcData[pvcKey]

			if !hasPVData || !hasPVCData {
				log.Printf("Warning: Missing data for PVC %s or PV %s", pvcKey, pvName)
				return
			}

			// Create volume details
			volumeDetails := &VolumeDetails{
				PVName:    pvName,
				PVCName:   pvcReq.Name,
				Namespace: pvcReq.Namespace,
			}

			// Extract PVC status
			if status, err := pvc.ParsePVCStatus(pvcDataMap); err == nil {
				volumeDetails.Status = status
			}

			// Extract PV details
			if err := extractPVDetails(pvDataMap, volumeDetails); err != nil {
				log.Printf("Warning: Could not extract PV details for %s: %v", pvName, err)
			}

			// Determine if this is Longhorn and add backend details
			volumeDetails.IsLonghornCSI = (volumeDetails.CSIDriver == "driver.longhorn.io")

			if volumeDetails.IsLonghornCSI && volumeDetails.VolumeHandle != "" {
				if backendDetails := vs.getLonghornVolumeDetails(volumeDetails.VolumeHandle); backendDetails != nil {
					volumeDetails.BackendDetails = backendDetails
				}
			}

			resultMutex.Lock()
			result[pvcKey] = volumeDetails
			resultMutex.Unlock()
		}(req)
	}

	wg.Wait()
	log.Printf("Processed volume details for %d PVCs", len(result))
	return result, nil
}

// preloadLonghornData fetches all Longhorn resources once for later use
func (vs *VolumeService) preloadLonghornData() error {
	vs.mutex.Lock()
	defer vs.mutex.Unlock()

	data, err := vs.batchFetcher.BatchFetchLonghornResources()
	if err != nil {
		return err
	}

	vs.longhornData = data
	return nil
}

// getLonghornVolumeDetails gets Longhorn volume details from preloaded data
func (vs *VolumeService) getLonghornVolumeDetails(volumeName string) map[string]interface{} {
	vs.mutex.RLock()
	defer vs.mutex.RUnlock()

	if vs.longhornData == nil {
		return nil
	}

	volumesData, exists := vs.longhornData["volumes"]
	if !exists {
		return nil
	}

	items, ok := volumesData["items"].([]interface{})
	if !ok {
		return nil
	}

	for _, item := range items {
		volumeMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		metadata, ok := volumeMap["metadata"].(map[string]interface{})
		if !ok {
			continue
		}

		name, ok := metadata["name"].(string)
		if !ok || name != volumeName {
			continue
		}

		return volumeMap
	}

	return nil
}

// GetReplicaDetails gets replica details from preloaded data
func (vs *VolumeService) GetReplicaDetails(volumeName string) []map[string]interface{} {
	vs.mutex.RLock()
	defer vs.mutex.RUnlock()

	if vs.longhornData == nil {
		return nil
	}

	replicasData, exists := vs.longhornData["replicas"]
	if !exists {
		return nil
	}

	items, ok := replicasData["items"].([]interface{})
	if !ok {
		return nil
	}

	var relatedReplicas []map[string]interface{}
	for _, item := range items {
		replicaMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		spec, ok := replicaMap["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		replicaVolumeName, ok := spec["volumeName"].(string)
		if !ok || replicaVolumeName != volumeName {
			continue
		}

		relatedReplicas = append(relatedReplicas, replicaMap)
	}

	return relatedReplicas
}

// GetEngineDetails gets engine details from preloaded data
func (vs *VolumeService) GetEngineDetails(volumeName string) []map[string]interface{} {
	vs.mutex.RLock()
	defer vs.mutex.RUnlock()

	if vs.longhornData == nil {
		return nil
	}

	enginesData, exists := vs.longhornData["engines"]
	if !exists {
		return nil
	}

	items, ok := enginesData["items"].([]interface{})
	if !ok {
		return nil
	}

	var relatedEngines []map[string]interface{}
	for _, item := range items {
		engineMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		spec, ok := engineMap["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		engineVolumeName, ok := spec["volumeName"].(string)
		if !ok || engineVolumeName != volumeName {
			continue
		}

		relatedEngines = append(relatedEngines, engineMap)
	}

	return relatedEngines
}

// GetPodFromVolumeBatch finds pods using specific PVCs in batch
func (vs *VolumeService) GetPodFromVolumeBatch(pvcRequests []batch.PVCRequest) (map[string]string, error) {
	// Group PVCs by namespace for efficient querying
	namespaceGroups := make(map[string][]string)
	for _, req := range pvcRequests {
		namespaceGroups[req.Namespace] = append(namespaceGroups[req.Namespace], req.Name)
	}

	result := make(map[string]string)
	var mutex sync.Mutex
	var wg sync.WaitGroup

	// Process each namespace concurrently
	for namespace, pvcNames := range namespaceGroups {
		wg.Add(1)
		go func(ns string, names []string) {
			defer wg.Done()

			pods, err := vs.client.CoreV1().Pods(ns).List(context.TODO(), metav1.ListOptions{})
			if err != nil {
				log.Printf("Warning: Could not list pods in namespace %s: %v", ns, err)
				return
			}

			// Create a map for quick PVC lookup
			pvcSet := make(map[string]bool)
			for _, name := range names {
				pvcSet[name] = true
			}

			// Find pods using these PVCs
			for _, pod := range pods.Items {
				for _, volume := range pod.Spec.Volumes {
					if volume.PersistentVolumeClaim != nil {
						pvcName := volume.PersistentVolumeClaim.ClaimName
						if pvcSet[pvcName] {
							key := fmt.Sprintf("pvc-%s-%s", ns, pvcName)
							mutex.Lock()
							result[key] = pod.Name
							mutex.Unlock()
						}
					}
				}
			}
		}(namespace, pvcNames)
	}

	wg.Wait()
	return result, nil
}
