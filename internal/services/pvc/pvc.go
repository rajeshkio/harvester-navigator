package pvc

import (
	"context"
	"encoding/json"
	"fmt"

	"k8s.io/client-go/kubernetes"
)

// FetchPVCData retrieves Persistent Volume Claim (PVC) data from the Kubernetes API.
// It takes a client, PVC name, absolute path, namespace, and resource type.
// Returns the PVC data as a map and any error encountered.
func FetchPVCData(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
	pvcRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get PVC data: %w", err)
	}

	var pvcData map[string]interface{}
	err = json.Unmarshal(pvcRaw, &pvcData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal PVC data: %w", err)
	}
	return pvcData, nil
}

// ParsePVCSpec extracts the volume name from PVC spec data.
// It returns the volume name and any error encountered during extraction.
func ParsePVCSpec(pvcData map[string]interface{}) (string, error) {
	if pvcData == nil {
		return "", fmt.Errorf("PVC data is nil")
	}

	specRaw, ok := pvcData["spec"]
	if !ok {
		return "", fmt.Errorf("spec field missing in PVC data")
	}

	pvcSpec, ok := specRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("spec field is not an object")
	}

	volumeNameRaw, ok := pvcSpec["volumeName"]
	if !ok {
		return "", fmt.Errorf("volumeName field missing in PVC spec")
	}

	volumeName, ok := volumeNameRaw.(string)
	if !ok {
		return "", fmt.Errorf("volumeName is not a string")
	}

	if volumeName == "" {
		return "", fmt.Errorf("volumeName is empty")
	}

	return volumeName, nil
}

// ParsePVCStatus extracts the status phase from PVC status data.
// It returns the status phase string and any error encountered during extraction.
func ParsePVCStatus(pvcData map[string]interface{}) (string, error) {
	if pvcData == nil {
		return "", fmt.Errorf("PVC data is nil")
	}

	statusRaw, ok := pvcData["status"]
	if !ok {
		return "", fmt.Errorf("status field missing in PVC data")
	}

	pvcStatus, ok := statusRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("status field is not an object")
	}

	phaseRaw, ok := pvcStatus["phase"]
	if !ok {
		return "", fmt.Errorf("phase field missing in PVC status")
	}

	phase, ok := phaseRaw.(string)
	if !ok {
		return "", fmt.Errorf("phase is not a string")
	}

	return phase, nil
}
