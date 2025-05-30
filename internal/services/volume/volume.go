package volume

import (
	"context"
	"encoding/json"
	"fmt"

	"k8s.io/client-go/kubernetes"
)

// FetchVolumeDetails retrieves volume information from the Kubernetes API.
// It takes a client, volume name, absolute path, namespace, and resource type.
// Returns the volume data as a map and any error encountered.
func FetchVolumeDetails(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
	volumeRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get volume details: %w", err)
	}

	var volumeData map[string]interface{}
	err = json.Unmarshal(volumeRaw, &volumeData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal volume details: %w", err)
	}

	return volumeData, nil
}

// ParseVolumeSpec extracts the node ID from volume spec data.
// It returns the node ID and any error encountered during extraction.
func ParseVolumeSpec(volumeData map[string]interface{}) (string, error) {
	if volumeData == nil {
		return "", fmt.Errorf("volume data is nil")
	}

	specRaw, ok := volumeData["spec"]
	if !ok {
		return "", fmt.Errorf("spec field missing in volume data")
	}

	spec, ok := specRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("spec is not an object")
	}

	nodeIDRaw, ok := spec["nodeID"]
	if !ok {
		return "", fmt.Errorf("nodeID field missing in volume spec")
	}

	nodeID, ok := nodeIDRaw.(string)
	if !ok {
		return "", fmt.Errorf("nodeID is not a string")
	}

	return nodeID, nil
}

// GetPodFromVolume extracts the pod name associated with a volume.
// It navigates through the volume's Kubernetes status to find the pod name.
// Returns the pod name and any error encountered.
func GetPodFromVolume(volumeData map[string]interface{}) (string, error) {
	if volumeData == nil {
		return "", fmt.Errorf("volume data is nil")
	}

	// Extract volume status
	statusRaw, ok := volumeData["status"]
	if !ok {
		return "", fmt.Errorf("status field missing in volume data")
	}

	status, ok := statusRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("status is not an object")
	}

	// Extract Kubernetes status
	kubernetesStatusRaw, ok := status["kubernetesStatus"]
	if !ok {
		return "", fmt.Errorf("kubernetesStatus field missing in volume status")
	}

	kubernetesStatus, ok := kubernetesStatusRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("kubernetesStatus is not an object")
	}

	// Extract workloads status
	workloadsStatusRaw, ok := kubernetesStatus["workloadsStatus"]
	if !ok {
		return "", fmt.Errorf("workloadsStatus field missing in kubernetesStatus")
	}

	workloadsStatus, ok := workloadsStatusRaw.([]interface{})
	if !ok {
		return "", fmt.Errorf("workloadsStatus is not an array")
	}

	// Check if there are any workloads
	if len(workloadsStatus) == 0 {
		return "", fmt.Errorf("no workloads found for this volume")
	}

	// Extract the first workload
	firstWorkloadRaw := workloadsStatus[0]
	firstWorkload, ok := firstWorkloadRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("workload entry is not an object")
	}

	// Extract pod name
	podNameRaw, ok := firstWorkload["podName"]
	if !ok {
		return "", fmt.Errorf("podName field missing in workload")
	}

	podName, ok := podNameRaw.(string)
	if !ok {
		return "", fmt.Errorf("podName is not a string")
	}

	if podName == "" {
		return "", fmt.Errorf("podName is empty")
	}

	return podName, nil
}
