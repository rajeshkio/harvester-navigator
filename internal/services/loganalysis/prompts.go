package loganalysis

import (
	"fmt"
	"strings"

	types "github.com/rk280392/harvesterNavigator/internal/models"
)

func BuildAnalysisPrompt(req types.LogAnalysisRequest) string {
	var parts []string

	parts = append(parts, "You are analyzing a Harvester Kubernetes cluster issue.")
	parts = append(parts, "Harvester is a hyperconverged infrastructure built on Kubernetes, KubeVirt, and Longhorn storage.")
	parts = append(parts, "")

	// Issue details
	parts = append(parts, "ISSUE DETAILS:")
	parts = append(parts, fmt.Sprintf("- Issue Type: %s", req.IssueType))

	if req.VMName != "" {
		parts = append(parts, fmt.Sprintf("- Affected VM: %s", req.VMName))
	}

	if req.Namespace != "" {
		parts = append(parts, fmt.Sprintf("- Namespace: %s", req.Namespace))
	}

	if req.SourceNode != "" {
		parts = append(parts, fmt.Sprintf("- Source Node: %s", req.SourceNode))
	}

	if req.TargetNode != "" {
		parts = append(parts, fmt.Sprintf("- Target Node: %s", req.TargetNode))
	}

	if req.TimeWindow != "" {
		parts = append(parts, fmt.Sprintf("- Time Window: Last %s", req.TimeWindow))
	}

	// Add structured data if available
	if req.VolumeName != "" {
		parts = append(parts, "VOLUME STATUS:")
		parts = append(parts, fmt.Sprintf("- Volume: %s", req.VolumeName))
		if req.VolumeRobustness != "" {
			parts = append(parts, fmt.Sprintf("- Robustness: %s", req.VolumeRobustness))
		}
		if req.VolumeState != "" {
			parts = append(parts, fmt.Sprintf("- State: %s", req.VolumeState))
		}
		if req.ReplicaCount > 0 {
			parts = append(parts, fmt.Sprintf("- Total Replicas: %d", req.ReplicaCount))
			parts = append(parts, fmt.Sprintf("- Faulted Replicas: %d", req.FaultedCount))
		}
		parts = append(parts, "")
	}
	
	// Add node disk status for DiskPressure detection
	if len(req.NodeDiskStatus) > 0 {
		parts = append(parts, "NODE DISK STATUS:")
		for _, node := range req.NodeDiskStatus {
			status := "OK"
			if node.HasDiskPressure {
				status = "DISK_PRESSURE"
			}
			parts = append(parts, fmt.Sprintf("- %s: %s (Scheduled: %s, Max: %s, Available: %s)",
				node.NodeName, status, node.StorageScheduled, node.StorageMaximum, node.StorageAvailable))
		}
		parts = append(parts, "")
	}
	
	// Add replica details for location and failure analysis
	if len(req.ReplicaDetails) > 0 {
		parts = append(parts, "REPLICA DETAILS:")
		for _, replica := range req.ReplicaDetails {
			startedStr := "stopped"
			if replica.Started {
				startedStr = "running"
			}
			parts = append(parts, fmt.Sprintf("- %s on %s: state=%s, %s",
				replica.Name, replica.NodeName, replica.State, startedStr))
		}
		parts = append(parts, "")
	}
	
	// Add pod distribution for split-brain detection
	if len(req.PodDistribution) > 0 {
		parts = append(parts, "POD DISTRIBUTION:")
		for _, pod := range req.PodDistribution {
			parts = append(parts, fmt.Sprintf("- %s on %s (phase: %s)",
				pod.PodName, pod.NodeName, pod.Phase))
		}
		parts = append(parts, "")
	}
	
	// Add attachment state for CSI layer analysis
	if req.AttachmentState != nil {
		parts = append(parts, "ATTACHMENT STATE:")
		parts = append(parts, fmt.Sprintf("- Current Node: %s", req.AttachmentState.CurrentNodeID))
		if req.AttachmentState.DesiredNodeID != "" {
			parts = append(parts, fmt.Sprintf("- Desired Node: %s", req.AttachmentState.DesiredNodeID))
		}
		parts = append(parts, fmt.Sprintf("- Longhorn Attached: %t", req.AttachmentState.LonghornAttached))
		if req.AttachmentState.HasConflict {
			parts = append(parts, "- WARNING: CSI attachment conflict detected")
		}
		parts = append(parts, "")
	}
	
	// Add migration state for dangling migration detection
	if req.MigrationState != nil && req.MigrationState.CurrentMigrationNodeID != "" {
		parts = append(parts, "MIGRATION STATE:")
		parts = append(parts, fmt.Sprintf("- Migration Node ID: %s", req.MigrationState.CurrentMigrationNodeID))
		if req.MigrationState.IsDangling {
			parts = append(parts, "- WARNING: Dangling migration state detected")
		}
		parts = append(parts, "")
	}

	parts = append(parts, "")
	if issueContext := getIssueTypeContext(req.IssueType); issueContext != "" {
		parts = append(parts, issueContext)
		parts = append(parts, "")
	}

	// What we want from the analysis
	parts = append(parts, "TASK:")
	parts = append(parts, "Based on the issue type and context, provide:")
	parts = append(parts, "1. Most likely root cause")
	parts = append(parts, "2. Which Harvester/KubeVirt component is likely failing")
	parts = append(parts, "3. Recommended next steps for troubleshooting")

	return strings.Join(parts, "\n")
}

