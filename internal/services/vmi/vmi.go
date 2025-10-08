package vmi

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// FetchVMIDetails retrieves Virtual Machine Instance (VMI) data from the Kubernetes API.
// It takes a client, VMI name, absolute path, namespace, and resource type.
// Returns the VMI data as a map and any error encountered.
func FetchVMIDetails(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
	vmiRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get VMI details: %w", err)
	}

	var vmiData map[string]interface{}
	err = json.Unmarshal(vmiRaw, &vmiData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal VMI details: %w", err)
	}

	return vmiData, nil
}

// ParseVMIData extracts relevant information from VMI data and returns it as VMIInfo objects.
// It processes metadata, status, guest OS info, memory info, and network interfaces.
func ParseVMIData(client *kubernetes.Clientset, vmiData map[string]interface{}, namespace string) ([]types.VMIInfo, error) {
	var vmiInfos []types.VMIInfo

	// Check if VMI data is available
	if vmiData == nil {
		return vmiInfos, fmt.Errorf("no VMI data available")
	}

	// Extract name from metadata
	vmiName, err := extractVMIName(vmiData)
	if err != nil {
		return vmiInfos, err
	}

	// Extract status information
	vmiStatus, err := extractVMIStatus(vmiData)
	if err != nil {
		return vmiInfos, err
	}

	// Create a VMI info object
	vmiInfo := types.VMIInfo{
		Name:           vmiName,
		Phase:          extractPhase(vmiStatus),
		NodeName:       extractNodeName(vmiStatus),
		ActivePods:     make(map[string]string),
		ActivePodNames: make(map[string]string),
		GuestOSInfo:    &types.GuestOSInfo{},
		Interfaces:     []types.Interface{},
		MemoryInfo:     &types.MemoryInfo{},
	}

	// Extract active pods
	extractActivePods(vmiStatus, &vmiInfo)

	if len(vmiInfo.ActivePods) > 0 {
		podNames, err := FetchPodNamesForVM(client, namespace, vmiName, vmiInfo.ActivePods)
		if err != nil {
			log.Printf("Warning: Could not fetch pod names for VMI %s: %v", vmiName, err)
		} else {
			vmiInfo.ActivePodNames = podNames
		}
	}

	// Extract guest OS information
	extractGuestOSInfo(vmiStatus, &vmiInfo)

	// Extract memory information
	extractMemoryInfo(vmiStatus, &vmiInfo)

	// Extract CPU topology information
	extractCPUTopology(vmiData, vmiStatus, &vmiInfo)

	// Extract network interfaces
	extractNetworkInterfaces(vmiStatus, &vmiInfo)

	// Extract migration information if present
	vmiInfo.MigrationInfo = extractMigrationInfo(vmiStatus, vmiName, namespace)

	// Add the VMI info to the results
	vmiInfos = append(vmiInfos, vmiInfo)

	return vmiInfos, nil
}

// extractVMIName extracts the VMI name from metadata
func extractVMIName(vmiData map[string]interface{}) (string, error) {
	metadataRaw, ok := vmiData["metadata"]
	if !ok {
		return "", fmt.Errorf("metadata field missing in VMI data")
	}

	metadata, ok := metadataRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("metadata is not an object")
	}

	nameRaw, ok := metadata["name"]
	if !ok {
		return "", fmt.Errorf("name field missing in metadata")
	}

	name, ok := nameRaw.(string)
	if !ok {
		return "", fmt.Errorf("name is not a string")
	}

	return name, nil
}

// extractVMIStatus extracts the status information from VMI data
func extractVMIStatus(vmiData map[string]interface{}) (map[string]interface{}, error) {
	statusRaw, ok := vmiData["status"]
	if !ok {
		return nil, fmt.Errorf("status field missing in VMI data")
	}

	status, ok := statusRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("status is not an object")
	}

	return status, nil
}

// extractPhase extracts the phase from VMI status
func extractPhase(vmiStatus map[string]interface{}) string {
	phaseRaw, ok := vmiStatus["phase"]
	if !ok {
		return "Unknown" // Default value if not found
	}

	phase, ok := phaseRaw.(string)
	if !ok {
		return "Unknown" // Default value if not a string
	}

	return phase
}

