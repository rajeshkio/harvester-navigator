package loganalysis

import (
	"context"
	"fmt"
	"io"
	"strings"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func FetchPodLogs(ctx context.Context, clientset *kubernetes.Clientset, namespace, podName, containerName string, tailLines int64) (string, error) {
	podLogOpts := &corev1.PodLogOptions{
		Container: containerName,
		TailLines: &tailLines,
	}

	req := clientset.CoreV1().Pods(namespace).GetLogs(podName, podLogOpts)
	podLogs, err := req.Stream(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get logs for pod %s: %w", podName, err)
	}

	defer func() { _ = podLogs.Close() }()

	buf := new(io.Reader)
	*buf = podLogs
	logs, err := io.ReadAll(*buf)
	if err != nil {
		return "", fmt.Errorf("failed to read logs: %w", err)
	}

	logContent := string(logs)
	lines := strings.Split(logContent, "\n")
	var relevantLines []string

	for _, line := range lines {
		lowerLine := strings.ToLower(line)
		if strings.Contains(lowerLine, "error") ||
			strings.Contains(lowerLine, "warn") ||
			strings.Contains(lowerLine, "fail") ||
			strings.Contains(lowerLine, "fatal") ||
			strings.Contains(lowerLine, "level=error") ||
			strings.Contains(lowerLine, "level=warn") ||
			strings.Contains(lowerLine, "degraded") ||
			strings.Contains(lowerLine, "faulted") ||
			strings.Contains(lowerLine, "replica") ||
			strings.Contains(lowerLine, "robustness") ||
			strings.Contains(lowerLine, "not schedulable") ||
			strings.Contains(lowerLine, "no healthy") {
			relevantLines = append(relevantLines, line)
		}
	}

	if len(relevantLines) > 0 {
		return strings.Join(relevantLines, "\n"), nil
	}

	// If no errors found, return last 50 lines as fallback
	if len(lines) > 50 {
		return strings.Join(lines[len(lines)-50:], "\n"), nil
	}
	return logContent, nil
}

func CollectLogsForIssue(ctx context.Context, clientset *kubernetes.Clientset, req types.LogAnalysisRequest) (string, error) {
	var logParts []string

	switch req.IssueType {
	case "replica-faulted":
		// 1. Longhorn manager pods — contain volume/replica state-change events
		//    e.g. "volume robustness changed to degraded", "replica X is in error state"
		managerPods, err := clientset.CoreV1().Pods("longhorn-system").List(ctx, metav1.ListOptions{
			LabelSelector: "app=longhorn-manager",
		})
		if err != nil {
			logParts = append(logParts, fmt.Sprintf("(failed to list longhorn-manager pods: %v)", err))
		} else {
			limit := 2
			if len(managerPods.Items) < limit {
				limit = len(managerPods.Items)
			}
			for i := 0; i < limit; i++ {
				podName := managerPods.Items[i].Name
				logs, err := FetchPodLogs(ctx, clientset, "longhorn-system", podName, "longhorn-manager", 500)
				if err != nil {
					logParts = append(logParts, fmt.Sprintf("(failed to get logs from longhorn-manager %s: %v)", podName, err))
				} else {
					logParts = append(logParts, fmt.Sprintf("=== Longhorn Manager: %s ===", podName))
					logParts = append(logParts, logs)
				}
			}
		}

		// 2. Instance-manager pods — contain engine/replica process errors
		imPods, err := clientset.CoreV1().Pods("longhorn-system").List(ctx, metav1.ListOptions{
			LabelSelector: "longhorn.io/component=instance-manager",
		})
		if err != nil {
			logParts = append(logParts, fmt.Sprintf("(failed to list instance-manager pods: %v)", err))
		} else {
			limit := 2
			if len(imPods.Items) < limit {
				limit = len(imPods.Items)
			}
			for i := 0; i < limit; i++ {
				podName := imPods.Items[i].Name
				logs, err := FetchPodLogs(ctx, clientset, "longhorn-system", podName, "instance-manager", 200)
				if err != nil {
					logParts = append(logParts, fmt.Sprintf("(failed to get logs from instance-manager %s: %v)", podName, err))
				} else {
					logParts = append(logParts, fmt.Sprintf("=== Instance Manager: %s ===", podName))
					logParts = append(logParts, logs)
				}
			}
		}

		// 3. Volume-specific replica pods (if volume name provided)
		if req.VolumeName != "" {
			replicaPods, err := clientset.CoreV1().Pods("longhorn-system").List(ctx, metav1.ListOptions{
				LabelSelector: fmt.Sprintf("longhornvolume=%s", req.VolumeName),
			})
			if err == nil && len(replicaPods.Items) > 0 {
				for _, pod := range replicaPods.Items {
					logs, err := FetchPodLogs(ctx, clientset, "longhorn-system", pod.Name, "", 200)
					if err == nil {
						logParts = append(logParts, fmt.Sprintf("=== Replica pod for volume %s: %s ===", req.VolumeName, pod.Name))
						logParts = append(logParts, logs)
					}
				}
			}
		}

	default:
		return "", fmt.Errorf("log collection not implemented for issue type: %s", req.IssueType)
	}

	if len(logParts) == 0 {
		return "", fmt.Errorf("no logs collected")
	}

	return strings.Join(logParts, "\n\n"), nil
}
