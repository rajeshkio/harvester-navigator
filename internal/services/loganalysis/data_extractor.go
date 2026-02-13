package loganalysis

import (
	types "github.com/rk280392/harvesterNavigator/internal/models"
)

// ExtractTroubleshootingData extracts comprehensive data from VM and node info
// This is what the AI agent uses for multi-layered analysis
func ExtractTroubleshootingData(
	vmInfo *types.VMInfo,
	allNodes []types.NodeWithMetrics,
) (
	nodeDiskStatus []types.NodeDiskInfo,
	replicaDetails []types.ReplicaDetail,
	podDistribution []types.PodLocation,
	attachmentState *types.AttachmentState,
	migrationState *types.MigrationState,
) {

	// Extract node disk status
	nodeDiskStatus = extractNodeDiskStatus(allNodes)

	// Extract replica details
	if vmInfo != nil {
		replicaDetails = extractReplicaDetails(vmInfo.ReplicaInfo)
		podDistribution = extractPodDistribution(vmInfo)
	}

	// Extract attachment state (if volume info available)
	if vmInfo != nil && vmInfo.VolumeName != "" {
		attachmentState = extractAttachmentState(vmInfo)
	}

	// Extract migration state (if available in VMI info)
	if vmInfo != nil && len(vmInfo.VMIInfo) > 0 {
		migrationState = extractMigrationState(vmInfo)
	}

	return
}

func extractNodeDiskStatus(nodes []types.NodeWithMetrics) []types.NodeDiskInfo {
	var diskStatus []types.NodeDiskInfo

	for _, node := range nodes {
		// NodeInfo is embedded, so fields are directly accessible
		for _, disk := range node.Disks {
			diskInfo := types.NodeDiskInfo{
				NodeName:         node.NodeInfo.Name,
				HasDiskPressure:  !disk.IsSchedulable,
				StorageScheduled: disk.StorageScheduled,
				StorageMaximum:   disk.StorageMaximum,
				StorageAvailable: disk.StorageAvailable,
				DiskPath:         disk.Path,
			}
			diskStatus = append(diskStatus, diskInfo)
		}
	}

	return diskStatus
}

func extractReplicaDetails(replicaInfo []types.ReplicaInfo) []types.ReplicaDetail {
	var details []types.ReplicaDetail

	for _, replica := range replicaInfo {
		detail := types.ReplicaDetail{
			Name:     replica.Name,
			NodeName: replica.NodeID,
			State:    replica.CurrentState,
			Mode:     "", // Not available in ReplicaInfo
			FailedAt: "", // Not directly available
			Started:  replica.Started,
			DiskPath: replica.DiskID, // Use DiskID as path info
		}
		details = append(details, detail)
	}

	return details
}

func extractPodDistribution(vmInfo *types.VMInfo) []types.PodLocation {
	var pods []types.PodLocation

	// Get node from VMIInfo
	var nodeName string
	var phase string
	if len(vmInfo.VMIInfo) > 0 {
		nodeName = vmInfo.VMIInfo[0].NodeName
		phase = vmInfo.VMIInfo[0].Phase
	}

	// Add VMI pod
	if vmInfo.PodName != "" && nodeName != "" {
		pods = append(pods, types.PodLocation{
			PodName:  vmInfo.PodName,
			NodeName: nodeName,
			Phase:    phase,
		})
	}

	return pods
}

func extractAttachmentState(vmInfo *types.VMInfo) *types.AttachmentState {
	// Get current node from VMIInfo
	var currentNode string
	if len(vmInfo.VMIInfo) > 0 {
		currentNode = vmInfo.VMIInfo[0].NodeName
	}

	state := &types.AttachmentState{
		CurrentNodeID:    currentNode,
		LonghornAttached: vmInfo.VolumeState == "attached",
		HasConflict:      false, // TODO: Detect CSI conflicts from attachment tickets
	}

	return state
}

func extractMigrationState(vmInfo *types.VMInfo) *types.MigrationState {
	// Check if there's migration info in VMIInfo
	var hasMigration bool
	if len(vmInfo.VMIInfo) > 0 && vmInfo.VMIInfo[0].MigrationInfo != nil {
		hasMigration = true
	}

	state := &types.MigrationState{
		IsDangling: false, // TODO: Detect dangling migration from volume backend
	}

	if hasMigration {
		// Migration is active or recent
		state.IsDangling = false
	}

	return state
}
