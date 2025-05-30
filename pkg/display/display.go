package display

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	types "github.com/rk280392/harvesterNavigator/internal/models"
)

func DisplayVMInfo(info *types.VMInfo) {
	// Create a tabwriter for consistent alignment
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	displayHeader(w, info)
	displayVMInfo(w, info)
	displayPodInfo(w, info)
	displayVMIInfo(w, info)
	displayStorageInfo(w, info)
	w.Flush()

	displayEngineInfo(w, info)
	displayReplicaInfo(info)

	// Footer
	fmt.Println("\n" + strings.Repeat("=", 80))
}

func displayHeader(w *tabwriter.Writer, info *types.VMInfo) {
	fmt.Fprintln(w, strings.Repeat("=", 80))
	fmt.Fprintf(w, "VIRTUAL MACHINE DETAILS: %s\n", info.Name)
	fmt.Fprintln(w, strings.Repeat("=", 80))
}

func displayVMInfo(w *tabwriter.Writer, info *types.VMInfo) {
	// VM details section
	fmt.Fprintln(w, "\nVIRTUAL MACHINE INFO:")
	fmt.Fprintln(w, "------------------------")
	fmt.Fprintf(w, "Name:\t%s\n", info.Name)
	fmt.Fprintf(w, "Image ID:\t%s\n", info.ImageId)
	fmt.Fprintf(w, "Storage Class:\t%s\n", info.StorageClass)
	fmt.Fprintf(w, "Status:\t%s\n", formatVMStatus(string(info.VMStatus)))
	fmt.Fprintf(w, "Status Reason:\t%s\n", formatVMStatusReason(info.VMStatusReason))
	fmt.Fprintf(w, "Printable Status:\t%s\n", formatPrintableStatus(info.PrintableStatus))
}

func displayVMIInfo(w *tabwriter.Writer, info *types.VMInfo) {
	if len(info.VMIInfo) > 0 {
		fmt.Fprintf(w, "\nVMI INFORMATION:\n")
		fmt.Fprintln(w, "------------------------")
		for _, vmi := range info.VMIInfo {
			fmt.Fprintf(w, "VMIName:\t%s\n", vmi.Name)
			fmt.Fprintf(w, "NodeName:\t%s\n", vmi.NodeName)
			fmt.Fprintf(w, "Phase:\t%s\n", formatPrintableStatus(vmi.Phase))

			displayVMIActivePodsInfo(w, vmi)
			displayGuestOSInfo(w, vmi)
			displayInterfaceInfo(w, vmi)
		}
	}
}
func displayVMIActivePodsInfo(w *tabwriter.Writer, vmi types.VMIInfo) {
	if len(vmi.ActivePods) == 0 {
		return
	}

	for podUID, nodeName := range vmi.ActivePods {
		fmt.Fprintf(w, "POD UUID:\t%s\n", podUID)
		fmt.Fprintf(w, "Node Name:\t%s\n", nodeName)
	}
}

func displayGuestOSInfo(w *tabwriter.Writer, vmi types.VMIInfo) {
	if vmi.GuestOSInfo.Name != "" {
		if vmi.GuestOSInfo.PrettyName != "" {
			fmt.Fprintf(w, "Guest OS:\t%s\n", vmi.GuestOSInfo.PrettyName)
		} else {
			fmt.Fprintf(w, "Guest OS:\t%s \t%s\n", vmi.GuestOSInfo.Name, vmi.GuestOSInfo.Version)
		}
	}
}
func displayInterfaceInfo(w *tabwriter.Writer, vmi types.VMIInfo) {
	if len(vmi.Interfaces) == 0 {
		fmt.Fprintf(w, "  No interfaces found\n")
		return
	}
	for _, iface := range vmi.Interfaces {
		// Only display interfaces with both MAC and IP (or just IP if that's acceptable)
		if iface.Mac != "" { // Check for MAC if required
			fmt.Fprintf(w, "  MAC Address: %s\n", iface.Mac)
			fmt.Fprintf(w, "  IP Address:  %s\n", iface.IpAddress)
			fmt.Fprintln(w) // Add a blank line between interfaces
		} else if iface.IpAddress != "" && iface.IpAddress != "127.0.0.1" {
			// Only print IP addresses without MAC if they're not localhost
			fmt.Fprintf(w, "  IP Address:  %s\n", iface.IpAddress)
			fmt.Fprintln(w) // Add a blank line
		}
	}
}

