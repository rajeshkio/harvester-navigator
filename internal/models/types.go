package types

import "time"

// FullClusterData is the top-level struct that holds all data sent to the frontend.
type FullClusterData struct {
	VMs         []VMInfo     `json:"vms"`
	Nodes       []NodeInfo   `json:"nodes"`
	UpgradeInfo *UpgradeInfo `json:"upgradeInfo,omitempty"`
}

type UpgradeInfo struct {
	Version         string            `json:"version"`
	PreviousVersion string            `json:"previousVersion"`
	UpgradeTime     time.Time         `json:"upgradeTime"`
	State           string            `json:"state"`
	NodeStatuses    map[string]string `json:"nodeStatuses,omitempty"`
}

// ResourcePaths defines the API paths and namespaces for various Kubernetes resources.
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
type NodeCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Message string `json:"message"`
}
type DiskInfo struct {
	Name              string           `json:"name"`
	Path              string           `json:"path"`
	IsSchedulable     bool             `json:"isSchedulable"`
	StorageAvailable  string           `json:"storageAvailable"`
	StorageMaximum    string           `json:"storageMaximum"`
	StorageScheduled  string           `json:"storageScheduled"`
	ScheduledReplicas map[string]int64 `json:"scheduledReplicas"`
}

// NodeInfo holds aggregated information about a Harvester/Longhorn node.
type NodeInfo struct {
	Name       string          `json:"name"`
	Conditions []NodeCondition `json:"conditions"`
	Disks      []DiskInfo      `json:"disks"`
}

type VMError struct {
	Type     string `json:"type"`
	Resource string `json:"resource"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}

// VMInfo represents complete information about a Virtual Machine and its related resources.
type VMInfo struct {
	Name            string        `json:"name"`
	Namespace       string        `json:"namespace"`
	ImageId         string        `json:"imageId"`
	PodName         string        `json:"podName"`
	StorageClass    string        `json:"storageClass"`
	ClaimNames      string        `json:"claimNames"`
	VolumeName      string        `json:"volumeName"`
	ReplicaInfo     []ReplicaInfo `json:"replicaInfo"`
	EngineInfo      []EngineInfo  `json:"engineInfo"`
	PodInfo         []PodInfo     `json:"podInfo"`
	VMIInfo         []VMIInfo     `json:"vmiInfo"`
	VMStatus        VMStatus      `json:"vmStatus"`
	PVCStatus       PVCStatus     `json:"pvcStatus"`
	PrintableStatus string        `json:"printableStatus"`
	VMStatusReason  string        `json:"vmStatusReason"`
	MissingResource string        `json:"missingResource"`
	Errors          []VMError     `json:"errors,omitempty"`
}

// VMStatus represents the possible states of a Virtual Machine
type VMStatus string

// PVCStatus represents the possible states of a Persistent Volume Claim
type PVCStatus string

const (
	VMStatusTrue    VMStatus = "True"
	VMStatusFalse   VMStatus = "False"
	VMStatusUnknown VMStatus = "Unknown"
)

const (
	PVCStatusBound   PVCStatus = "Bound"
	PVCStatusPending PVCStatus = "Pending"
	PVCStatusLost    PVCStatus = "Lost"
	PVCStatusUnknown PVCStatus = "Unknown"
)

// PodInfo represents information about a pod related to the VM
type PodInfo struct {
	Name   string `json:"name"`
	VMI    string `json:"vmi"`
	NodeID string `json:"nodeId"`
	Status string `json:"status"`
}

// GuestOSInfo contains information about the guest operating system
type GuestOSInfo struct {
	KernelRelease string `json:"kernelRelease"`
	KernelVersion string `json:"kernelVersion"`
	Machine       string `json:"machine"`
	Name          string `json:"name"`
	PrettyName    string `json:"prettyName"`
	Version       string `json:"version"`
}

// ReplicaInfo contains detailed information about a storage replica.
type ReplicaCondition struct {
	Type   string `json:"type"`
	Status string `json:"status"`
}

// ReplicaInfo contains information about a storage replica
type ReplicaInfo struct {
	Name            string             `json:"name"`
	NodeID          string             `json:"nodeId"`
	Active          bool               `json:"active"`
	EngineName      string             `json:"engineName"`
	CurrentState    string             `json:"currentState"`
	Started         bool               `json:"started"`
	DataEngine      string             `json:"dataEngine"`
	DiskID          string             `json:"diskId"`
	InstanceManager string             `json:"instanceManager"`
	Image           string             `json:"image"`
	OwnerRefName    string             `json:"ownerRefName"`
	Conditions      []ReplicaCondition `json:"conditions"`
	StorageIP       string             `json:"storageIP"`
	Port            string             `json:"port"`
	IP              string             `json:"ip"`
}

// EngineInfo contains information about a storage engine
type EngineInfo struct {
	Active       bool                     `json:"active"`
	CurrentState string                   `json:"currentState"`
	Started      bool                     `json:"started"`
	NodeID       string                   `json:"nodeId"`
	Name         string                   `json:"name"`
	Snapshots    map[string]*SnapshotInfo `json:"snapshots"`
}

// SnapshotInfo contains information about a storage snapshot
type SnapshotInfo struct {
	Name        string            `json:"name"`
	Parent      string            `json:"parent"`
	Created     string            `json:"created"`
	Size        string            `json:"size"`
	UserCreated bool              `json:"userCreated"`
	Removed     bool              `json:"removed"`
	Children    map[string]bool   `json:"children"`
	Labels      map[string]string `json:"labels"`
}

// VolumeInfo contains information about a storage volume
type VolumeInfo struct {
	Name          string                 `json:"name"`
	VolumeDetails map[string]interface{} `json:"volumeDetails"`
}

type MemoryInfo struct {
	GuestAtBoot    string `json:"guestAtBoot"`
	GuestCurrent   string `json:"guestCurrent"`
	GuestRequested string `json:"guestRequested"`
}

type Interface struct {
	Name          string `json:"name"`
	InterfaceName string `json:"interfaceName"`
	IpAddress     string `json:"ipAddress"`
	Mac           string `json:"mac"`
}

// Update your existing VMIInfo struct to include:
type VMIInfo struct {
	Name        string            `json:"name"`
	NodeName    string            `json:"nodeName"`
	Phase       string            `json:"phase"`
	ActivePods  map[string]string `json:"activePods"`
	GuestOSInfo *GuestOSInfo      `json:"guestOSInfo"`
	MemoryInfo  *MemoryInfo       `json:"memoryInfo"` // New field
	Interfaces  []Interface       `json:"interfaces"`
}