// extractNodeName extracts the node name from VMI status
func extractNodeName(vmiStatus map[string]interface{}) string {
	nodeNameRaw, ok := vmiStatus["nodeName"]
	if !ok {
		return "" // Default empty string if not found
	}

	nodeName, ok := nodeNameRaw.(string)
	if !ok {
		return "" // Default empty string if not a string
	}

	return nodeName
}

// extractActivePods extracts active pods information from VMI status
func extractActivePods(vmiStatus map[string]interface{}, vmiInfo *types.VMIInfo) {
	activePodsRaw, ok := vmiStatus["activePods"]
	if !ok {
		return // No active pods
	}

	activePods, ok := activePodsRaw.(map[string]interface{})
	if !ok {
		return // Invalid format
	}

	for podUID, nodeNameVal := range activePods {
		if nodeNameStr, ok := nodeNameVal.(string); ok {
			vmiInfo.ActivePods[podUID] = nodeNameStr
		}
	}
}

func FetchPodNamesForVM(client *kubernetes.Clientset, namespace string, vmName string, nodeToUID map[string]string) (map[string]string, error) {
	podNames := make(map[string]string)

	// Get all pods in the namespace
	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	vmPrefix := fmt.Sprintf("virt-launcher-%s-", vmName)
	for _, pod := range pods.Items {
		// Check if pod name matches exactly: virt-launcher-{vmName}-{suffix}
		// The suffix should be exactly 5 random chars, not another VM name
		if strings.HasPrefix(pod.Name, vmPrefix) {
			// Extract the suffix after the prefix
			suffix := strings.TrimPrefix(pod.Name, vmPrefix)

			// Skip if suffix contains additional hyphens (indicates another VM name like "new-xxxxx")
			if strings.Contains(suffix, "-") {
				continue
			}

			nodeName := pod.Spec.NodeName
			// Find the UID that corresponds to this node
			for uid, uidNode := range nodeToUID {
				if uidNode == nodeName {
					podNames[uid] = pod.Name
					break
				}
			}
		}
	}

	return podNames, nil
}

// extractGuestOSInfo extracts guest OS information from VMI status
func extractGuestOSInfo(vmiStatus map[string]interface{}, vmiInfo *types.VMIInfo) {
	guestOSInfoRaw, ok := vmiStatus["guestOSInfo"]
	if !ok {
		return // No guest OS info
	}

	guestOSInfo, ok := guestOSInfoRaw.(map[string]interface{})
	if !ok {
		return // Invalid format
	}

	// Extract name
	if nameRaw, ok := guestOSInfo["name"]; ok {
		if name, ok := nameRaw.(string); ok {
			vmiInfo.GuestOSInfo.Name = name
		}
	}

	// Extract version
	if versionRaw, ok := guestOSInfo["version"]; ok {
		if version, ok := versionRaw.(string); ok {
			vmiInfo.GuestOSInfo.Version = version
		}
	}

	// Extract pretty name
	if prettyNameRaw, ok := guestOSInfo["prettyName"]; ok {
		if prettyName, ok := prettyNameRaw.(string); ok {
			vmiInfo.GuestOSInfo.PrettyName = prettyName
		}
	}

	// Extract kernel release
	if kernelReleaseRaw, ok := guestOSInfo["kernelRelease"]; ok {
		if kernelRelease, ok := kernelReleaseRaw.(string); ok {
			vmiInfo.GuestOSInfo.KernelRelease = kernelRelease
		}
	}

	// Extract kernel version
	if kernelVersionRaw, ok := guestOSInfo["kernelVersion"]; ok {
		if kernelVersion, ok := kernelVersionRaw.(string); ok {
			vmiInfo.GuestOSInfo.KernelVersion = kernelVersion
		}
	}

	// Extract machine
	if machineRaw, ok := guestOSInfo["machine"]; ok {
		if machine, ok := machineRaw.(string); ok {
			vmiInfo.GuestOSInfo.Machine = machine
		}
	}
}

