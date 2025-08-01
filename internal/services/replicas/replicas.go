package replicas

import (
	"context"
	"encoding/json"
	"fmt"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FindReplicaDetails retrieves replica information for a specific volume.
func FindReplicaDetails(client *kubernetes.Clientset, volumeName, absPath, namespace, resource string) ([]types.ReplicaInfo, error) {
	replicaData, err := fetchReplicaData(client, absPath, namespace, resource)
	if err != nil {
		return nil, err
	}

	relatedReplicas, err := findRelatedReplicas(replicaData, volumeName)
	if err != nil {
		return nil, err
	}

	var replicaInfos []types.ReplicaInfo
	for _, replica := range relatedReplicas {
		replicaInfo, err := extractReplicaInfo(replica)
		if err != nil {
			fmt.Printf("Warning: Failed to extract replica info for volume %s: %v\n", volumeName, err)
			continue
		}
		replicaInfos = append(replicaInfos, replicaInfo)
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
	if err = json.Unmarshal(replicasRaw, &replicaData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal replica data: %w", err)
	}
	return replicaData, nil
}

// findRelatedReplicas finds replicas related to the specified volume
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
			continue
		}

		spec, ok := replica["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		replicaVolumeName, ok := spec["volumeName"].(string)
		if !ok || replicaVolumeName != volumeName {
			continue
		}
		relatedReplicas = append(relatedReplicas, replica)
	}
	return relatedReplicas, nil
}

// extractReplicaInfo extracts all required fields from a single replica object.
func extractReplicaInfo(replica map[string]interface{}) (types.ReplicaInfo, error) {
	return ExtractReplicaInfoFromMap(replica)
}

// ExtractReplicaInfoFromMap extracts replica info from a map (for batch processing)
func ExtractReplicaInfoFromMap(replica map[string]interface{}) (types.ReplicaInfo, error) {
	info := types.ReplicaInfo{}

	// Extract metadata
	metadata, ok := replica["metadata"].(map[string]interface{})
	if !ok {
		return info, fmt.Errorf("metadata field missing")
	}
	info.Name, _ = metadata["name"].(string)

	// Extract spec fields
	spec, ok := replica["spec"].(map[string]interface{})
	if !ok {
		return info, fmt.Errorf("spec field missing")
	}

	info.NodeID, _ = spec["nodeID"].(string)
	info.Active, _ = spec["active"].(bool)
	info.EngineName, _ = spec["engineName"].(string)
	info.DataEngine, _ = spec["dataEngine"].(string)
	info.DiskID, _ = spec["diskID"].(string)
	info.Image, _ = spec["image"].(string)

	// Extract status fields - make status optional since it might be missing
	if status, ok := replica["status"].(map[string]interface{}); ok {
		info.CurrentState, _ = status["currentState"].(string)
		info.Started, _ = status["started"].(bool)
		info.InstanceManager, _ = status["instanceManagerName"].(string)

		// Extract network connectivity info
		info.StorageIP, _ = status["storageIP"].(string)
		info.IP, _ = status["ip"].(string)

		// Extract port - handle both string and numeric formats
		if portRaw, exists := status["port"]; exists {
			if portStr, ok := portRaw.(string); ok {
				info.Port = portStr
			} else if portNum, ok := portRaw.(float64); ok {
				info.Port = fmt.Sprintf("%.0f", portNum)
			}
		}
	}

	return info, nil
}
