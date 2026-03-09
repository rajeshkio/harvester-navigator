package vmim

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FetchVMIMData retrieves Virtual Machine Instance Migrations (VMIM) data from the Kubernetes API.
// It takes a client, VMIM name, absolute path, namespace, and resource type.
// Returns the VMIM data as a map and any error encountered.
func FetchVMIMData(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
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
	return vmimData, nil
}

// FetchAllVMIMsForVMI fetches all migrations for a specific VMI
func FetchAllVMIMsForVMI(client *kubernetes.Clientset, vmiName, absPath, namespace string) ([]map[string]interface{}, error) {
	vmimsRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Resource("virtualmachineinstancemigrations").
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get VMIM list: %w", err)
	}

	var vmimList map[string]interface{}
	err = json.Unmarshal(vmimsRaw, &vmimList)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal VMIM list: %w", err)
	}

	// Extract items array
	itemsRaw, ok := vmimList["items"]
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
			if isVMIMForVMI(itemMap, vmiName) {
				result = append(result, itemMap)
			}
		}
	}

	return result, nil
}

// ParseVMIMData extracts relevant information from VMIM data and returns it as VMIMInfo objects
func ParseVMIMData(vmimDataList []map[string]interface{}, client *kubernetes.Clientset) ([]types.VMIMInfo, error) {
	var vmimInfos []types.VMIMInfo

	for _, vmimData := range vmimDataList {
		vmimInfo, err := parseVMIMDetailed(vmimData, client)
		if err != nil {
			continue // Skip invalid entries
		}
		vmimInfos = append(vmimInfos, vmimInfo)
	}

	return vmimInfos, nil
}

func isVMIMForVMI(vmimData map[string]interface{}, vmiName string) bool {
	// Method 1: Direct spec.vmiName reference
	if targetVMI, err := extractVMINameFromVMIM(vmimData); err == nil && targetVMI == vmiName {
		return true
	}

	// Method 2: Check metadata labels (evacuation migrations)
	if metadata, ok := vmimData["metadata"].(map[string]interface{}); ok {
		if labels, ok := metadata["labels"].(map[string]interface{}); ok {
			// Check for VMI name in labels
			if labelVMI, ok := labels["kubevirt.io/vmiName"].(string); ok && labelVMI == vmiName {
				return true
			}
		}
	}

	// Method 3: Check status.vmiName (some evacuations store it here)
	if status, ok := vmimData["status"].(map[string]interface{}); ok {
		if statusVMI, ok := status["vmiName"].(string); ok && statusVMI == vmiName {
			return true
		}
	}

	// Method 4: Check if VMIM name contains VMI name (evacuation pattern)
	if metadata, ok := vmimData["metadata"].(map[string]interface{}); ok {
		if vmimName, ok := metadata["name"].(string); ok {
			if strings.Contains(vmimName, vmiName) {
				return true
			}
		}
	}

	return false
}

// fetchPodNodeSelector fetches the nodeSelector from a pod's spec
func fetchPodNodeSelector(client *kubernetes.Clientset, podName, namespace string) (map[string]string, error) {
	if client == nil || podName == "" || namespace == "" {
		return nil, fmt.Errorf("invalid parameters: client, podName, or namespace is empty")
	}

	podRaw, err := client.RESTClient().Get().
		AbsPath("/api/v1").
		Namespace(namespace).
		Name(podName).
		Resource("pods").
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to fetch pod: %w", err)
	}

	var podData map[string]interface{}
	if err := json.Unmarshal(podRaw, &podData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal pod data: %w", err)
	}

	// Extract spec.nodeSelector
	if specRaw, ok := podData["spec"].(map[string]interface{}); ok {
		if nodeSelectorRaw, ok := specRaw["nodeSelector"].(map[string]interface{}); ok {
			nodeSelector := make(map[string]string)
			for key, value := range nodeSelectorRaw {
				if strValue, ok := value.(string); ok {
					nodeSelector[key] = strValue
				}
			}
			return nodeSelector, nil
		}
	}

	return nil, nil // No nodeSelector found
}