func displayPodInfo(w *tabwriter.Writer, info *types.VMInfo) {
	if len(info.PodInfo) > 0 {
		fmt.Fprintf(w, "\nPOD INFORMATION:\n")
		fmt.Fprintln(w, "------------------------")

		for _, pod := range info.PodInfo {
			fmt.Fprintf(w, "Pod Name:\t%s\n", info.PodName)

			fmt.Fprintf(w, "Node Name:\t%s\n", pod.NodeID)
			fmt.Fprintf(w, "Pod State:\t%s\n", formatPrintableStatus(pod.Status))
		}
	}
}
func displayStorageInfo(w *tabwriter.Writer, info *types.VMInfo) {
	fmt.Fprintln(w, "\nSTORAGE INFO:")
	fmt.Fprintln(w, "-------------")
	fmt.Fprintf(w, "PVC Claim Names:\t%s\n", info.ClaimNames)
	fmt.Fprintf(w, "Volume Name:\t%s\n", info.VolumeName)
	fmt.Fprintf(w, "PVC Status:\t%s\n", formatPVCStatus(string(info.PVCStatus)))
}
func displayEngineInfo(w *tabwriter.Writer, info *types.VMInfo) {
	if len(info.EngineInfo) == 0 {
		return
	}
	fmt.Println("\nENGINE INFORMATION:")
	fmt.Println("-----------------")
	for i, engine := range info.EngineInfo {
		if i > 0 {
			fmt.Println("\n--- Engine", i+1, "---")
		}
		fmt.Fprintf(w, "Name:\t%s\n", engine.Name)
		fmt.Fprintf(w, "Node ID:\t%s\n", engine.NodeID)
		fmt.Fprintf(w, "Current State:\t%s\n", formatState(engine.CurrentState))
		fmt.Fprintf(w, "Active:\t%s\n", formatBool(engine.Active))
		fmt.Fprintf(w, "Started:\t%s\n", formatBool(engine.Started))
	}
}

func displayReplicaInfo(info *types.VMInfo) {
	if len(info.ReplicaInfo) > 0 {
		printReplicaTable(info.ReplicaInfo)
	} else if info.MissingResource != "" {
		fmt.Printf("\nProcess stopped: %s resource not found\n", info.MissingResource)
	} else {
		fmt.Println("\nNo replicas found for this volume")
	}
}

func printReplicaTable(replicas []types.ReplicaInfo) {
	fmt.Println("\nREPLICAS:")
	fmt.Println("---------")

	// Define column widths
	nameWidth := 15
	stateWidth := 10
	nodeWidth := 12
	ownerWidth := 45
	startedWidth := 12
	engineWidth := 45
	activeWidth := 12

	// Print headers
	fmt.Printf("%s %s %s %s %s %s %s\n",
		padToVisualWidth("NAME", nameWidth),
		padToVisualWidth("STATE", stateWidth),
		padToVisualWidth("NODE", nodeWidth),
		padToVisualWidth("OWNER", ownerWidth),
		padToVisualWidth("STARTED", startedWidth),
		padToVisualWidth("ENGINE", engineWidth),
		padToVisualWidth("ACTIVE", activeWidth))

	fmt.Printf("%s %s %s %s %s %s %s\n",
		padToVisualWidth("----", nameWidth),
		padToVisualWidth("-----", stateWidth),
		padToVisualWidth("----", nodeWidth),
		padToVisualWidth("-----", ownerWidth),
		padToVisualWidth("-------", startedWidth),
		padToVisualWidth("------", engineWidth),
		padToVisualWidth("------", activeWidth))

	// Print each replica row
	for _, replica := range replicas {
		shortName := shortenName(replica.Name)
		stateFormatted := formatState(replica.CurrentState)
		startedFormatted := formatBool(replica.Started)
		activeFormatted := formatBool(replica.Active)

		fmt.Printf("%s %s %s %s %s %s %s\n",
			padToVisualWidth(shortName, nameWidth),
			padToVisualWidth(stateFormatted, stateWidth),
			padToVisualWidth(replica.NodeID, nodeWidth),
			padToVisualWidth(replica.OwnerRefName, ownerWidth),
			padToVisualWidth(startedFormatted, startedWidth),
			padToVisualWidth(replica.EngineName, engineWidth),
			padToVisualWidth(activeFormatted, activeWidth))
	}
}
func padToVisualWidth(s string, width int) string {
	// Calculate the number of invisible characters (ANSI escape codes)
	invisibleChars := 0
	if strings.Contains(s, "\033[") {
		// Each color code sequence is typically something like "\033[32m" and "\033[0m"
		invisibleChars = strings.Count(s, "\033[") * 4
		// Add 1 for each "m" character
		invisibleChars += strings.Count(s, "m")
	}

	totalWidth := width + invisibleChars
	actualLen := len(s)
	padding := ""

	if actualLen < totalWidth {
		padding = strings.Repeat(" ", totalWidth-actualLen)
	}

	return s + padding
}

