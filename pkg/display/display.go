package display

import (
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"text/tabwriter"

	types "github.com/rk280392/harvesterNavigator/internal/models"
)

// Helper functions for safe printing with error handling
func safePrint(w *tabwriter.Writer, format string, args ...interface{}) {
	if _, err := fmt.Fprintf(w, format, args...); err != nil {
		log.Printf("Display error: %v", err)
	}
}

func safePrintln(w *tabwriter.Writer, text string) {
	if _, err := fmt.Fprintln(w, text); err != nil {
		log.Printf("Display error: %v", err)
	}
}

func DisplayVMInfo(info *types.VMInfo) {
	// Create a tabwriter for consistent alignment
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	displayHeader(w, info)
	displayVMInfo(w, info)
	displayPodInfo(w, info)
	displayVMIInfo(w, info)
	displayStorageInfo(w, info)
	if err := w.Flush(); err != nil {
		log.Printf("Failed to flush writer: %v", err)
	}

	if _, err := fmt.Fprintln(w, strings.Repeat("=", 80)); err != nil {
		log.Printf("Failed to write separator: %v", err)
	}

	displayEngineInfo(w, info)
	displayReplicaInfo(info)

	// Footer
	fmt.Println("\n" + strings.Repeat("=", 80))
}

func displayHeader(w *tabwriter.Writer, info *types.VMInfo) {
	if _, err := fmt.Fprintln(w, strings.Repeat("=", 80)); err != nil {
		log.Printf("Failed to write separator: %v", err)
	}
	if _, err := fmt.Fprintf(w, "VIRTUAL MACHINE DETAILS: %s\n", info.Name); err != nil {
		log.Printf("Failed to write VM details: %v", err)
	}
	if _, err := fmt.Fprintln(w, strings.Repeat("=", 80)); err != nil {
		log.Printf("Failed to write separator: %v", err)
	}
}

func displayVMInfo(w *tabwriter.Writer, info *types.VMInfo) {
	// VM details section
	safePrintln(w, "\nVIRTUAL MACHINE INFO:")
	safePrintln(w, "------------------------")
	safePrint(w, "Name:\t%s\n", info.Name)
	safePrint(w, "Image ID:\t%s\n", info.ImageId)
	safePrint(w, "Storage Class:\t%s\n", info.StorageClass)
	safePrint(w, "Status:\t%s\n", formatVMStatus(string(info.VMStatus)))
	safePrint(w, "Status Reason:\t%s\n", formatVMStatusReason(info.VMStatusReason))
	safePrint(w, "Printable Status:\t%s\n", formatPrintableStatus(info.PrintableStatus))
}

func displayVMIInfo(w *tabwriter.Writer, info *types.VMInfo) {
	if len(info.VMIInfo) > 0 {
		safePrint(w, "\nVMI INFORMATION:\n")
		safePrintln(w, "------------------------")
		for _, vmi := range info.VMIInfo {
			safePrint(w, "VMIName:\t%s\n", vmi.Name)
			safePrint(w, "NodeName:\t%s\n", vmi.NodeName)
			safePrint(w, "Phase:\t%s\n", formatPrintableStatus(vmi.Phase))

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
		safePrint(w, "POD UUID:\t%s\n", podUID)
		safePrint(w, "Node Name:\t%s\n", nodeName)
	}
}

func displayGuestOSInfo(w *tabwriter.Writer, vmi types.VMIInfo) {
	if vmi.GuestOSInfo.Name != "" {
		if vmi.GuestOSInfo.PrettyName != "" {
			safePrint(w, "Guest OS:\t%s\n", vmi.GuestOSInfo.PrettyName)
		} else {
			safePrint(w, "Guest OS:\t%s \t%s\n", vmi.GuestOSInfo.Name, vmi.GuestOSInfo.Version)
		}
	}
}
func displayInterfaceInfo(w *tabwriter.Writer, vmi types.VMIInfo) {
	if len(vmi.Interfaces) == 0 {
		safePrint(w, "  No interfaces found\n")
		return
	}
	for _, iface := range vmi.Interfaces {
		// Only display interfaces with both MAC and IP (or just IP if that's acceptable)
		if iface.Mac != "" { // Check for MAC if required
			safePrint(w, "  MAC Address: %s\n", iface.Mac)
			safePrint(w, "  IP Address:  %s\n", iface.IpAddress)
			safePrintln(w, "") // Add a blank line between interfaces
		} else if iface.IpAddress != "" && iface.IpAddress != "127.0.0.1" {
			// Only print IP addresses without MAC if they're not localhost
			safePrint(w, "  IP Address:  %s\n", iface.IpAddress)
			safePrintln(w, "") // Add a blank line
		}
	}
}

func displayPodInfo(w *tabwriter.Writer, info *types.VMInfo) {
	if len(info.PodInfo) > 0 {
		safePrint(w, "\nPOD INFORMATION:\n")
		safePrintln(w, "------------------------")

		for _, pod := range info.PodInfo {
			safePrint(w, "Pod Name:\t%s\n", info.PodName)
			safePrint(w, "Node Name:\t%s\n", pod.NodeID)
			safePrint(w, "Pod State:\t%s\n", formatPrintableStatus(pod.Status))
		}
	}
}
func displayStorageInfo(w *tabwriter.Writer, info *types.VMInfo) {
	safePrintln(w, "\nSTORAGE INFO:")
	safePrintln(w, "-------------")
	safePrint(w, "PVC Claim Names:\t%s\n", info.ClaimNames)
	safePrint(w, "Volume Name:\t%s\n", info.VolumeName)
	safePrint(w, "PVC Status:\t%s\n", formatPVCStatus(string(info.PVCStatus)))
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
		safePrint(w, "Name:\t%s\n", engine.Name)
		safePrint(w, "Node ID:\t%s\n", engine.NodeID)
		safePrint(w, "Current State:\t%s\n", formatState(engine.CurrentState))
		safePrint(w, "Active:\t%s\n", formatBool(engine.Active))
		safePrint(w, "Started:\t%s\n", formatBool(engine.Started))
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
	nameWidth := 11
	stateWidth := 9
	nodeWidth := 20
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

var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

func padToVisualWidth(s string, width int) string {
	// Strip ANSI escape codes to get visible length
	visible := ansiRegex.ReplaceAllString(s, "")
	visibleLen := len(visible)

	if visibleLen >= width {
		return s // already wide enough
	}

	padding := strings.Repeat(" ", width-visibleLen)
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
