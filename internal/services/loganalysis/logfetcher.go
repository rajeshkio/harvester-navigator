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

	defer podLogs.Close()

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
		lowerline := strings.ToLower(line)
		if strings.Contains(lowerline, "error") ||
			strings.Contains(lowerline, "warn") ||
			strings.Contains(lowerline, "fail") || strings.Contains(lowerline, "fatal") {
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

		pods, err := clientset.CoreV1().Pods("longhorn-system").List(ctx, metav1.ListOptions{
			LabelSelector: "longhorn.io/component=instance-manager",
		})
		if err != nil {
			return "", fmt.Errorf("failed to list instance-manager pods: %w", err)
		}
		if len(pods.Items) == 0 {
			return "", fmt.Errorf("no instance-manager pods found")
		}
		limit := 2
		if len(pods.Items) < limit {
			limit = len(pods.Items)
		}
		for i := 0; i < limit; i++ {
			podName := pods.Items[i].Name
			logs, err := FetchPodLogs(ctx, clientset, "longhorn-system", podName, "instance-manager", 300)
			if err != nil {
				logParts = append(logParts, fmt.Sprintf("Failed to get logs from %s: %v", podName, err))
			} else {
				logParts = append(logParts, fmt.Sprintf("=== Instance Manager: %s (last 300 lines) ===", podName))
				logParts = append(logParts, logs)
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
