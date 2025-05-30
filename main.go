package main

import (
	"fmt"
	"log"
	"os"
	"os/user"
	"path/filepath"

	kubeclient "github.com/rk280392/harvesterNavigator/internal/client"
	types "github.com/rk280392/harvesterNavigator/internal/models"
	"github.com/rk280392/harvesterNavigator/internal/services/engine"
	"github.com/rk280392/harvesterNavigator/internal/services/pod"
	pvc "github.com/rk280392/harvesterNavigator/internal/services/pvc"
	"github.com/rk280392/harvesterNavigator/internal/services/replicas"
	vm "github.com/rk280392/harvesterNavigator/internal/services/vm"
	vmi "github.com/rk280392/harvesterNavigator/internal/services/vmi"
	volume "github.com/rk280392/harvesterNavigator/internal/services/volume"
	display "github.com/rk280392/harvesterNavigator/pkg/display"
	flag "github.com/spf13/pflag"
	"k8s.io/client-go/kubernetes"
)

// Configuration holds application configuration settings
type Configuration struct {
	KubeconfigPath string
	Namespace      string
	VMName         string
}

// ResourcePaths defines the API paths and namespaces for resources
type ResourcePaths struct {
	VMPath           string
	PVCPath          string
	VolumePath       string
	ReplicaPath      string
	EnginePath       string
	VMIPath          string
	PodPath          string
	VolumeNamespace  string
	ReplicaNamespace string
	EngineNamespace  string
}

func defaultKubeconfigPath() string {
	if env := os.Getenv("KUBECONFIG"); env != "" {
		return env
	}
	usr, err := user.Current()
	if err != nil {
		return ""
	}
	return filepath.Join(usr.HomeDir, ".kube", "config")
}

func getNamespace(cliNamespace string) string {
	if cliNamespace != "" {
		return cliNamespace
	}
	if env := os.Getenv("NAMESPACE"); env != "" {
		return env
	}
	return "default"
}

func logNotFound(resourceType, name, namespace string, err error) {
	log.Printf(
		"\nError: %s %q not found in namespace %q.\nCheck if the %s exists and that the namespace is correct.\nDetails: %v",
		resourceType, name, namespace, resourceType, err,
	)
}

// Set missing resource and display information before exiting
func handleResourceError(resourceType string, vmInfo *types.VMInfo) {
	vmInfo.MissingResource = resourceType
	display.DisplayVMInfo(vmInfo)
	os.Exit(1)
}

// Convert string to VMStatus for type compatibility
func ToVMStatus(s string) types.VMStatus {
	return types.VMStatus(s)
}

// parseCommandLineArgs parses command line arguments and returns a Configuration
func parseCommandLineArgs() Configuration {
	// Define optional flags
	kubeconfig := flag.StringP("kubeconfig", "k", defaultKubeconfigPath(), "Path to kubeconfig file (optional)")
	cliNamespace := flag.StringP("namespace", "n", "", "Namespace of the VM (optional, or export NAMESPACE env var)")

	// Override default usage message
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [flags] <vm-name>\n", os.Args[0])
		flag.PrintDefaults()
	}

	flag.Parse()

	// Validate positional arg: VM name
	if flag.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "Error: VM name is required.")
		flag.Usage()
		os.Exit(1)
	}

	vmName := flag.Arg(0)
	namespace := getNamespace(*cliNamespace)

	if _, err := os.Stat(*kubeconfig); os.IsNotExist(err) {
		log.Fatalf("Error: kubeconfig file not found at '%s'", *kubeconfig)
	}

	return Configuration{
		KubeconfigPath: *kubeconfig,
		Namespace:      namespace,
		VMName:         vmName,
	}
}

// initializeClient creates a Kubernetes client from the given configuration
func initializeClient(config Configuration) *kubernetes.Clientset {
	clientset, err := kubeclient.NewClient(config.KubeconfigPath)
	if err != nil {
		log.Fatalf("Error creating Kubernetes client: %v", err)
	}
	return clientset
}

