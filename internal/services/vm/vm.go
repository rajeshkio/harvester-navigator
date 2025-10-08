package vm

import (
	"context"
	"encoding/json"
	"fmt"

	models "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// Helper function for safe string extraction from map[string]interface{}
func getString(data map[string]interface{}, key string) string {
	if val, ok := data[key].(string); ok {
		return val
	}
	return ""
}

// Helper function for safe float64 extraction from map[string]interface{}
func getFloat64(data map[string]interface{}, key string) float64 {
	if val, ok := data[key].(float64); ok {
		return val
	}
	return 0
}

// FetchAllVMData retrieves all virtual machine objects from the cluster.
func FetchAllVMData(client *kubernetes.Clientset, absPath, namespace, resource string) ([]map[string]interface{}, error) {
	vmListRaw, err := client.RESTClient().Get().AbsPath(absPath).Namespace(namespace).Resource(resource).Do(context.Background()).Raw()
	if err != nil {
		return nil, fmt.Errorf("failed to get VM list: %w", err)
	}
	var vmList map[string]interface{}
	if err := json.Unmarshal(vmListRaw, &vmList); err != nil {
		return nil, fmt.Errorf("failed to unmarshal VM list: %w", err)
	}
	items, ok := vmList["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid items field in VM list response")
	}
	result := make([]map[string]interface{}, len(items))
	for i, item := range items {
		result[i], _ = item.(map[string]interface{})
	}
	return result, nil
}

// FetchAllLonghornNodes retrieves all nodes.longhorn.io objects from the cluster.
func FetchAllLonghornNodes(client *kubernetes.Clientset) ([]interface{}, error) {
	nodesRaw, err := client.RESTClient().Get().AbsPath("/apis/longhorn.io/v1beta2/namespaces/longhorn-system/nodes").Do(context.Background()).Raw()
	if err != nil {
		return nil, err
	}
	var nodeData map[string]interface{}
	if err := json.Unmarshal(nodesRaw, &nodeData); err != nil {
		return nil, err
	}
	items, ok := nodeData["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("items field not found in Longhorn node response")
	}
	return items, nil
}

// formatBytes converts bytes to a human-readable string (GB or TB).
func formatBytes(bytes float64) string {
	const (
		GB = 1024 * 1024 * 1024
		TB = GB * 1024
	)
	if bytes >= TB {
		return fmt.Sprintf("%.2f TB", bytes/TB)
	}
	return fmt.Sprintf("%.2f GB", bytes/GB)
}

// ParseLonghornNodeData parses the raw data from nodes.longhorn.io resources safely.
func ParseLonghornNodeData(nodes []interface{}) ([]models.NodeInfo, error) {
	var results []models.NodeInfo
	for _, nodeItem := range nodes {
		nodeMap, ok := nodeItem.(map[string]interface{})
		if !ok {
			continue
		}

		metadata, _ := nodeMap["metadata"].(map[string]interface{})
		nodeName := getString(metadata, "name")

		status, _ := nodeMap["status"].(map[string]interface{})

		var conditions []models.NodeCondition
		if conds, ok := status["conditions"].([]interface{}); ok {
			for _, c := range conds {
				if cond, ok := c.(map[string]interface{}); ok {
					conditions = append(conditions, models.NodeCondition{
						Type:    getString(cond, "type"),
						Status:  getString(cond, "status"),
						Message: getString(cond, "message"),
					})
				}
			}
		}

		var disks []models.DiskInfo
		if diskStatus, ok := status["diskStatus"].(map[string]interface{}); ok {
			for _, d := range diskStatus {
				if disk, ok := d.(map[string]interface{}); ok {
					isSchedulable := false
					if diskConditions, ok := disk["conditions"].([]interface{}); ok {
						for _, dc := range diskConditions {
							if diskCond, ok := dc.(map[string]interface{}); ok {
								if getString(diskCond, "type") == "Schedulable" && getString(diskCond, "status") == "True" {
									isSchedulable = true
									break
								}
							}
						}
					}

					replicas := make(map[string]int64)
					if schedReplicas, ok := disk["scheduledReplica"].(map[string]interface{}); ok {
						for name, size := range schedReplicas {
							if s, ok := size.(float64); ok {
								replicas[name] = int64(s)
							}
						}
					}

					disks = append(disks, models.DiskInfo{
						Name:              getString(disk, "diskName"),
						Path:              getString(disk, "diskPath"),
						IsSchedulable:     isSchedulable,
						StorageAvailable:  formatBytes(getFloat64(disk, "storageAvailable")),
						StorageMaximum:    formatBytes(getFloat64(disk, "storageMaximum")),
						StorageScheduled:  formatBytes(getFloat64(disk, "storageScheduled")),
						ScheduledReplicas: replicas,
					})
				}
			}
		}

		results = append(results, models.NodeInfo{
			Name:       nodeName,
			Conditions: conditions,
			Disks:      disks,
		})
	}
	return results, nil
}