// extractMemoryInfo extracts memory information from VMI status
func extractMemoryInfo(vmiStatus map[string]interface{}, vmiInfo *types.VMIInfo) {
	memoryRaw, ok := vmiStatus["memory"]
	if !ok {
		return // No memory info
	}

	memory, ok := memoryRaw.(map[string]interface{})
	if !ok {
		return // Invalid format
	}

	// Extract guest memory info
	if guestAtBootRaw, ok := memory["guestAtBoot"]; ok {
		if guestAtBoot, ok := guestAtBootRaw.(string); ok {
			vmiInfo.MemoryInfo.GuestAtBoot = guestAtBoot
		}
	}

	if guestCurrentRaw, ok := memory["guestCurrent"]; ok {
		if guestCurrent, ok := guestCurrentRaw.(string); ok {
			vmiInfo.MemoryInfo.GuestCurrent = guestCurrent
		}
	}

	if guestRequestedRaw, ok := memory["guestRequested"]; ok {
		if guestRequested, ok := guestRequestedRaw.(string); ok {
			vmiInfo.MemoryInfo.GuestRequested = guestRequested
		}
	}
}

// extractCPUTopology extracts CPU topology information from VMI data and status
func extractCPUTopology(vmiData map[string]interface{}, vmiStatus map[string]interface{}, vmiInfo *types.VMIInfo) {
	// First try to get CPU info from status.currentCPUTopology
	if currentCPUTopologyRaw, ok := vmiStatus["currentCPUTopology"]; ok {
		if currentCPUTopology, ok := currentCPUTopologyRaw.(map[string]interface{}); ok {
			if coresRaw, ok := currentCPUTopology["cores"]; ok {
				if cores, ok := coresRaw.(float64); ok {
					vmiInfo.CurrentCPUTopology = &types.CPUTopology{
						Cores: int(cores),
					}
				}
			}
		}
	}

	// Also try to get CPU info from spec.domain.cpu
	if specRaw, ok := vmiData["spec"]; ok {
		if spec, ok := specRaw.(map[string]interface{}); ok {
			if domainRaw, ok := spec["domain"]; ok {
				if domain, ok := domainRaw.(map[string]interface{}); ok {
					if cpuRaw, ok := domain["cpu"]; ok {
						if cpu, ok := cpuRaw.(map[string]interface{}); ok {
							cpuDomain := &types.CPUDomain{}

							if coresRaw, ok := cpu["cores"]; ok {
								if cores, ok := coresRaw.(float64); ok {
									cpuDomain.Cores = int(cores)
								}
							}

							if modelRaw, ok := cpu["model"]; ok {
								if model, ok := modelRaw.(string); ok {
									cpuDomain.Model = model
								}
							}

							vmiInfo.CPUDomain = cpuDomain
						}
					}
				}
			}
		}
	}
}

// extractNetworkInterfaces extracts network interfaces information from VMI status
func extractNetworkInterfaces(vmiStatus map[string]interface{}, vmiInfo *types.VMIInfo) {
	interfacesRaw, ok := vmiStatus["interfaces"]
	if !ok {
		log.Printf("No 'interfaces' key found in VMI status")
		return
	}

	interfaces, ok := interfacesRaw.([]interface{})
	if !ok {
		log.Printf("Interfaces is not an array in VMI status")
		return
	}

	for _, ifaceRaw := range interfaces {
		ifaceMap, ok := ifaceRaw.(map[string]interface{})
		if !ok {
			continue // Skip invalid entries
		}

		iface := types.Interface{}

		// Extract interface name and other details
		if nameRaw, ok := ifaceMap["name"]; ok {
			if name, ok := nameRaw.(string); ok {
				iface.Name = name
			}
		}

		if interfaceNameRaw, ok := ifaceMap["interfaceName"]; ok {
			if interfaceName, ok := interfaceNameRaw.(string); ok {
				iface.InterfaceName = interfaceName
			}
		}

		// Extract IP address - try ipAddress first, then ipAddresses array
		if ipAddressRaw, ok := ifaceMap["ipAddress"]; ok {
			if ipAddress, ok := ipAddressRaw.(string); ok && ipAddress != "" {
				iface.IpAddress = ipAddress
			}
		} else if ipAddressesRaw, ok := ifaceMap["ipAddresses"]; ok {
			if ipAddresses, ok := ipAddressesRaw.([]interface{}); ok && len(ipAddresses) > 0 {
				// Get the first IPv4 address (skip IPv6)
				for _, ipRaw := range ipAddresses {
					if ip, ok := ipRaw.(string); ok && ip != "" {
						// Simple check for IPv4 vs IPv6
						if len(ip) <= 15 && !containsColon(ip) { // Basic IPv4 check
							iface.IpAddress = ip
							break
						}
					}
				}
			}
		}

		// Extract MAC address
		if macRaw, ok := ifaceMap["mac"]; ok {
			if mac, ok := macRaw.(string); ok {
				iface.Mac = mac
			}
		}

		// Only add interface if it has meaningful information
		if iface.Name != "" || iface.IpAddress != "" || iface.Mac != "" {
			vmiInfo.Interfaces = append(vmiInfo.Interfaces, iface)
		}
	}
}

