package patternengine

import (
	"context"
	"strings"
	"testing"
)

// TestPriorityWithRealisticFrequencies verifies that the dominant signal in the logs wins.
// Simulates a 500-line tail window where degraded warnings dominate.
func TestPriorityWithRealisticFrequencies(t *testing.T) {
	degraded := strings.Repeat(`level=warning msg="Failed to auto-balance volume in degraded state" volume=pvc-abc`+"\n", 300)
	rebuild := strings.Repeat(`level=warning msg="Replica rebuildings for map[pvc-abc:{}] are in progress on this node, which reaches or exceeds the concurrent limit value 5"`+"\n", 75)
	conflict := strings.Repeat(`level=warning msg="Rejected operation" error="cannot attach migratable volume pvc-abc to more than two nodes"`+"\n", 15)
	snapshot := strings.Repeat(`level=error msg="Failed to sync Longhorn snapshot" error="failed to get replica 10.0.1.1:1234: connect: connection refused"`+"\n", 10)

	logs := degraded + rebuild + conflict + snapshot

	a := NewAnalyzer()
	result, err := a.AnalyzeLogs(context.Background(), logs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("expected result, got nil")
	}
	// degraded (300 hits) should beat conflict (15 hits) and snapshot (10 hits)
	if result.FailingComponent != "Longhorn" {
		t.Errorf("expected Longhorn component, got %s", result.FailingComponent)
	}
	if !strings.Contains(result.RootCause, "degraded") && !strings.Contains(result.RootCause, "Degraded") &&
		!strings.Contains(result.RootCause, "Rebuild") && !strings.Contains(result.RootCause, "rebuild") {
		t.Errorf("expected degraded or rebuild as root cause, got: %s", result.RootCause[:min(80, len(result.RootCause))])
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
