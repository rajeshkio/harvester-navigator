package volume

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/rk280392/harvesterNavigator/internal/services/pvc"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// StorageBackendInfo contains information about detected storage backends
type StorageBackendInfo struct {
	Name         string            `json:"name"`
	CSIDriver    string            `json:"csiDriver"`
	IsDefault    bool              `json:"isDefault"`
	VolumeCount  int               `json:"volumeCount"`
	StorageClass map[string]string `json:"storageClass"`
}

// VolumeDetails contains comprehensive volume information
type VolumeDetails struct {
	PVName         string                 `json:"pvName"`
	PVCName        string                 `json:"pvcName"`
	Namespace      string                 `json:"namespace"`
	StorageClass   string                 `json:"storageClass"`
	CSIDriver      string                 `json:"csiDriver"`
	VolumeHandle   string                 `json:"volumeHandle"`
	Capacity       string                 `json:"capacity"`
	AccessModes    []string               `json:"accessModes"`
	Status         string                 `json:"status"`
	IsLonghornCSI  bool                   `json:"isLonghornCSI"`
	BackendDetails map[string]interface{} `json:"backendDetails,omitempty"`
}

// DiscoverStorageBackends finds all available storage backends in the cluster
func DiscoverStorageBackends(client *kubernetes.Clientset) ([]StorageBackendInfo, error) {
	storageClasses, err := client.StorageV1().StorageClasses().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list storage classes: %w", err)
	}

	backends := make(map[string]*StorageBackendInfo)

	for _, sc := range storageClasses.Items {
		isDefault := false
		if sc.Annotations != nil {
			if sc.Annotations["storageclass.kubernetes.io/is-default-class"] == "true" {
				isDefault = true
			}
		}

		if backend, exists := backends[sc.Provisioner]; exists {
			backend.VolumeCount++
			if isDefault {
				backend.IsDefault = true
			}
		} else {
			backends[sc.Provisioner] = &StorageBackendInfo{
				Name:         sc.Name,
				CSIDriver:    sc.Provisioner,
				IsDefault:    isDefault,
				VolumeCount:  1,
				StorageClass: make(map[string]string),
			}
		}

		backends[sc.Provisioner].StorageClass[sc.Name] = sc.Provisioner
	}

	result := make([]StorageBackendInfo, 0, len(backends))
	for _, backend := range backends {
		result = append(result, *backend)
	}

	//	log.Printf("Discovered %d storage backends: %v", len(result), getDriverNames(result))
	return result, nil
}

// Universal volume detection that works with any CSI driver
func FetchVolumeDetails(client *kubernetes.Clientset, pvcName, namespace string) (*VolumeDetails, error) {
	log.Printf("Fetching volume details for PVC %s in namespace %s", pvcName, namespace)

	// Step 1: Get PVC to find the bound PV
	pvcData, err := pvc.FetchPVCData(client, pvcName, "/api/v1", namespace, "persistentvolumeclaims")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PVC %s: %w", pvcName, err)
	}

	pvName, err := pvc.ParsePVCSpec(pvcData)
	if err != nil {
		return nil, fmt.Errorf("failed to get PV name from PVC %s: %w", pvcName, err)
	}

	pvcStatus, err := pvc.ParsePVCStatus(pvcData)
	if err != nil {
		return nil, fmt.Errorf("failed to get PVC status: %w", err)
	}

	// Step 2: Get PV details to determine CSI driver
	pvData, err := fetchPVData(client, pvName)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PV %s: %w", pvName, err)
	}

	volumeDetails := &VolumeDetails{
		PVName:    pvName,
		PVCName:   pvcName,
		Namespace: namespace,
		Status:    pvcStatus,
	}

	err = extractPVDetails(pvData, volumeDetails)
	if err != nil {
		return nil, fmt.Errorf("failed to extract PV details: %w", err)
	}

	// Determine if this is a Longhorn volume and fetch backend-specific details
	volumeDetails.IsLonghornCSI = (volumeDetails.CSIDriver == "driver.longhorn.io")

	if volumeDetails.IsLonghornCSI {
		longhornDetails, err := fetchLonghornVolumeDetails(client, volumeDetails.VolumeHandle)
		if err != nil {
			log.Printf("Warning: Could not fetch Longhorn details for volume %s: %v", volumeDetails.VolumeHandle, err)
		} else {
			volumeDetails.BackendDetails = longhornDetails
		}
	} else {
		log.Printf("Volume %s uses CSI driver %s (not Longhorn), skipping Longhorn-specific queries",
			pvName, volumeDetails.CSIDriver)
	}

	return volumeDetails, nil
}