// fetchSchedulingEvents fetches FailedScheduling events for a VMI
func fetchSchedulingEvents(client *kubernetes.Clientset, vmiName, namespace string) ([]types.SchedulingEvent, error) {
	if client == nil || vmiName == "" || namespace == "" {
		return nil, fmt.Errorf("invalid parameters")
	}

	// Fetch all events in the namespace
	eventsRaw, err := client.RESTClient().Get().
		AbsPath("/api/v1").
		Namespace(namespace).
		Resource("events").
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to fetch events: %w", err)
	}

	var eventsList map[string]interface{}
	if err := json.Unmarshal(eventsRaw, &eventsList); err != nil {
		return nil, fmt.Errorf("failed to unmarshal events: %w", err)
	}

	itemsRaw, ok := eventsList["items"]
	if !ok {
		return nil, nil
	}

	items, ok := itemsRaw.([]interface{})
	if !ok {
		return nil, nil
	}

	var schedulingEvents []types.SchedulingEvent
	for _, item := range items {
		eventMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		// Check if this event is related to our VMI
		if involvedObjectRaw, ok := eventMap["involvedObject"].(map[string]interface{}); ok {
			if nameRaw, ok := involvedObjectRaw["name"]; ok {
				if name, ok := nameRaw.(string); ok {
					// Match virt-launcher-{vmiName} or the vmi name itself
					if !strings.Contains(name, vmiName) {
						continue
					}
				}
			}
		}

		// Extract reason and filter for FailedScheduling
		reasonRaw, ok := eventMap["reason"]
		if !ok {
			continue
		}
		reason, ok := reasonRaw.(string)
		if !ok || reason != "FailedScheduling" {
			continue
		}

		// Extract event details
		var schedulingEvent types.SchedulingEvent
		schedulingEvent.Reason = reason

		if messageRaw, ok := eventMap["message"].(string); ok {
			schedulingEvent.Message = messageRaw
		}

		if countRaw, ok := eventMap["count"].(float64); ok {
			schedulingEvent.Count = int32(countRaw)
		}

		if lastTimestampRaw, ok := eventMap["lastTimestamp"].(string); ok {
			schedulingEvent.LastTimestamp = lastTimestampRaw
		}

		schedulingEvents = append(schedulingEvents, schedulingEvent)
	}

	return schedulingEvents, nil
}

// hasNodeAffinityError checks if an event message contains node affinity/selector errors
func hasNodeAffinityError(message string) bool {
	if message == "" {
		return false
	}

	// Look for common patterns in node affinity errors
	patterns := []string{
		"didn't match Pod's node affinity",
		"didn't match node selector",
		"node(s) didn't match Pod's node affinity/selector",
		"didn't match pod affinity",
	}

	messageLower := strings.ToLower(message)
	for _, pattern := range patterns {
		if strings.Contains(messageLower, strings.ToLower(pattern)) {
			return true
		}
	}

	return false
}