// getDefaultResourcePaths returns the default API paths and namespaces
func getDefaultResourcePaths(namespace string) ResourcePaths {
	return ResourcePaths{
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

// fetchVMInfo fetches and parses VM information
func fetchVMInfo(clientset *kubernetes.Clientset, config Configuration, paths ResourcePaths) *types.VMInfo {
	vmInfo := &types.VMInfo{Name: config.VMName}

	// Fetch VM data
	vmData, err := vm.FetchVMData(clientset, config.VMName, paths.VMPath, config.Namespace, "virtualmachines")
	if err != nil {
		logNotFound("VM", config.VMName, config.Namespace, err)
		handleResourceError("VM", vmInfo)
	}

	// Parse VM metadata
	err = vm.ParseVMMetaData(vmData, vmInfo)
	if err != nil {
		log.Printf("Failed to parse VM metadata: %s", err)
		handleResourceError("VM METADATA", vmInfo)
	}

	return vmInfo
}

// fetchPVCInfo fetches and parses PVC information
func fetchPVCInfo(clientset *kubernetes.Clientset, vmInfo *types.VMInfo, config Configuration, paths ResourcePaths) string {
	// Fetch PVC data
	pvcData, err := pvc.FetchPVCData(clientset, vmInfo.ClaimNames, paths.PVCPath, config.Namespace, "persistentvolumeclaims")
	if err != nil {
		logNotFound("PVC", vmInfo.ClaimNames, config.Namespace, err)
		handleResourceError("PVC", vmInfo)
	}

	// Parse PVC spec
	volumeName, err := pvc.ParsePVCSpec(pvcData)
	if err != nil {
		log.Printf("Failed to parse PVC spec: %s", err)
		handleResourceError("PVC SPEC", vmInfo)
	}
	vmInfo.VolumeName = volumeName

	// Parse PVC status
	status, err := pvc.ParsePVCStatus(pvcData)
	if err != nil {
		log.Printf("Failed to parse PVC status: %s", err)
		handleResourceError("PVC STATUS", vmInfo)
	}
	vmInfo.PVCStatus = types.PVCStatus(status)

	return volumeName
}

// fetchVolumeInfo fetches and parses volume information
func fetchVolumeInfo(clientset *kubernetes.Clientset, volumeName string, vmInfo *types.VMInfo, config Configuration, paths ResourcePaths) string {
	// Fetch volume details
	volumeDetails, err := volume.FetchVolumeDetails(clientset, volumeName, paths.VolumePath, paths.VolumeNamespace, "volumes")
	if err != nil {
		logNotFound("Volume", volumeName, paths.VolumeNamespace, err)
		handleResourceError("VOLUME", vmInfo)
	}

	// Get pod name from volume
	podName, err := volume.GetPodFromVolume(volumeDetails)
	if err != nil {
		log.Printf("Failed to get pod name from volume status: %s", err)
		handleResourceError("POD NAME", vmInfo)
	}
	vmInfo.PodName = podName

	return podName
}

// fetchPodInfo fetches and parses pod information
func fetchPodInfo(clientset *kubernetes.Clientset, podName string, vmInfo *types.VMInfo, config Configuration, paths ResourcePaths) string {
	// Fetch pod details
	podData, err := pod.FetchPodDetails(clientset, podName, paths.PodPath, config.Namespace, "pods")
	if err != nil {
		logNotFound("POD", podName, config.Namespace, err)
		handleResourceError("POD", vmInfo)
	}

	// Check if podData is nil to prevent panic
	if podData == nil {
		log.Printf("Error: Pod data is unexpectedly nil")
		handleResourceError("POD DATA", vmInfo)
	}

	// Parse pod data with panic protection
	var ownerRef []types.PodInfo
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic during pod data parsing: %v", r)
				handleResourceError("POD DATA", vmInfo)
			}
		}()

		var err error
		ownerRef, err = pod.ParsePodData(podData)
		if err != nil {
			log.Printf("Failed to parse pod data: %s", err)
			handleResourceError("POD DATA", vmInfo)
		}
	}()

	vmInfo.PodInfo = ownerRef

	// Extract VMI name
	vmiName := extractVMIName(vmInfo)
	if vmiName == "" {
		log.Printf("Error: No VMI name found in pod data")
		handleResourceError("VMI NAME", vmInfo)
	}

	return vmiName
}