func getIssueTypeContext(issueType string) string {
	switch issueType {
	case "vm-migration-stuck":
		return `
ISSUE CONTEXT:
VM live migration involves:
- kubevirt virt-handler pods on source and target nodes
- libvirt socket connections between nodes
- Storage volume attachment/detachment via Longhorn CSI
Common causes: Network connectivity, libvirt socket issues, volume attachment conflicts`

	case "volume-attachment-conflict":
		return `
ISSUE CONTEXT:
Volume attachment tickets track CSI volume operations.
Multiple tickets indicate:
- Stuck CSI attachment operations
- Longhorn volume controller issues
- Node communication problems with CSI driver`

	case "replica-faulted":
		return `
ISSUE CONTEXT - MULTI-LAYERED ANALYSIS REQUIRED:
You have been provided with data across multiple layers:
1. Volume Status (robustness, state, replica counts)
2. Node Disk Status (DiskPressure, capacity per node)
3. Replica Details (location, state, failure info per replica)
4. Pod Distribution (where VM pods are running)
5. Attachment State (CSI vs Longhorn layer)
6. Migration State (dangling migrations if any)

CORRELATION LOGIC (Priority order):

STEP 1: Check Node Disk Layer
IF all nodes show DISK_PRESSURE AND StorageScheduled > StorageMaximum:
  → ROOT CAUSE: Insufficient disk space on all nodes
  → COMPONENT: Longhorn replica scheduler
  → ACTION: Increase disk limits or move to larger disks
  → EXAMPLE: Node rke2-servers-0 shows 48GB scheduled but only 40GB max

STEP 2: Check Replica Distribution
IF all replicas are on nodes with DiskPressure:
  → ROOT CAUSE: Replicas cannot start due to no schedulable space
  → COMPONENT: Node storage subsystem
  → ACTION: Check which disks have space: kubectl get disks.longhorn.io -n longhorn-system

STEP 3: Check Attachment Layer Mismatch
IF Longhorn shows attached=true BUT CSI shows conflict:
  → ROOT CAUSE: Split-brain volume attachment
  → COMPONENT: CSI driver / Volume controller
  → ACTION: Check VolumeAttachment objects for conflicts

STEP 4: Check Migration Layer
IF MigrationState shows dangling migration:
  → ROOT CAUSE: Failed migration left volume in stuck state
  → COMPONENT: Migration controller
  → ACTION: Clear dangling migration: kubectl patch volume <name> --type=json -p='[{"op":"remove","path":"/status/currentMigrationNodeID"}]'

STEP 5: Check Pod Distribution
IF multiple launcher pods for same VM on different nodes:
  → ROOT CAUSE: Migration failed to clean up old pod
  → COMPONENT: KubeVirt virt-controller
  → ACTION: Delete old launcher pod

Use the STRUCTURED DATA above (Node Disk Status, Replica Details, etc.) as your PRIMARY source.
Logs are SECONDARY and only confirm what the structured data shows.`

	default:
		return ""
	}
}