// Helper function to shorten the replica names for better display
func shortenName(name string) string {
	// For longhorn replicas, extract just the unique part at the end
	if strings.Contains(name, "-r-") {
		parts := strings.Split(name, "-r-")
		if len(parts) == 2 {
			return "r-" + parts[1]
		}
	}

	return name
}

func formatVMStatus(status string) string {
	switch strings.ToLower(status) {
	case "true":
		return "\033[32mTrue\033[0m" // Green
	case "false":
		return "\033[31mFalse\033[0m" // Red
	default:
		return status
	}
}

func formatVMStatusReason(reason string) string {
	switch reason {
	case "GuestNotRunning":
		return "\033[31mGuestNotRunning\033[0m" // Red
	case "Running":
		return "\033[32mRunning\033[0m" // Green
	case "Starting":
		return "\033[33mStarting\033[0m" // Yellow
	case "Stopping":
		return "\033[33mStopping\033[0m" // Yellow
	case "Error":
		return "\033[31;1mError\033[0m" // Bold red
	default:
		return reason
	}
}

func formatPrintableStatus(status string) string {
	lower := strings.ToLower(status)
	if strings.Contains(lower, "starting") {
		return "\033[33mStarting\033[0m" // Yellow
	} else if strings.Contains(lower, "running") {
		return "\033[32mRunning\033[0m" // Green
	} else if strings.Contains(lower, "stopped") || strings.Contains(lower, "stopping") {
		return "\033[31mStopped\033[0m" // Red
	} else if strings.Contains(lower, "error") || strings.Contains(lower, "fail") {
		return "\033[31;1m" + status + "\033[0m" // Bold red
	}
	return status
}

// Format state with colors
func formatState(state string) string {
	switch state {
	case "running":
		return "\033[32mRUNNING\033[0m" // Green
	case "stopped":
		return "\033[31mSTOPPED\033[0m" // Red
	case "error":
		return "\033[31;1mERROR\033[0m" // Bold red
	default:
		return state
	}
}

func formatPVCStatus(status string) string {
	switch strings.ToLower(status) {
	case "bound":
		return "\033[32mBound\033[0m" // Green
	case "pending":
		return "\033[33mPending\033[0m" // Yellow
	case "lost":
		return "\033[31mLost\033[0m" // Red
	default:
		return status
	}
}

// Format boolean with colors and symbols
func formatBool(b bool) string {
	if b {
		return "\033[32mYES ✓\033[0m"
	}
	return "\033[31mNO ✗\033[0m"
}

// commenting the snapshot tree part as suggested by Vicente. Having too much info can be confusing
// Also, it may not be useful in knowing why VM is not running

// func displaySnapshotTree(snapshots map[string]types.SnapshotInfo) {
// 	// Find the root node (one without a parent)
// 	var rootID string
// 	for id, snapshot := range snapshots {
// 		if snapshot.Parent == "" {
// 			rootID = id
// 			break
// 		}
// 	}

// 	if rootID == "" {
// 		fmt.Println("Could not determine snapshot tree root")
// 		return
// 	}

// 	// Recursively display the tree
// 	displaySnapshotNode(snapshots, rootID, "")
// }

// // Recursive function to display a node and its children
// func displaySnapshotNode(snapshots map[string]types.SnapshotInfo, nodeID string, indent string) {
// 	node, exists := snapshots[nodeID]
// 	if !exists {
// 		return
// 	}

// 	// Display the current node
// 	label := nodeID
// 	if node.UserCreated {
// 		label += " (user)"
// 	}
// 	if node.Removed {
// 		label += " (removed)"
// 	}

// 	fmt.Println(indent + "└── " + label)

// 	// Display children with increased indentation
// 	childIndent := indent + "    "
// 	for childID := range node.Children {
// 		displaySnapshotNode(snapshots, childID, childIndent)
// 	}
// }