// extractVMIName extracts the VMI name from pod information
func extractVMIName(vmInfo *types.VMInfo) string {
	if len(vmInfo.PodInfo) == 0 {
		return ""
	}

	for _, pod := range vmInfo.PodInfo {
		if pod.VMI != "" {
			return pod.VMI
		}
	}
	return ""
}

// fetchVMIInfo fetches and parses VMI information
func fetchVMIInfo(clientset *kubernetes.Clientset, vmiName string, vmInfo *types.VMInfo, config Configuration, paths ResourcePaths) {
	// Fetch VMI details
	vmiData, err := vmi.FetchVMIDetails(clientset, vmiName, paths.VMIPath, config.Namespace, "virtualmachineinstances")
	if err != nil {
		logNotFound("VMI", vmiName, config.Namespace, err)
		handleResourceError("VMI", vmInfo)
	}

	// Parse VMI data
	vmiStatus, err := vmi.ParseVMIData(vmiData)
	if err != nil {
		log.Printf("Failed to parse VMI data: %s", err)
		handleResourceError("VMI DATA", vmInfo)
	}
	vmInfo.VMIInfo = vmiStatus
}

// fetchReplicaInfo fetches and parses replica information
func fetchReplicaInfo(clientset *kubernetes.Clientset, volumeName string, vmInfo *types.VMInfo, paths ResourcePaths) {
	// Find replica details
	relatedReplicas, err := replicas.FindReplicaDetails(clientset, volumeName, paths.ReplicaPath, paths.ReplicaNamespace, "replicas")
	if err != nil {
		log.Printf("Failed to get replica details: %s", err)
		handleResourceError("REPLICAS", vmInfo)
	}
	vmInfo.ReplicaInfo = relatedReplicas
}

// fetchEngineInfo fetches and parses engine information (optional)
func fetchEngineInfo(clientset *kubernetes.Clientset, vmInfo *types.VMInfo, paths ResourcePaths) {
	// Find engine details - this is optional
	engineInfos, err := engine.FindEngineDetails(clientset, vmInfo.VolumeName, paths.EnginePath, paths.EngineNamespace, "engines")
	if err != nil {
		// Log the error but continue - engine info is optional
		log.Printf("Warning: failed to get engine details: %s", err)
	} else {
		vmInfo.EngineInfo = engineInfos
	}
}

func main() {
	// Parse command line arguments
	config := parseCommandLineArgs()

	// Initialize Kubernetes client
	clientset := initializeClient(config)

	// Get default resource paths
	paths := getDefaultResourcePaths(config.Namespace)

	// Fetch VM information
	vmInfo := fetchVMInfo(clientset, config, paths)

	// Fetch PVC information
	volumeName := fetchPVCInfo(clientset, vmInfo, config, paths)

	// Fetch volume information
	podName := fetchVolumeInfo(clientset, volumeName, vmInfo, config, paths)

	// Fetch pod information
	vmiName := fetchPodInfo(clientset, podName, vmInfo, config, paths)

	// Fetch VMI information
	fetchVMIInfo(clientset, vmiName, vmInfo, config, paths)

	// Fetch replica information
	fetchReplicaInfo(clientset, volumeName, vmInfo, paths)

	// Fetch engine information (optional)
	fetchEngineInfo(clientset, vmInfo, paths)

	// Display all collected information
	display.DisplayVMInfo(vmInfo)
}
