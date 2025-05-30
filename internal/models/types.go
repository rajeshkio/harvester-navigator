package types

import (
	"fmt"
	"strings"
)

// VMInfo represents complete information about a Virtual Machine and its related resources.
// It serves as the central data structure for the harvesterNavigator tool.
type VMInfo struct {
	// Basic VM information
	Name         string
	ImageId      string
	PodName      string
	StorageClass string

	// Storage-related fields
	ClaimNames     string
	VolumeName     string
	AttachmentInfo map[string]interface{}

	// Detailed component information
	ReplicaInfo []ReplicaInfo
	EngineInfo  []EngineInfo
	PodInfo     []PodInfo
	VMIInfo     []VMIInfo

	// Status information
	VMStatus        VMStatus  // Changed from string to VMStatus type
	PVCStatus       PVCStatus // Changed from string to PVCStatus type
	PrintableStatus string
	VMStatusReason  string

	// Error reporting
	MissingResource string // Indicates which resource was not found during data collection
}

// VMStatus represents the possible states of a Virtual Machine
type VMStatus string

// PVCStatus represents the possible states of a Persistent Volume Claim
type PVCStatus string

// VM status constants
const (
	VMStatusTrue    VMStatus = "True"
	VMStatusFalse   VMStatus = "False"
	VMStatusUnknown VMStatus = "Unknown"
)

// PVC status constants
const (
	PVCStatusBound   PVCStatus = "Bound"
	PVCStatusPending PVCStatus = "Pending"
	PVCStatusLost    PVCStatus = "Lost"
	PVCStatusUnknown PVCStatus = "Unknown"
)

// PodInfo represents information about a pod related to the VM
type PodInfo struct {
	Name   string
	VMI    string
	NodeID string
	Status string
}

// VMIInfo represents information about a Virtual Machine Instance
type VMIInfo struct {
	ActivePods  map[string]string // Maps pod UIDs to node names
	GuestOSInfo *GuestOSInfo      // Changed to pointer since it's optional
	Interfaces  []Interface       // Renamed from Interfaces to Interface for better Go conventions
	NodeName    string
	Phase       string
	Name        string
}

// Interface represents a network interface in a VMI
// Renamed from Interfaces to Interface for better Go conventions
type Interface struct {
	IpAddress string
	Mac       string
}

// GuestOSInfo contains information about the guest operating system
type GuestOSInfo struct {
	KernelRelease string
	KernelVersion string
	Machine       string
	Name          string
	PrettyName    string
	Version       string
}

// ReplicaInfo contains information about a storage replica
type ReplicaInfo struct {
	Name           string
	SpecVolumeName string
	OwnerRefName   string
	NodeID         string
	Active         bool
	EngineName     string
	CurrentState   string
	Started        bool
}

// EngineInfo contains information about a storage engine
type EngineInfo struct {
	Active       bool
	CurrentState string
	Started      bool
	NodeID       string
	Snapshots    map[string]*SnapshotInfo // Changed to pointer type
	Name         string
}

// SnapshotInfo contains information about a storage snapshot
type SnapshotInfo struct {
	Name        string
	Parent      string
	Created     string
	Size        string
	UserCreated bool
	Removed     bool
	Children    map[string]bool
	Labels      map[string]string
}

// VolumeInfo contains information about a storage volume
type VolumeInfo struct {
	Name          string
	VolumeDetails map[string]interface{}
}

// Validation methods

// Validate checks if a VMInfo object contains all required fields
func (v *VMInfo) Validate() error {
	if v.Name == "" {
		return fmt.Errorf("VMInfo missing required field: Name")
	}
	// Add other validation as needed
	return nil
}

// IsRunning returns true if the VM is in a running state
func (v *VMInfo) IsRunning() bool {
	return v.VMStatus == VMStatusTrue &&
		(v.VMStatusReason == "Running" || strings.Contains(v.PrintableStatus, "Running"))
}

// HasReplicas returns true if the VM has associated replicas
func (v *VMInfo) HasReplicas() bool {
	return len(v.ReplicaInfo) > 0
}
