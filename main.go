package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	kubeclient "github.com/rk280392/harvesterNavigator/internal/client"
	models "github.com/rk280392/harvesterNavigator/internal/models"
	"github.com/rk280392/harvesterNavigator/internal/services/engine"
	"github.com/rk280392/harvesterNavigator/internal/services/health"
	"github.com/rk280392/harvesterNavigator/internal/services/lhva"
	"github.com/rk280392/harvesterNavigator/internal/services/node"
	"github.com/rk280392/harvesterNavigator/internal/services/pod"
	"github.com/rk280392/harvesterNavigator/internal/services/pvc"
	"github.com/rk280392/harvesterNavigator/internal/services/replicas"
	"github.com/rk280392/harvesterNavigator/internal/services/upgrade"
	"github.com/rk280392/harvesterNavigator/internal/services/vm"
	"github.com/rk280392/harvesterNavigator/internal/services/vmi"
	"github.com/rk280392/harvesterNavigator/internal/services/volume"
	"k8s.io/client-go/kubernetes"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func determineKubeconfigPath() (string, string, error) {
	if kubeconfigEnv := os.Getenv("KUBECONFIG"); kubeconfigEnv != "" {
		// KUBECONFIG can contain multiple paths separated by : (Linux/macOS) or ; (Windows)
		// We'll use the first valid one
		separator := ":"
		if os.PathSeparator == '\\' { // Windows
			separator = ";"
		}

		paths := strings.Split(kubeconfigEnv, separator)
		for i, path := range paths {
			// Clean up any whitespace
			path = strings.TrimSpace(path)
			if path == "" {
				continue
			}

			// Expand ~ to home directory if needed
			if strings.HasPrefix(path, "~/") {
				if home, err := os.UserHomeDir(); err == nil {
					path = filepath.Join(home, path[2:])
				}
			}

			if _, err := os.Stat(path); err == nil {
				source := fmt.Sprintf("KUBECONFIG environment variable (path %d of %d)", i+1, len(paths))
				return path, source, nil
			}
		}

		// If KUBECONFIG is set but no valid files found, that's worth noting
		log.Printf("Warning: KUBECONFIG environment variable is set to '%s' but no valid files found", kubeconfigEnv)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", fmt.Errorf("could not determine home directory: %w", err)
	}

	simPath := filepath.Join(home, ".sim", "admin.kubeconfig")
	if _, err := os.Stat(simPath); err == nil {
		return simPath, "Harvester simulator location (~/.sim/admin.kubeconfig)", nil
	}

	// Priority 4: Check current directory for common kubeconfig names
	currentDir, _ := os.Getwd()
	commonNames := []string{"kubeconfig", "admin.kubeconfig", "config"}

	for _, name := range commonNames {
		path := filepath.Join(currentDir, name)
		if _, err := os.Stat(path); err == nil {
			return path, fmt.Sprintf("current directory (./%s)", name), nil
		}
	}

	return "", "", fmt.Errorf("no kubeconfig file found. Searched locations:\n"+
		"  1. KUBECONFIG environment variable\n"+
		"  2. %s\n"+
		"  3. Current directory (kubeconfig, admin.kubeconfig, config)", simPath)
}

// validateKubeconfig performs basic validation on the kubeconfig file
func validateKubeconfig(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("cannot access kubeconfig file: %w", err)
	}

	if info.IsDir() {
		return fmt.Errorf("kubeconfig path points to a directory, not a file")
	}

	if info.Size() == 0 {
		return fmt.Errorf("kubeconfig file is empty")
	}

	// Check if file is readable
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("cannot read kubeconfig file: %w", err)
	}
	file.Close()

	return nil
}

