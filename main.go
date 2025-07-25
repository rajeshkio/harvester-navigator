package main

import (
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

	volumeDetails, err := volume.FetchVolumeDetails(clientset, volumeName, paths.VolumePath, paths.VolumeNamespace, "volumes")
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "volume",
			Resource: volumeName,
			Message:  fmt.Sprintf("Volume not found in Longhorn system: %v", err),
			Severity: "error",
		})
		log.Printf("Warning: could not fetch Volume %s for VM %s: %v", volumeName, vmInfo.Name, err)
		return vmInfo, nil // Return successfully with partial data
	}

	podName, _ := volume.GetPodFromVolume(volumeDetails)
	vmInfo.PodName = podName

	if podName != "" {
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

	relatedReplicas, err := replicas.FindReplicaDetails(clientset, volumeName, paths.ReplicaPath, paths.ReplicaNamespace, "replicas")
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "replicas",
			Resource: volumeName,
			Message:  fmt.Sprintf("Could not fetch replica details: %v", err),
			Severity: "warning",
		})
	} else {
		vmInfo.ReplicaInfo = relatedReplicas
	}

	engineInfos, err := engine.FindEngineDetails(clientset, volumeName, paths.EnginePath, paths.EngineNamespace, "engines")
	if err != nil {
		vmInfo.Errors = append(vmInfo.Errors, models.VMError{
			Type:     "engine",
			Resource: volumeName,
			Message:  fmt.Sprintf("Could not fetch engine details: %v", err),
			Severity: "warning",
		})
	} else {
		vmInfo.EngineInfo = engineInfos
	}

	return vmInfo, nil
}

// fetchFullClusterData now fetches data sequentially to avoid race conditions.
func fetchFullClusterData(clientset *kubernetes.Clientset) (models.FullClusterData, error) {
	var allData models.FullClusterData

	// --- Step 1: Fetch Node Data ---
	log.Println("Fetching Longhorn node data...")
	longhornNodes, err := vm.FetchAllLonghornNodes(clientset)
	if err != nil {
		return allData, fmt.Errorf("could not fetch longhorn nodes: %w", err)
	}
	log.Printf("Successfully fetched %d Longhorn node resources from API.", len(longhornNodes))

	parsedNodes, err := vm.ParseLonghornNodeData(longhornNodes)
	if err != nil {
		return allData, fmt.Errorf("could not parse longhorn node data: %w", err)
	}
	log.Printf("Successfully parsed %d nodes for the dashboard.", len(parsedNodes))
	allData.Nodes = parsedNodes

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

func handleConnections(w http.ResponseWriter, r *http.Request, clientset *kubernetes.Clientset) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	defer ws.Close()
	log.Println("Frontend connected. Fetching data...")

	allData, err := fetchFullClusterData(clientset)
	if err != nil {
		log.Printf("Error fetching cluster data: %v", err)
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}

	// Send the data
	if err := ws.WriteJSON(allData); err != nil {
		log.Println("Write error:", err)
		return
	}
	log.Println("Data sent to frontend successfully.")

	// Keep the connection alive and handle ping/pong
	ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	ws.SetPongHandler(func(string) error {
		ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Send periodic pings to keep connection alive
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	done := make(chan struct{})

	// Handle incoming messages (mostly pings)
	go func() {
		defer close(done)
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				log.Println("WebSocket read error:", err)
				return
			}
		}
	}()

	// Send pings periodically
	for {
		select {
		case <-done:
			log.Println("WebSocket connection closed by client")
			return
		case <-ticker.C:
			if err := ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Println("WebSocket ping error:", err)
				return
			}
		}
	}
}

func getDefaultResourcePaths(namespace string) models.ResourcePaths {
	return models.ResourcePaths{
		VMPath:           "apis/kubevirt.io/v1",
		PVCPath:          "/api/v1",
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

	clientset, err := kubeclient.NewClient(kubeconfigPath)
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
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleConnections(w, r, clientset)
	})
	log.Println("🚀 Backend server started. Open http://localhost:8080 in your browser.")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
