package replicas

import (
	"context"
	"encoding/json"
	"fmt"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FindReplicaDetails retrieves replica information for a specific volume from the Kubernetes API.
// It takes a client, volume name, absolute path, namespace, and resource type.
// Returns an array of ReplicaInfo objects for the specified volume and any error encountered.
func FindReplicaDetails(client *kubernetes.Clientset, volumeName, absPath, namespace, resource string) ([]types.ReplicaInfo, error) {
	// Get raw replica data
	replicaData, err := fetchReplicaData(client, absPath, namespace, resource)
	if err != nil {
		return nil, err
	}

	// Find replicas related to the specified volume
	relatedReplicas, err := findRelatedReplicas(replicaData, volumeName)
	if err != nil {
		return nil, err
	}

	// Process and extract information from related replicas
	replicaInfos, err := processReplicaData(relatedReplicas)
	if err != nil {
		return nil, err
	}

	return replicaInfos, nil
}

// fetchReplicaData retrieves raw replica data from the Kubernetes API.
func fetchReplicaData(client *kubernetes.Clientset, absPath, namespace, resource string) (map[string]interface{}, error) {
	replicasRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get replicas: %w", err)
	}

	var replicaData map[string]interface{}
	err = json.Unmarshal(replicasRaw, &replicaData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal replica data: %w", err)
	}

	return replicaData, nil
}

// findRelatedReplicas finds replicas related to the specified volume from raw replica data.
func findRelatedReplicas(replicaData map[string]interface{}, volumeName string) ([]map[string]interface{}, error) {
	itemsRaw, ok := replicaData["items"]
	if !ok {
		return nil, fmt.Errorf("items field missing in replica data")
	}

	items, ok := itemsRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("failed to get items from replicas response")
	}

	var relatedReplicas []map[string]interface{}

	for _, item := range items {
		replica, ok := item.(map[string]interface{})
		if !ok {
			continue // Skip invalid entries
		}

		specRaw, ok := replica["spec"]
		if !ok {
			continue // Skip entries without spec
		}

		spec, ok := specRaw.(map[string]interface{})
		if !ok {
			continue // Skip entries with invalid spec
		}

		replicaVolumeNameRaw, ok := spec["volumeName"]
		if !ok {
			continue // Skip entries without volumeName
		}

		replicaVolumeName, ok := replicaVolumeNameRaw.(string)
		if !ok || replicaVolumeName != volumeName {
			continue // Skip entries with non-matching volumeName
		}

		relatedReplicas = append(relatedReplicas, replica)
	}

	return relatedReplicas, nil
}

// processReplicaData extracts information from replica data and converts it to ReplicaInfo objects.
func processReplicaData(relatedReplicas []map[string]interface{}) ([]types.ReplicaInfo, error) {
	var replicaInfos []types.ReplicaInfo

	for _, replica := range relatedReplicas {
		replicaInfo, err := extractReplicaInfo(replica)
		if err != nil {
			// Log the error but continue processing other replicas
			fmt.Printf("Warning: Failed to extract replica info: %v\n", err)
			continue
		}

		replicaInfos = append(replicaInfos, replicaInfo)
	}

	return replicaInfos, nil
}

// extractReplicaInfo extracts information from a single replica and creates a ReplicaInfo object.
func extractReplicaInfo(replica map[string]interface{}) (types.ReplicaInfo, error) {
	// Extract metadata
	metadataRaw, ok := replica["metadata"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("metadata field missing")
	}

	metadata, ok := metadataRaw.(map[string]interface{})
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("metadata is not an object")
	}

	// Extract spec
	specRaw, ok := replica["spec"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("spec field missing")
	}

	spec, ok := specRaw.(map[string]interface{})
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("spec is not an object")
	}

	// Extract status
	statusRaw, ok := replica["status"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("status field missing")
	}

	status, ok := statusRaw.(map[string]interface{})
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("status is not an object")
	}

	// Extract name
	nameRaw, ok := metadata["name"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("name field missing in metadata")
	}

	name, ok := nameRaw.(string)
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("name is not a string")
	}

	// Extract owner reference
	ownerRefName := extractOwnerReferenceName(metadata)

	// Extract nodeID
	nodeIDRaw, ok := spec["nodeID"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("nodeID field missing in spec")
	}

	nodeID, ok := nodeIDRaw.(string)
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("nodeID is not a string")
	}

	// Extract active status
	activeRaw, ok := spec["active"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("active field missing in spec")
	}

	active, ok := activeRaw.(bool)
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("active is not a boolean")
	}

	// Extract engine name
	engineNameRaw, ok := spec["engineName"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("engineName field missing in spec")
	}

	engineName, ok := engineNameRaw.(string)
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("engineName is not a string")
	}

	// Extract current state
	currentStateRaw, ok := status["currentState"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("currentState field missing in status")
	}

	currentState, ok := currentStateRaw.(string)
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("currentState is not a string")
	}

	// Extract started status
	startedRaw, ok := status["started"]
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("started field missing in status")
	}

	started, ok := startedRaw.(bool)
	if !ok {
		return types.ReplicaInfo{}, fmt.Errorf("started is not a boolean")
	}

	// Create and return the replica info
	replicaInfo := types.ReplicaInfo{
		Name:           name,
		SpecVolumeName: spec["volumeName"].(string), // Already validated in findRelatedReplicas
		NodeID:         nodeID,
		Active:         active,
		EngineName:     engineName,
		CurrentState:   currentState,
		Started:        started,
		OwnerRefName:   ownerRefName,
	}

	return replicaInfo, nil
}

// extractOwnerReferenceName extracts the owner reference name from metadata.
func extractOwnerReferenceName(metadata map[string]interface{}) string {
	ownerRefName := ""

	// Extract owner references if available
	ownerRefsRaw, ok := metadata["ownerReferences"]
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