// parseVMIMDetailed processes a single VMIM object with full detail extraction
func parseVMIMDetailed(vmimData map[string]interface{}, client *kubernetes.Clientset) (types.VMIMInfo, error) {
	var vmimInfo types.VMIMInfo

	// Extract metadata
	metadataRaw, ok := vmimData["metadata"]
	if !ok {
		return vmimInfo, fmt.Errorf("metadata field missing in VMIM data")
	}

	metadata, ok := metadataRaw.(map[string]interface{})
	if !ok {
		return vmimInfo, fmt.Errorf("metadata is not an object")
	}

	// Extract name and namespace
	if nameRaw, ok := metadata["name"]; ok {
		if name, ok := nameRaw.(string); ok {
			vmimInfo.Name = name
		}
	}

	if namespaceRaw, ok := metadata["namespace"]; ok {
		if namespace, ok := namespaceRaw.(string); ok {
			vmimInfo.Namespace = namespace
		}
	}

	// Extract spec
	specRaw, ok := vmimData["spec"]
	if ok {
		if spec, ok := specRaw.(map[string]interface{}); ok {
			if vmiNameRaw, ok := spec["vmiName"]; ok {
				if vmiName, ok := vmiNameRaw.(string); ok {
					vmimInfo.VMIName = vmiName
				}
			}
		}
	}

	// Extract status - this is where the detailed info lives
	statusRaw, ok := vmimData["status"]
	if ok {
		if status, ok := statusRaw.(map[string]interface{}); ok {
			// Extract phase
			if phaseRaw, ok := status["phase"]; ok {
				if phase, ok := phaseRaw.(string); ok {
					vmimInfo.Phase = phase
				}
			}

			// Extract phase transition timestamps
			if phaseTransitionsRaw, ok := status["phaseTransitionTimestamps"]; ok {
				if phaseTransitions, ok := phaseTransitionsRaw.([]interface{}); ok {
					var transitions []types.PhaseTransition
					for _, transitionRaw := range phaseTransitions {
						if transition, ok := transitionRaw.(map[string]interface{}); ok {
							var phaseTransition types.PhaseTransition
							if phaseRaw, ok := transition["phase"]; ok {
								if phase, ok := phaseRaw.(string); ok {
									phaseTransition.Phase = phase
								}
							}
							if timestampRaw, ok := transition["phaseTransitionTimestamp"]; ok {
								if timestamp, ok := timestampRaw.(string); ok {
									phaseTransition.PhaseTransitionTimestamp = timestamp
								}
							}
							transitions = append(transitions, phaseTransition)
						}
					}
					vmimInfo.PhaseTransitionTimestamps = transitions

					// Set the latest transition
					if len(transitions) > 0 {
						latest := transitions[len(transitions)-1]
						vmimInfo.LatestPhaseTransition = &latest
					}
				}
			}

			// Extract migrationState details
			if migrationStateRaw, ok := status["migrationState"]; ok {
				if migrationState, ok := migrationStateRaw.(map[string]interface{}); ok {
					// Extract source node and pod
					if sourceNodeRaw, ok := migrationState["sourceNode"]; ok {
						if sourceNode, ok := sourceNodeRaw.(string); ok {
							vmimInfo.SourceNode = sourceNode
						}
					}
					if sourcePodRaw, ok := migrationState["sourcePod"]; ok {
						if sourcePod, ok := sourcePodRaw.(string); ok {
							vmimInfo.SourcePod = sourcePod
						}
					}
					// Extract target node and pod
					if targetNodeRaw, ok := migrationState["targetNode"]; ok {
						if targetNode, ok := targetNodeRaw.(string); ok {
							vmimInfo.TargetNode = targetNode
						}
					}
					if targetPodRaw, ok := migrationState["targetPod"]; ok {
						if targetPod, ok := targetPodRaw.(string); ok {
							vmimInfo.TargetPod = targetPod
						}
					}
					if targetNodeAddressRaw, ok := migrationState["targetNodeAddress"]; ok {
						if targetNodeAddress, ok := targetNodeAddressRaw.(string); ok {
							vmimInfo.TargetNodeAddress = targetNodeAddress
						}
					}
					// Extract start timestamp
					if startTimestampRaw, ok := migrationState["startTimestamp"]; ok {
						if startTimestamp, ok := startTimestampRaw.(string); ok {
							vmimInfo.StartTimestamp = startTimestamp
						}
					}
					// Extract migration mode
					if modeRaw, ok := migrationState["mode"]; ok {
						if mode, ok := modeRaw.(string); ok {
							vmimInfo.MigrationMode = mode
						}
					}
					// Extract migration configuration
					if configRaw, ok := migrationState["migrationConfiguration"]; ok {
						if config, ok := configRaw.(map[string]interface{}); ok {
							migrationConfig := &types.MigrationConfiguration{}

							if allowAutoConvergeRaw, ok := config["allowAutoConverge"]; ok {
								if allowAutoConverge, ok := allowAutoConvergeRaw.(bool); ok {
									migrationConfig.AllowAutoConverge = allowAutoConverge
								}
							}

							if allowPostCopyRaw, ok := config["allowPostCopy"]; ok {
								if allowPostCopy, ok := allowPostCopyRaw.(bool); ok {
									migrationConfig.AllowPostCopy = allowPostCopy
								}
							}

							if bandwidthRaw, ok := config["bandwidthPerMigration"]; ok {
								if bandwidth, ok := bandwidthRaw.(string); ok {
									migrationConfig.BandwidthPerMigration = bandwidth
								}
							}

							if timeoutRaw, ok := config["completionTimeoutPerGiB"]; ok {
								if timeout, ok := timeoutRaw.(float64); ok {
									migrationConfig.CompletionTimeoutPerGiB = int(timeout)
								}
							}

							if parallelClusterRaw, ok := config["parallelMigrationsPerCluster"]; ok {
								if parallelCluster, ok := parallelClusterRaw.(float64); ok {
									migrationConfig.ParallelMigrationsPerCluster = int(parallelCluster)
								}
							}

							if parallelNodeRaw, ok := config["parallelOutboundMigrationsPerNode"]; ok {
								if parallelNode, ok := parallelNodeRaw.(float64); ok {
									migrationConfig.ParallelOutboundMigrationsPerNode = int(parallelNode)
								}
							}

							if progressTimeoutRaw, ok := config["progressTimeout"]; ok {
								if progressTimeout, ok := progressTimeoutRaw.(float64); ok {
									migrationConfig.ProgressTimeout = int(progressTimeout)
								}
							}

							if unsafeRaw, ok := config["unsafeMigrationOverride"]; ok {
								if unsafe, ok := unsafeRaw.(bool); ok {
									migrationConfig.UnsafeMigrationOverride = unsafe
								}
							}

							vmimInfo.MigrationConfiguration = migrationConfig
						}
					}
				}
			}

			// Validate target pod existence if we have target pod name
			if vmimInfo.TargetPod != "" && vmimInfo.Namespace != "" {
				podExists, podStatus := validateTargetPod(client, vmimInfo.TargetPod, vmimInfo.Namespace)
				vmimInfo.TargetPodExists = podExists
				vmimInfo.TargetPodStatus = podStatus
			} else if vmimInfo.Phase == "Pending" || vmimInfo.Phase == "Scheduling" {
				// For migrations stuck in Pending/Scheduling without a target pod,
				// the target pod is likely Unschedulable
				vmimInfo.TargetPodExists = false
				vmimInfo.TargetPodStatus = "Unschedulable"
			}

			// Collect scheduling verification data for stuck migrations
			if vmimInfo.Phase == "Pending" || vmimInfo.Phase == "Failed" {
				if vmimInfo.VMIName != "" && vmimInfo.Namespace != "" && client != nil {
					// Fetch scheduling events
					if events, err := fetchSchedulingEvents(client, vmimInfo.VMIName, vmimInfo.Namespace); err == nil && len(events) > 0 {
						vmimInfo.SchedulingEvents = events

						// Check if any event has node affinity errors
						for _, event := range events {
							if hasNodeAffinityError(event.Message) {
								vmimInfo.HasSchedulingError = true
								vmimInfo.SchedulingErrorReason = "NodeAffinityError"
								break
							}
						}
					}

					// If we have a target pod name, fetch its nodeSelector to identify required labels
					// Try target pod first, then fallback to source pod (as requirements are inherited)
					// Try virt-launcher pod name pattern if targetPod is not set
					podName := vmimInfo.TargetPod

					// First try: Target Pod
					var nodeSelector map[string]string
					var err error

					if podName != "" {
						nodeSelector, err = fetchPodNodeSelector(client, podName, vmimInfo.Namespace)
						// Ignore error, try next method
						if err != nil {
							nodeSelector = nil
						}
					}

					// Second try: Virt-launcher pattern (likely target)
					if nodeSelector == nil && vmimInfo.VMIName != "" {
						podName = "virt-launcher-" + vmimInfo.VMIName
						nodeSelector, err = fetchPodNodeSelector(client, podName, vmimInfo.Namespace)
						// Ignore error, try next method
						if err != nil {
							nodeSelector = nil
						}
					}

					// Third try: Source Pod (definitive fallback)
					// The source pod contains the nodeSelector that is currently enforced
					// and will be copied to the target pod.
					if nodeSelector == nil && vmimInfo.SourcePod != "" {
						nodeSelector, err = fetchPodNodeSelector(client, vmimInfo.SourcePod, vmimInfo.Namespace)
						// Final error check not needed as we just check if nodeSelector != nil
						if err != nil {
							nodeSelector = nil
						}
					}

					for key := range nodeSelector {
						if strings.HasPrefix(key, "cpu-feature.node.kubevirt.io/") {
							vmimInfo.RequiredNodeLabels = append(vmimInfo.RequiredNodeLabels, key)
						}
					}
				}
			}
		}
	}

	return vmimInfo, nil
}

// validateTargetPod checks if the target pod exists and returns its status
func validateTargetPod(client *kubernetes.Clientset, podName, namespace string) (bool, string) {
	if client == nil {
		return false, "Unknown - client unavailable"
	}

	podRaw, err := client.RESTClient().Get().
		AbsPath("/api/v1").
		Namespace(namespace).
		Name(podName).
		Resource("pods").
		Do(context.Background()).Raw()

	if err != nil {
		return false, "Not Found"
	}

	var podData map[string]interface{}
	if err := json.Unmarshal(podRaw, &podData); err != nil {
		return false, "Parse Error"
	}

	// Extract pod status
	if statusRaw, ok := podData["status"]; ok {
		if status, ok := statusRaw.(map[string]interface{}); ok {
			if phaseRaw, ok := status["phase"]; ok {
				if phase, ok := phaseRaw.(string); ok {
					return true, phase
				}
			}
		}
	}

	return true, "Unknown"
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