func fetchAndBuildVMInfo(clientset *kubernetes.Clientset, vmData map[string]interface{}) (*models.VMInfo, error) {
	vmInfo := &models.VMInfo{
		Errors: []models.VMError{}, // Initialize errors slice
	}

	metadata, ok := vmData["metadata"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid metadata in VM object")
	}
	namespace, ok := metadata["namespace"].(string)
	if !ok || namespace == "" {
		return nil, fmt.Errorf("missing namespace in VM metadata")
	}
	vmName, _ := metadata["name"].(string)
	vmInfo.Namespace = namespace
	vmInfo.Name = vmName

	paths := getDefaultResourcePaths(vmInfo.Namespace)

	if err := vm.ParseVMMetaData(vmData, vmInfo); err != nil {
		return nil, fmt.Errorf("could not parse VM metadata for %s: %w", vmInfo.Name, err)
	}

	// Only proceed if a PVC is actually defined for the VM
	if vmInfo.ClaimNames == "" {
		log.Printf("Info: VM %s has no PVC defined, skipping storage details.", vmInfo.Name)
		return vmInfo, nil
	}

	volumeDetails, err := volume.FetchVolumeDetails(clientset, vmInfo.ClaimNames, vmInfo.Namespace)
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "volume",
			Resource: vmInfo.ClaimNames,
			Message:  fmt.Sprintf("Could not fetch volume details: %v", err),
			Severity: "warning",
		})
		log.Printf("Warning: could not fetch volume details for PVC %s: %v", vmInfo.ClaimNames, err)
		return vmInfo, nil
	}

	vmInfo.VolumeName = volumeDetails.VolumeHandle
	vmInfo.PVCStatus = models.PVCStatus(volumeDetails.Status)
	vmInfo.StorageClass = volumeDetails.StorageClass

	pvcData, err := pvc.FetchPVCData(clientset, vmInfo.ClaimNames, paths.PVCPath, vmInfo.Namespace, "persistentvolumeclaims")
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "pvc",
			Resource: vmInfo.ClaimNames,
			Message:  fmt.Sprintf("Could not fetch PVC: %v", err),
			Severity: "warning",
		})
		log.Printf("Warning: could not fetch PVC %s for VM %s in namespace %s: %v", vmInfo.ClaimNames, vmInfo.Name, vmInfo.Namespace, err)
		return vmInfo, nil // Return successfully with partial data
	}

	volumeName, _ := pvc.ParsePVCSpec(pvcData)
	status, _ := pvc.ParsePVCStatus(pvcData)
	vmInfo.VolumeName = volumeName
	vmInfo.PVCStatus = models.PVCStatus(status)

	// Only proceed if a volume is bound
	if volumeName == "" {
		return vmInfo, nil
	}

	lhvaData, err := lhva.FetchLHVAData(clientset, volumeName, paths.LHVAPath, "longhorn-system", "volumeattachments")
	if err != nil {
		fmt.Printf("Could not fetch LHVA: %v \n", err)
	}
	fmt.Printf("LHVA name is: %v + %v + %v  \n", lhvaData, volumeName, paths.LHVAPath)

	lhvaStatus, err := lhva.ParseLHVAStatus(lhvaData)
	if err != nil {
		fmt.Printf("Could not fetch LHVAstatus: %v \n", err)
	} else {
		vmInfo.AttachmentTicketsRaw = lhvaStatus
	}
	fmt.Printf("Attachmentticketstatuses is : %v \n", lhvaStatus)

	podName, err := volume.GetPodFromVolume(clientset, volumeDetails)
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "pod",
			Resource: vmInfo.ClaimNames,
			Message:  fmt.Sprintf("Could not find pod using this volume: %v", err),
			Severity: "info",
		})
		log.Printf("Info: could not find pod for PVC %s: %v", vmInfo.ClaimNames, err)
	} else {
		vmInfo.PodName = podName
		podData, err := pod.FetchPodDetails(clientset, podName, paths.PodPath, vmInfo.Namespace, "pods")
		if err != nil {
			vmInfo.Errors = append(vmInfo.Errors, models.VMError{
				Type:     "pod",
				Resource: podName,
				Message:  fmt.Sprintf("Could not fetch pod details: %v", err),
				Severity: "warning",
			})
		} else {
			ownerRef, _ := pod.ParsePodData(podData)
			vmInfo.PodInfo = ownerRef
		}
	}

	vmiData, err := vmi.FetchVMIDetails(clientset, vmInfo.Name, paths.VMIPath, vmInfo.Namespace, "virtualmachineinstances")
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "vmi",
			Resource: vmInfo.Name,
			Message:  fmt.Sprintf("Could not fetch VMI details: %v", err),
			Severity: "warning",
		})
	} else {
		vmiStatus, _ := vmi.ParseVMIData(vmiData)
		vmInfo.VMIInfo = vmiStatus
	}

	if volumeDetails.IsLonghornCSI && volumeDetails.VolumeHandle != "" {
		log.Printf("Volume %s uses Longhorn CSI, fetching Longhorn-specific details", volumeDetails.VolumeHandle)

		// Get replica details
		relatedReplicas, err := replicas.FindReplicaDetails(clientset, volumeDetails.VolumeHandle, paths.ReplicaPath, paths.ReplicaNamespace, "replicas")
		if err != nil {
			vmInfo.Errors = append(vmInfo.Errors, models.VMError{
				Type:     "replicas",
				Resource: volumeDetails.VolumeHandle,
				Message:  fmt.Sprintf("Could not fetch replica details: %v", err),
				Severity: "warning",
			})
		} else {
			vmInfo.ReplicaInfo = relatedReplicas
		}
		// Get engine details
		engineInfos, err := engine.FindEngineDetails(clientset, volumeDetails.VolumeHandle, paths.EnginePath, paths.EngineNamespace, "engines")
		if err != nil {
			vmInfo.Errors = append(vmInfo.Errors, models.VMError{
				Type:     "engine",
				Resource: volumeDetails.VolumeHandle,
				Message:  fmt.Sprintf("Could not fetch engine details: %v", err),
				Severity: "warning",
			})
		} else {
			vmInfo.EngineInfo = engineInfos
		}
	} else {
		log.Printf("Volume %s uses CSI driver %s (not Longhorn), skipping Longhorn-specific details",
			volumeDetails.PVName, volumeDetails.CSIDriver)

		// Add informational message about non-Longhorn storage with better context
		var backendName string
		switch volumeDetails.CSIDriver {
		case "csi.trident.netapp.io":
			backendName = "NetApp Trident"
		case "kubernetes.io/aws-ebs":
			backendName = "AWS EBS"
		case "kubernetes.io/gce-pd":
			backendName = "Google Persistent Disk"
		case "kubernetes.io/azure-disk":
			backendName = "Azure Disk"
		case "csi.vsphere.vmware.com":
			backendName = "vSphere CSI"
		default:
			backendName = volumeDetails.CSIDriver
		}

		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "info",
			Resource: volumeDetails.CSIDriver,
			Message:  fmt.Sprintf("This VM uses %s for storage. Volume is managed outside of Longhorn, so replica and engine diagnostics are not available. Storage is provided by the %s CSI driver.", backendName, backendName),
			Severity: "info",
		})
	}

	return vmInfo, nil
}