// Helper function to check if string contains colon (simple IPv6 detection)
func containsColon(s string) bool {
	for _, c := range s {
		if c == ':' {
			return true
		}
	}
	return false
}

// extractMigrationInfo extracts migration state from VMI status
func extractMigrationInfo(vmiStatus map[string]interface{}, vmiName, namespace string) *types.VMIMInfo {
	migrationStateRaw, ok := vmiStatus["migrationState"]
	if !ok {
		return nil // No migration state
	}

	migrationState, ok := migrationStateRaw.(map[string]interface{})
	if !ok {
		return nil // Invalid migration state
	}

	// Create VMIMInfo from VMI migration state
	migrationInfo := &types.VMIMInfo{
		Name:      fmt.Sprintf("vmi-embedded-%s", vmiName),
		VMIName:   vmiName,
		Namespace: namespace,
		Phase:     "Running", // Since VMI is running with migration
	}

	// Extract all migration fields from VMI
	if sourceNodeRaw, ok := migrationState["sourceNode"]; ok {
		if sourceNode, ok := sourceNodeRaw.(string); ok {
			migrationInfo.SourceNode = sourceNode
		}
	}

	if targetNodeRaw, ok := migrationState["targetNode"]; ok {
		if targetNode, ok := targetNodeRaw.(string); ok {
			migrationInfo.TargetNode = targetNode
		}
	}

	if sourcePodRaw, ok := migrationState["sourcePod"]; ok {
		if sourcePod, ok := sourcePodRaw.(string); ok {
			migrationInfo.SourcePod = sourcePod
		}
	}

	if targetPodRaw, ok := migrationState["targetPod"]; ok {
		if targetPod, ok := targetPodRaw.(string); ok {
			migrationInfo.TargetPod = targetPod
		}
	}

	if startTimestampRaw, ok := migrationState["startTimestamp"]; ok {
		if startTimestamp, ok := startTimestampRaw.(string); ok {
			migrationInfo.StartTimestamp = startTimestamp
		}
	}

	// Override startTimestamp with the earliest phase transition if available
	// This is more accurate than the migrationState startTimestamp
	if phaseTransitionsRaw, ok := vmiStatus["phaseTransitionTimestamps"]; ok {
		if phaseTransitions, ok := phaseTransitionsRaw.([]interface{}); ok && len(phaseTransitions) > 0 {
			// Find the earliest timestamp (usually "Pending" phase)
			var earliestTimestamp string
			for _, transitionRaw := range phaseTransitions {
				if transition, ok := transitionRaw.(map[string]interface{}); ok {
					if timestampRaw, ok := transition["phaseTransitionTimestamp"]; ok {
						if timestamp, ok := timestampRaw.(string); ok {
							if earliestTimestamp == "" || timestamp < earliestTimestamp {
								earliestTimestamp = timestamp
							}
						}
					}
				}
			}
			if earliestTimestamp != "" {
				migrationInfo.StartTimestamp = earliestTimestamp
			}
		}
	}

	if modeRaw, ok := migrationState["mode"]; ok {
		if mode, ok := modeRaw.(string); ok {
			migrationInfo.MigrationMode = mode
		}
	}

	return migrationInfo
}
