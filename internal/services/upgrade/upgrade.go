package upgrade

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	models "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FetchLatestUpgrade retrieves the most recent Harvester upgrade information
func FetchLatestUpgrade(client *kubernetes.Clientset) (*models.UpgradeInfo, error) {
	// Get all upgrades from harvester-system namespace
	upgradesRaw, err := client.RESTClient().Get().
		AbsPath("/apis/harvesterhci.io/v1beta1").
		Namespace("harvester-system").
		Resource("upgrades").
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get upgrades: %w", err)
	}

	var upgradesList map[string]interface{}
	if err := json.Unmarshal(upgradesRaw, &upgradesList); err != nil {
		return nil, fmt.Errorf("failed to unmarshal upgrades list: %w", err)
	}

	items, ok := upgradesList["items"].([]interface{})
	if !ok || len(items) == 0 {
		return nil, fmt.Errorf("no upgrades found")
	}

	var latestUpgrade map[string]interface{}
	var latestTime time.Time

	for _, item := range items {
		upgrade, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		// Extract creation timestamp
		metadata, ok := upgrade["metadata"].(map[string]interface{})
		if !ok {
			continue
		}

		creationTimestampStr, ok := metadata["creationTimestamp"].(string)
		if !ok {
			continue
		}

		creationTime, err := time.Parse(time.RFC3339, creationTimestampStr)
		if err != nil {
			continue
		}

		if latestUpgrade == nil || creationTime.After(latestTime) {
			latestUpgrade = upgrade
			latestTime = creationTime
		}
	}

	if latestUpgrade == nil {
		return nil, fmt.Errorf("no valid upgrades found")
	}

	// Parse the latest upgrade
	return parseUpgradeInfo(latestUpgrade)
}

// parseUpgradeInfo extracts upgrade information from the raw upgrade object
func parseUpgradeInfo(upgrade map[string]interface{}) (*models.UpgradeInfo, error) {
	upgradeInfo := &models.UpgradeInfo{
		NodeStatuses: make(map[string]string),
	}

	// Extract metadata
	metadata, ok := upgrade["metadata"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid metadata in upgrade object")
	}

	// Get creation timestamp
	if creationTimestampStr, ok := metadata["creationTimestamp"].(string); ok {
		if creationTime, err := time.Parse(time.RFC3339, creationTimestampStr); err == nil {
			upgradeInfo.UpgradeTime = creationTime
		}
	}

	// Extract spec information
	if spec, ok := upgrade["spec"].(map[string]interface{}); ok {
		if version, ok := spec["version"].(string); ok {
			upgradeInfo.Version = version
		}
	}

	// Extract status information
	if status, ok := upgrade["status"].(map[string]interface{}); ok {
		// Get previous version
		if previousVersion, ok := status["previousVersion"].(string); ok {
			upgradeInfo.PreviousVersion = previousVersion
		}

		// Get node statuses
		if nodeStatuses, ok := status["nodeStatuses"].(map[string]interface{}); ok {
			for nodeName, nodeInfo := range nodeStatuses {
				if nodeInfoMap, ok := nodeInfo.(map[string]interface{}); ok {
					if state, ok := nodeInfoMap["state"].(string); ok {
						upgradeInfo.NodeStatuses[nodeName] = state
					}
				}
			}
		}
	}

	// Extract labels to get upgrade state
	if labels, ok := metadata["labels"].(map[string]interface{}); ok {
		if upgradeState, ok := labels["harvesterhci.io/upgradeState"].(string); ok {
			upgradeInfo.State = upgradeState
		}
	}

	// If state is not available from labels, try to determine from conditions
	if upgradeInfo.State == "" {
		if status, ok := upgrade["status"].(map[string]interface{}); ok {
			if conditions, ok := status["conditions"].([]interface{}); ok {
				fmt.Printf("conditions: %v", conditions...)
				// Check if all conditions are successful
				allSuccess := true
				hasConditions := false

				for _, condRaw := range conditions {
					if cond, ok := condRaw.(map[string]interface{}); ok {
						hasConditions = true
						if status, ok := cond["status"].(string); ok && status != "True" {
							allSuccess = false
							break
						}
					}
				}

				if hasConditions {
					if allSuccess {
						upgradeInfo.State = "Succeeded"
					} else {
						upgradeInfo.State = "Failed"
					}
				}
			}
		}
	}

	// Default state if none found
	if upgradeInfo.State == "" {
		upgradeInfo.State = "Unknown"
	}

	return upgradeInfo, nil
}