// fetchPVData gets persistent volume data from Kubernetes API
func fetchPVData(client *kubernetes.Clientset, pvName string) (map[string]interface{}, error) {
	pvRaw, err := client.RESTClient().Get().
		AbsPath("/api/v1").
		Resource("persistentvolumes").
		Name(pvName).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get PV data: %w", err)
	}

	var pvData map[string]interface{}
	err = json.Unmarshal(pvRaw, &pvData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal PV data: %w", err)
	}

	return pvData, nil
}

// extractPVDetails extracts relevant information from PV data
func extractPVDetails(pvData map[string]interface{}, volumeDetails *VolumeDetails) error {
	if spec, ok := pvData["spec"].(map[string]interface{}); ok {
		if storageClassName, ok := spec["storageClassName"].(string); ok {
			volumeDetails.StorageClass = storageClassName
		}

		if capacity, ok := spec["capacity"].(map[string]interface{}); ok {
			if storage, ok := capacity["storage"].(string); ok {
				volumeDetails.Capacity = storage
			}
		}

		if accessModes, ok := spec["accessModes"].([]interface{}); ok {
			modes := make([]string, len(accessModes))
			for i, mode := range accessModes {
				if modeStr, ok := mode.(string); ok {
					modes[i] = modeStr
				}
			}
			volumeDetails.AccessModes = modes
		}

		if csi, ok := spec["csi"].(map[string]interface{}); ok {
			if driver, ok := csi["driver"].(string); ok {
				volumeDetails.CSIDriver = driver
			}
			if volumeHandle, ok := csi["volumeHandle"].(string); ok {
				volumeDetails.VolumeHandle = volumeHandle
			}
		}
	}

	return nil
}

// fetchLonghornVolumeDetails attempts to get additional details from Longhorn API
func fetchLonghornVolumeDetails(client *kubernetes.Clientset, volumeName string) (map[string]interface{}, error) {
	volumeRaw, err := client.RESTClient().Get().
		AbsPath("apis/longhorn.io/v1beta2").
		Namespace("longhorn-system").
		Resource("volumes").
		Name(volumeName).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get Longhorn volume details: %w", err)
	}

	var volumeData map[string]interface{}
	err = json.Unmarshal(volumeRaw, &volumeData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal Longhorn volume data: %w", err)
	}

	return volumeData, nil
}

// GetPodFromVolume works with any CSI driver, with fallback to Longhorn-specific method
func GetPodFromVolume(client *kubernetes.Clientset, volumeDetails *VolumeDetails) (string, error) {
	if !volumeDetails.IsLonghornCSI {
		return getPodFromPVC(client, volumeDetails.PVCName, volumeDetails.Namespace)
	}

	if volumeDetails.BackendDetails != nil {
		return getPodFromLonghornBackend(volumeDetails.BackendDetails)
	}

	return getPodFromPVC(client, volumeDetails.PVCName, volumeDetails.Namespace)
}

// getPodFromPVC finds pods that are using a specific PVC
func getPodFromPVC(client *kubernetes.Clientset, pvcName, namespace string) (string, error) {
	pods, err := client.CoreV1().Pods(namespace).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list pods: %w", err)
	}

	for _, pod := range pods.Items {
		for _, volume := range pod.Spec.Volumes {
			if volume.PersistentVolumeClaim != nil && volume.PersistentVolumeClaim.ClaimName == pvcName {
				return pod.Name, nil
			}
		}
	}

	return "", fmt.Errorf("no pod found using PVC %s", pvcName)
}

// getPodFromLonghornBackend extracts pod information from Longhorn backend details
func getPodFromLonghornBackend(backendDetails map[string]interface{}) (string, error) {
	if backendDetails == nil {
		return "", fmt.Errorf("backend details are nil")
	}
	
	// Try to extract pod name from Longhorn volume annotations or labels
	if podName, exists := backendDetails["attachedTo"]; exists {
		if podStr, ok := podName.(string); ok && podStr != "" {
			return podStr, nil
		}
	}
	
	return "", fmt.Errorf("no pod information found in backend details")
}

// Helper function to get driver names for logging
func getDriverNames(backends []StorageBackendInfo) []string {
	names := make([]string, len(backends))
	for i, backend := range backends {
		names[i] = backend.CSIDriver
	}
	return names
}