// ParseVMMetaData extracts metadata and status from a VM object.
func ParseVMMetaData(vmData map[string]interface{}, vmInfo *models.VMInfo) error {
	metadata, ok := vmData["metadata"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("metadata field missing")
	}

	// Extract finalizers
	if finalizers, ok := metadata["finalizers"].([]interface{}); ok {
		for _, f := range finalizers {
			if finalizerStr, ok := f.(string); ok {
				vmInfo.Finalizers = append(vmInfo.Finalizers, finalizerStr)
			}
		}
	}

	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Extract removed PVCs annotation
	if removedPVCs, ok := annotations["harvesterhci.io/removedPersistentVolumeClaims"].(string); ok {
		vmInfo.RemovedPVCs = removedPVCs
	}

	// Try to get PVC name from volumeClaimTemplates annotation first
	if templateStr, ok := annotations["harvesterhci.io/volumeClaimTemplates"].(string); ok {
		var templates []map[string]interface{}
		if json.Unmarshal([]byte(templateStr), &templates) == nil && len(templates) > 0 {
			tmplMeta, _ := templates[0]["metadata"].(map[string]interface{})
			vmInfo.ClaimNames, _ = tmplMeta["name"].(string)

			tmplAnns, _ := tmplMeta["annotations"].(map[string]interface{})
			vmInfo.ImageId, _ = tmplAnns["harvesterhci.io/imageId"].(string)

			tmplSpec, _ := templates[0]["spec"].(map[string]interface{})
			vmInfo.StorageClass, _ = tmplSpec["storageClassName"].(string)
		}
	}

	// If no volumeClaimTemplates, try to extract first PVC from spec.template.spec.volumes
	if vmInfo.ClaimNames == "" {
		if spec, ok := vmData["spec"].(map[string]interface{}); ok {
			if template, ok := spec["template"].(map[string]interface{}); ok {
				if templateSpec, ok := template["spec"].(map[string]interface{}); ok {
					if volumes, ok := templateSpec["volumes"].([]interface{}); ok {
						for _, vol := range volumes {
							if volMap, ok := vol.(map[string]interface{}); ok {
								if pvc, ok := volMap["persistentVolumeClaim"].(map[string]interface{}); ok {
									if claimName, ok := pvc["claimName"].(string); ok {
										vmInfo.ClaimNames = claimName
										break // Use first PVC found
									}
								}
							}
						}
					}
				}
			}
		}
	}

	status, _ := vmData["status"].(map[string]interface{})
	vmInfo.PrintableStatus, _ = status["printableStatus"].(string)
	if conditions, ok := status["conditions"].([]interface{}); ok && len(conditions) > 0 {
		if latestCond, ok := conditions[len(conditions)-1].(map[string]interface{}); ok {
			if statusStr, ok := latestCond["status"].(string); ok {
				vmInfo.VMStatus = models.VMStatus(statusStr)
			}
			vmInfo.VMStatusReason, _ = latestCond["reason"].(string)
		}
	}

	return nil
}
