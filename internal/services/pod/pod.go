package pod

import (
	"context"
	"encoding/json"
	"fmt"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FetchPodDetails retrieves pod information from the Kubernetes API.
// It takes a client, pod name, absolute path, namespace, and resource type.
// Returns the pod data as a map and any error encountered.
func FetchPodDetails(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
	podRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get pod details: %w", err)
	}

	var podData map[string]interface{}
	err = json.Unmarshal(podRaw, &podData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal pod details: %w", err)
	}
	return podData, nil
}

// ParsePodData extracts relevant information from pod data and returns it as PodInfo objects.
// It processes metadata, spec, and status to extract owner references, node name, and pod status.
func ParsePodData(podData map[string]interface{}) ([]types.PodInfo, error) {
	if podData == nil {
		return nil, fmt.Errorf("pod data is nil")
	}

	var podInfos []types.PodInfo

	// Extract metadata
	metadataRaw, ok := podData["metadata"]
	if !ok {
		return nil, fmt.Errorf("metadata field missing in pod data")
	}

	podMetadata, ok := metadataRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("metadata field is not an object")
	}

	// Extract spec
	specRaw, ok := podData["spec"]
	if !ok {
		return nil, fmt.Errorf("spec field missing in pod data")
	}

	podSpec, ok := specRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("spec field is not an object")
	}

	// Extract status
	statusRaw, ok := podData["status"]
	if !ok {
		return nil, fmt.Errorf("status field missing in pod data")
	}

	podStatus, ok := statusRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("status field is not an object")
	}

	// Extract owner reference name (VMI name)
	ownerRefName := extractOwnerReferenceName(podMetadata)

	// Extract node name
	nodeName, err := extractNodeName(podSpec)
	if err != nil {
		return nil, err
	}

	// Extract pod status
	status, err := extractPodStatus(podStatus)
	if err != nil {
		return nil, err
	}

	// Create and add pod info
	podInfo := types.PodInfo{
		VMI:    ownerRefName,
		NodeID: nodeName,
		Status: status,
	}
	podInfos = append(podInfos, podInfo)

	return podInfos, nil
}

// extractOwnerReferenceName extracts the owner reference name from pod metadata.
// This is typically the name of the VMI that owns this pod.
func extractOwnerReferenceName(podMetadata map[string]interface{}) string {
	ownerRefName := ""

	ownerRefsRaw, ok := podMetadata["ownerReferences"]
	if !ok {
		return ownerRefName
	}

	ownerRefs, ok := ownerRefsRaw.([]interface{})
	if !ok || len(ownerRefs) == 0 {
		return ownerRefName
	}

	ownerRefRaw := ownerRefs[0]
	ownerRef, ok := ownerRefRaw.(map[string]interface{})
	if !ok {
		return ownerRefName
	}

	nameRaw, ok := ownerRef["name"]
	if !ok {
		return ownerRefName
	}

	name, ok := nameRaw.(string)
	if ok {
		ownerRefName = name
	}

	return ownerRefName
}

// extractNodeName extracts the node name from pod spec.
// Returns the node name and error if node name could not be extracted.
func extractNodeName(podSpec map[string]interface{}) (string, error) {
	nodeNameRaw, ok := podSpec["nodeName"]
	if !ok {
		return "", fmt.Errorf("nodeName field missing in pod spec")
	}

	nodeName, ok := nodeNameRaw.(string)
	if !ok {
		return "", fmt.Errorf("nodeName is not a string")
	}

	return nodeName, nil
}

// extractPodStatus extracts the pod phase from pod status.
// Returns the pod phase and error if status could not be extracted.
func extractPodStatus(podStatus map[string]interface{}) (string, error) {
	phaseRaw, ok := podStatus["phase"]
	if !ok {
		return "", fmt.Errorf("phase field missing in pod status")
	}

	phase, ok := phaseRaw.(string)
	if !ok {
		return "", fmt.Errorf("phase is not a string")
	}

	return phase, nil
}
