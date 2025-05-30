package engine

import (
	"context"
	"encoding/json"
	"fmt"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FindEngineDetails retrieves engine information associated with a specific volume.
// It fetches all engines from the specified namespace and filters those that belong
// to the given volume name.
func FindEngineDetails(client *kubernetes.Clientset, volumeName, absPath, namespace, resource string) ([]types.EngineInfo, error) {
	// Fetch raw engine data
	engines, err := fetchEngineData(client, absPath, namespace, resource)
	if err != nil {
		return nil, err
	}

	// Process engines data to find those associated with the volume
	engineInfos, err := processEngineData(engines, volumeName)
	if err != nil {
		return nil, err
	}

	if len(engineInfos) == 0 {
		return nil, fmt.Errorf("no engines found for volume: %s", volumeName)
	}

	return engineInfos, nil
}

// fetchEngineData retrieves raw engine data from the Kubernetes API
func fetchEngineData(client *kubernetes.Clientset, absPath, namespace, resource string) (map[string]interface{}, error) {
	// Get all engines
	enginesRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get engines: %w", err)
	}

	var engineData map[string]interface{}
	err = json.Unmarshal(enginesRaw, &engineData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal engines data: %w", err)
	}

	return engineData, nil
}

// processEngineData processes raw engine data and extracts engines for the given volume
func processEngineData(engineData map[string]interface{}, volumeName string) ([]types.EngineInfo, error) {
	items, ok := engineData["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("failed to get items from engines response")
	}

	var engineInfos []types.EngineInfo

	// Loop through all engines and find the ones for our volume
	for _, item := range items {
		engine, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		// Skip engines that don't match our volume
		engineVolumeName, ok := getEngineVolumeName(engine)
		if !ok || engineVolumeName != volumeName {
			continue
		}

		// Get engine name
		engineName, ok := getEngineMetadataName(engine)
		if !ok {
			continue
		}

		// Create and populate engine info
		engineInfo := createEngineInfo(engine, engineName)
		engineInfos = append(engineInfos, engineInfo)
	}

	return engineInfos, nil
}

// getEngineVolumeName extracts the volume name from an engine
func getEngineVolumeName(engine map[string]interface{}) (string, bool) {
	spec, ok := engine["spec"].(map[string]interface{})
	if !ok {
		return "", false
	}

	volumeName, ok := spec["volumeName"].(string)
	return volumeName, ok
}

// getEngineMetadataName extracts the engine name from its metadata
func getEngineMetadataName(engine map[string]interface{}) (string, bool) {
	metadata, ok := engine["metadata"].(map[string]interface{})
	if !ok {
		return "", false
	}

	name, ok := metadata["name"].(string)
	return name, ok
}

// createEngineInfo creates an EngineInfo object from engine data
func createEngineInfo(engine map[string]interface{}, engineName string) types.EngineInfo {
	engineInfo := types.EngineInfo{
		Name: engineName,
		// Initialize with default values
		Active:       false,
		Started:      false,
		CurrentState: "unknown",
		NodeID:       "",
		Snapshots:    map[string]*types.SnapshotInfo{},
	}

	// Extract info from spec
	if spec, ok := engine["spec"].(map[string]interface{}); ok {
		if active, ok := spec["active"].(bool); ok {
			engineInfo.Active = active
		}

		if nodeID, ok := spec["nodeID"].(string); ok {
			engineInfo.NodeID = nodeID
		}
	}

	// Extract info from status
	if status, ok := engine["status"].(map[string]interface{}); ok {
		if state, ok := status["currentState"].(string); ok {
			engineInfo.CurrentState = state
		}

		if started, ok := status["started"].(bool); ok {
			engineInfo.Started = started
		}

		// Process snapshots if needed
		// Uncomment and use this if snapshots are needed
		/*
			if snapshots, ok := status["snapshots"].(map[string]interface{}); ok {
				engineInfo.Snapshots = processSnapshots(snapshots)
			}
		*/
	}

	return engineInfo
}

// processSnapshots processes the snapshot data from an engine
// Uncomment and use this if snapshots are needed
/*
func processSnapshots(snapshots map[string]interface{}) map[string]types.SnapshotInfo {
	result := make(map[string]types.SnapshotInfo)

	for snapID, snapData := range snapshots {
		snapshot, ok := snapData.(map[string]interface{})
		if !ok {
			continue
		}

		// Initialize snapshot info
		snapshotInfo := types.SnapshotInfo{
			Name:     snapID,
			Children: make(map[string]bool),
			Labels:   make(map[string]string),
		}

		// Extract fields
		if parent, ok := snapshot["parent"].(string); ok {
			snapshotInfo.Parent = parent
		}

		if created, ok := snapshot["created"].(string); ok {
			snapshotInfo.Created = created
		}

		if size, ok := snapshot["size"].(string); ok {
			snapshotInfo.Size = size
		}

		if userCreated, ok := snapshot["usercreated"].(bool); ok {
			snapshotInfo.UserCreated = userCreated
		}

		if removed, ok := snapshot["removed"].(bool); ok {
			snapshotInfo.Removed = removed
		}

		// Extract children
		if children, ok := snapshot["children"].(map[string]interface{}); ok {
			for child, val := range children {
				if boolVal, ok := val.(bool); ok && boolVal {
					snapshotInfo.Children[child] = true
				}
			}
		}

		// Extract labels
		if labels, ok := snapshot["labels"].(map[string]interface{}); ok {
			for key, val := range labels {
				if strVal, ok := val.(string); ok {
					snapshotInfo.Labels[key] = strVal
				}
			}
		}

		result[snapID] = snapshotInfo
	}

	return result
}
*/