func logStorageBackends(clientset *kubernetes.Clientset) {
	backends, err := volume.DiscoverStorageBackends(clientset)
	if err != nil {
		log.Printf("Warning: Could not discover storage backends: %v", err)
		return
	}

	log.Println("=== Discovered Storage Backends ===")
	for _, backend := range backends {
		defaultStr := ""
		if backend.IsDefault {
			defaultStr = " (default)"
		}
		log.Printf("  %s: %s%s (%d storage classes)",
			backend.CSIDriver, backend.Name, defaultStr, backend.VolumeCount)
	}
	log.Println("=====================================")
}

// fetchFullClusterData now fetches data sequentially to avoid race conditions.
func fetchFullClusterData(clientset *kubernetes.Clientset) (models.FullClusterData, error) {
	var allData models.FullClusterData

	// -- Step 0: Running health checks
	log.Println("Running health checks...")
	healthChecker := health.CreateHealthChecker(clientset)
	healthSummary := healthChecker.RunAllChecks(context.Background())
	allData.HealthChecks = healthSummary
	log.Printf("Health checks completed: %d passed, %d failed, %d warnings",
		healthSummary.PassedChecks, healthSummary.FailedChecks, healthSummary.WarningChecks)

	// --- Step 1: Fetch Node Data ---
	log.Println("Fetching Longhorn node data...")
	longhornNodes, err := vm.FetchAllLonghornNodes(clientset)
	if err != nil {
		return allData, fmt.Errorf("could not fetch longhorn nodes: %w", err)
	}
	log.Printf("Successfully fetched %d Longhorn node resources from API.", len(longhornNodes))

	parsedLonghornNodes, err := vm.ParseLonghornNodeData(longhornNodes)
	if err != nil {
		return allData, fmt.Errorf("could not parse longhorn node data: %w", err)
	}
	log.Printf("Successfully parsed %d Longhorn nodes for the dashboard.", len(parsedLonghornNodes))

	// Fetch Kubernetes node data
	log.Println("Fetching Kubernetes node data...")
	kubernetesNodes, err := node.FetchAllKubernetesNodes(clientset)
	if err != nil {
		log.Printf("Warning: Could not fetch Kubernetes node data: %v", err)
		// Continue with just Longhorn data
		basicNodes := make([]models.NodeWithMetrics, len(parsedLonghornNodes))
		for i, lhNode := range parsedLonghornNodes {
			basicNodes[i] = models.NodeWithMetrics{NodeInfo: lhNode}
		}
		allData.Nodes = basicNodes
	} else {
		log.Printf("Successfully fetched %d Kubernetes node resources from API.", len(kubernetesNodes))

		parsedKubernetesNodes, err := node.ParseKubernetesNodeData(kubernetesNodes)
		if err != nil {
			log.Printf("Warning: Could not parse Kubernetes node data: %v", err)
			// Continue with just Longhorn data
			basicNodes := make([]models.NodeWithMetrics, len(parsedLonghornNodes))
			for i, lhNode := range parsedLonghornNodes {
				basicNodes[i] = models.NodeWithMetrics{NodeInfo: lhNode}
			}
			allData.Nodes = basicNodes
		} else {
			log.Printf("Successfully parsed %d Kubernetes nodes.", len(parsedKubernetesNodes))

			// Fetch running pod counts
			log.Println("Fetching running pod counts...")
			podCounts, err := node.FetchRunningPodCounts(clientset)
			if err != nil {
				log.Printf("Warning: Could not fetch pod counts: %v", err)
				podCounts = make(map[string]int) // Empty map as fallback
			} else {
				log.Printf("Successfully fetched pod counts for %d nodes.", len(podCounts))
			}

			// Merge Longhorn and Kubernetes node data with pod counts
			mergedNodes := make([]models.NodeWithMetrics, len(parsedLonghornNodes))
			for i, longhornNode := range parsedLonghornNodes {
				nodeWithMetrics := models.NodeWithMetrics{
					NodeInfo: longhornNode,
				}

				if k8sNode, exists := parsedKubernetesNodes[longhornNode.Name]; exists {
					nodeWithMetrics.KubernetesNodeInfo = k8sNode

					if podCount, exists := podCounts[longhornNode.Name]; exists {
						nodeWithMetrics.RunningPods = podCount
					}

					log.Printf("Successfully merged node data for %s: roles=%v, IP=%s, pods=%d",
						longhornNode.Name, k8sNode.Roles, k8sNode.InternalIP, nodeWithMetrics.RunningPods)
				} else {
					log.Printf("Warning: No Kubernetes node data found for Longhorn node %s", longhornNode.Name)
				}

				mergedNodes[i] = nodeWithMetrics
			}

			allData.Nodes = mergedNodes
			log.Printf("Successfully merged node data for %d nodes.", len(mergedNodes))
		}
	}

	// --- Step 2: Fetch VM Data ---
	log.Println("Fetching all VM data...")
	vmList, err := vm.FetchAllVMData(clientset, "apis/kubevirt.io/v1", "", "virtualmachines")
	if err != nil {
		return allData, fmt.Errorf("could not fetch list of VMs: %w", err)
	}
	log.Printf("Found %d VMs. Fetching full details for each...", len(vmList))

	log.Println("Fetching Harvester upgrade information...")
	upgradeInfo, err := upgrade.FetchLatestUpgrade(clientset)
	if err != nil {
		log.Printf("Warning: could not fetch upgrade information: %v", err)
		// Continue without upgrade info - this is not critical
	} else {
		allData.UpgradeInfo = upgradeInfo
		log.Printf("Successfully fetched upgrade info: %s -> %s (%s)",
			upgradeInfo.PreviousVersion, upgradeInfo.Version, upgradeInfo.State)
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	vmInfoChan := make(chan *models.VMInfo, len(vmList))

	for _, vmItem := range vmList {
		wg.Add(1)
		go func(vmData map[string]interface{}) {
			defer wg.Done()
			detailedVMInfo, err := fetchAndBuildVMInfo(clientset, vmData)
			if err != nil {
				log.Printf("Error processing VM details: %v", err)
				return
			}
			vmInfoChan <- detailedVMInfo
		}(vmItem)
	}

	wg.Wait()
	close(vmInfoChan)

	for vmInfo := range vmInfoChan {
		mu.Lock()
		allData.VMs = append(allData.VMs, *vmInfo)
		mu.Unlock()
	}
	log.Println("Finished fetching all VM details.")

	return allData, nil
}

func getDefaultResourcePaths(namespace string) models.ResourcePaths {
	return models.ResourcePaths{
		VMPath:           "apis/kubevirt.io/v1",
		PVCPath:          "/api/v1",
		LHVAPath:         "/apis/longhorn.io/v1beta2",
		VolumePath:       "apis/longhorn.io/v1beta2",
		ReplicaPath:      "apis/longhorn.io/v1beta2",
		EnginePath:       "apis/longhorn.io/v1beta2",
		VMIPath:          "apis/kubevirt.io/v1",
		PodPath:          "/api/v1",
		VolumeNamespace:  "longhorn-system",
		ReplicaNamespace: "longhorn-system",
		EngineNamespace:  "longhorn-system",
	}
}

func handleData(clientset *kubernetes.Clientset) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Data request from %s", r.RemoteAddr)
		start := time.Now()

		data, err := fetchFullClusterData(clientset)
		if err != nil {
			log.Printf("Error: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(data)
		log.Printf("Data sent in %v", time.Since(start))
	}
}
func main() {
	log.Println("Starting Harvester Navigator Backend...")
	kubeconfigPath, source, err := determineKubeconfigPath()
	if err != nil {
		log.Fatalf("Error: %v", err)
	}
	if err := validateKubeconfig(kubeconfigPath); err != nil {
		log.Fatalf("Error: Invalid kubeconfig file at %s: %v", kubeconfigPath, err)
	}
	log.Printf("✅ Using kubeconfig: %s", kubeconfigPath)
	log.Printf("📍 Source: %s", source)

	clientset, err := kubeclient.CreateClient(kubeconfigPath)
	if err != nil {
		log.Fatalf("Error creating Kubernetes client: %v", err)
	}
	log.Println("✅ Kubernetes client initialized.")
	serverVersion, err := clientset.Discovery().ServerVersion()
	if err != nil {
		log.Printf("Warning: Could not retrieve server version (connectivity issue?): %v", err)
	} else {
		log.Printf("✅ Connected to Kubernetes cluster (version: %s)", serverVersion.String())
	}
	logStorageBackends(clientset)
	http.Handle("/", http.FileServer(http.Dir(".")))
	http.HandleFunc("/data", handleData(clientset))
	log.Println("🚀 Backend server started. Open http://localhost:8080 in your browser.")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
