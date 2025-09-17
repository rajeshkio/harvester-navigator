package vmim

import (
	"context"
	"encoding/json"
	"fmt"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FetchVMIMData retrieves Virtual Machine Instance Migrations (VMIM) data from the Kubernetes API.
// It takes a client, VMIM name, absolute path, namespace, and resource type.
// Returns the VMIM data as a map and any error encountered.
func FetchVMIMData(client *kubernetes.Clientset, name, absPath, namespace, resource string) ([]map[string]interface{}, error) {
	vmimRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get VMIM data: %w", err)
	}

	var vmimData map[string]interface{}
	err = json.Unmarshal(vmimRaw, &vmimData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal VMIM data: %w", err)
	}
	itemsRaw, ok := vmimData["items"]
	if !ok {
		return []map[string]interface{}{}, nil
	}

	items, ok := itemsRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("items is not an array")
	}

	var result []map[string]interface{}
	for _, item := range items {
		if itemMap, ok := item.(map[string]interface{}); ok {
			// Check if this VMIM is for our VMI
			if targetVMI, err := extractVMINameFromVMIM(itemMap); err == nil && targetVMI == name {
				result = append(result, itemMap)
			}
		}
	}
	return result, nil
}

// ParseVMIMData extracts relevant information from VMIM data and returns it as VMIMInfo objects
func ParseVMIMData(vmimDataList []map[string]interface{}) ([]types.VMIMInfo, error) {
	var vmimInfos []types.VMIMInfo

	for _, vmimData := range vmimDataList {
		vmimInfo, err := ParseVMIMSpec(vmimData)
		if err != nil {
			continue // Skip invalid entries
		}
		vmimInfos = append(vmimInfos, vmimInfo)
	}

	return vmimInfos, nil
}

func ParseVMIMSpec(vmimData map[string]interface{}) (types.VMIMInfo, error) {
	var vmimInfo types.VMIMInfo

	statusRaw, ok := vmimData["status"]
	if ok {
		if status, ok := statusRaw.(map[string]interface{}); ok {
			// Migration state
			if migrationStateRaw, ok := status["migrationState"]; ok {
				if migrationState, ok := migrationStateRaw.(string); ok {
					vmimInfo.MigrationState = migrationState
				}
			}

			// Phase
			if phaseRaw, ok := status["phase"]; ok {
				if phase, ok := phaseRaw.(string); ok {
					vmimInfo.Phase = phase
				}
			}

			// Source node
			if sourceNodeRaw, ok := status["sourceNode"]; ok {
				if sourceNode, ok := sourceNodeRaw.(string); ok {
					vmimInfo.SourceNode = sourceNode
				}
			}

			// Target node
			if targetNodeRaw, ok := status["targetNode"]; ok {
				if targetNode, ok := targetNodeRaw.(string); ok {
					vmimInfo.TargetNode = targetNode
				}
			}

			// Migration UID and timestamps
			if migrationUIDRaw, ok := status["migrationUid"]; ok {
				if migrationUID, ok := migrationUIDRaw.(string); ok && migrationUID != "" {
					// If migration has started, extract timestamps from migration status
					if migrationRaw, ok := status["migration"]; ok {
						if migration, ok := migrationRaw.(map[string]interface{}); ok {
							if startTimeRaw, ok := migration["startTimestamp"]; ok {
								if startTime, ok := startTimeRaw.(string); ok {
									vmimInfo.StartTimestamp = startTime
								}
							}
							if endTimeRaw, ok := migration["endTimestamp"]; ok {
								if endTime, ok := endTimeRaw.(string); ok {
									vmimInfo.EndTimestamp = endTime
								}
							}
						}
					}
				}
			}
		}
	}
	return vmimInfo, nil
}

// extractVMINameFromVMIM extracts VMI name from VMIM spec
func extractVMINameFromVMIM(vmimData map[string]interface{}) (string, error) {
	specRaw, ok := vmimData["spec"]
	if !ok {
		return "", fmt.Errorf("spec field missing")
	}

	spec, ok := specRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("spec is not an object")
	}

	vmiNameRaw, ok := spec["vmiName"]
	if !ok {
		return "", fmt.Errorf("vmiName field missing")
	}

	vmiName, ok := vmiNameRaw.(string)
	if !ok {
		return "", fmt.Errorf("vmiName is not a string")
	}

	return vmiName, nil
}
