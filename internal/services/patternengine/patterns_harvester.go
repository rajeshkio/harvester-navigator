package patternengine

// harvesterPatterns are Longhorn/KubeVirt/Harvester patterns grounded in real log output.
// All msg= strings and error= substrings were extracted from actual support bundles.
// Longhorn log format: level=<level> msg="<message>" [key=value ...]
var harvesterPatterns = []PatternV2{

	// ── Volume Degraded ───────────────────────────────────────────────────────
	// Source: volume_controller.go — emitted every reconcile loop while degraded
	{
		ID: "longhorn-volume-degraded", Name: "Longhorn Volume Degraded", Category: "Longhorn",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "Volume is in degraded state — fewer healthy replicas than required",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "Failed to auto-balance volume in degraded state", Weight: 1.0},
			{Type: "keyword", Pattern: "Cannot auto-balance volume in degraded state", Weight: 1.0},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-rebuild-throttled", Message: "Rebuild throttle is preventing new replicas from starting, keeping volume degraded"},
			{PatternID: "longhorn-replica-connection-refused", Message: "A replica process is unreachable, which caused the degraded state"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check how many healthy replicas the volume has. If rebuild is throttled, wait or increase the concurrent rebuild limit.",
			Command:    "kubectl get volumes.longhorn.io <volume-name> -n longhorn-system -o jsonpath='{.status.robustness} {.status.state}'",
		},
	},

	// ── Replica Rebuild Throttled ─────────────────────────────────────────────
	// Source: replica_controller.go:506 — emitted when rebuild queue is full
	{
		ID: "longhorn-rebuild-throttled", Name: "Replica Rebuild Throttled", Category: "Longhorn",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "Replica rebuild queue is at capacity — new replicas are waiting to start",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "reaches or exceeds the concurrent limit value", Weight: 1.0},
			{Type: "keyword", Pattern: "are in progress on this node, which reaches or exceeds", Weight: 1.0},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-volume-degraded", Message: "Volumes stay degraded while their replicas wait in the rebuild queue"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Multiple replicas are rebuilding simultaneously hitting the concurrency limit. You can raise the limit in Longhorn settings, or wait for current rebuilds to finish.",
			Command:    "kubectl get setting concurrent-replica-rebuild-per-node-limit -n longhorn-system",
		},
	},

	// ── Engine / Replica Process Crashed ─────────────────────────────────────
	// Source: instance_handler.go — emitted when instance manager reports process exit
	{
		ID: "longhorn-engine-crashed", Name: "Longhorn Engine Process Crashed", Category: "Longhorn",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "A Longhorn engine process crashed on an instance manager",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "crashed on Instance Manager", Weight: 1.0},
			{Type: "keyword", Pattern: "getting log", Weight: 0.3},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-volume-degraded", Message: "Engine crash causes volume to lose quorum and go degraded"},
			{PatternID: "longhorn-replica-connection-refused", Message: "Crashed engine makes its replicas unreachable"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check instance-manager logs on the affected node for the crash reason. OOM is a common cause on busy nodes.",
			Command:    "kubectl logs -n longhorn-system <instance-manager-pod> | grep -i 'crash\\|signal\\|killed\\|oom'",
		},
	},

	// ── Replica Connection Refused ────────────────────────────────────────────
	// Source: snapshot reconciler — connection refused to replica gRPC port
	{
		ID: "longhorn-replica-connection-refused", Name: "Replica Process Unreachable", Category: "Longhorn",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "Longhorn cannot reach a replica's gRPC endpoint — replica process is down",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "failed to get replica", Weight: 0.7},
			{Type: "keyword", Pattern: "connect: connection refused", Weight: 0.7},
			{Type: "keyword", Pattern: "failed to get replica", Weight: 0.5},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-engine-crashed", Message: "Crashed engine causes its replica connections to be refused"},
			{PatternID: "longhorn-volume-degraded", Message: "Unreachable replica reduces healthy replica count"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "The replica's instance-manager process is not listening. Check if the instance-manager pod is healthy on the node hosting this replica.",
			Command:    "kubectl get pods -n longhorn-system -l longhorn.io/component=instance-manager -o wide",
		},
	},

	// ── Volume Attachment Conflict (split-brain) ──────────────────────────────
	// Source: admission.go:106 — VolumeAttachment webhook rejects conflicting attach
	{
		ID: "longhorn-attachment-conflict", Name: "Volume Attachment Conflict", Category: "Longhorn",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "Longhorn admission webhook rejected a VolumeAttachment update — volume is already attached to too many nodes",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "cannot attach migratable volume", Weight: 1.0},
			{Type: "keyword", Pattern: "to more than two nodes", Weight: 1.0},
			{Type: "keyword", Pattern: "Rejected operation", Weight: 0.4},
			{Type: "keyword", Pattern: "Kind=VolumeAttachment", Weight: 0.4},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-migration-blocked", Message: "Attachment conflict often caused by a stuck migration leaving stale attachment on old node"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check VolumeAttachment object for this volume — it likely has attachment tickets for 3+ nodes. Delete stale tickets from the completed/failed migration.",
			Command:    "kubectl get volumeattachments.longhorn.io <volume-name> -n longhorn-system -o yaml | grep -A5 attachmentTickets",
		},
	},

	// ── Migration Blocked by Upgrade ─────────────────────────────────────────
	// Source: volume_controller.go:processMigration — volume upgrade takes priority
	{
		ID: "longhorn-migration-blocked", Name: "Migration Blocked by Volume Upgrade", Category: "Longhorn",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "Volume migration is being skipped because a volume engine upgrade is in progress",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "Skip the migration processing since the volume is being upgraded", Weight: 1.0},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-attachment-conflict", Message: "Blocked migration can leave stale attachment tickets causing conflicts"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Wait for the engine upgrade to complete. If stuck, check the volume's engine upgrade status.",
			Command:    "kubectl get volumes.longhorn.io -n longhorn-system -o jsonpath='{range .items[?(@.status.currentMigrationNodeID!=\"\")]}{.metadata.name}{\" migration=\"}{.status.currentMigrationNodeID}{\"\\n\"}{end}'",
		},
	},

	// ── Disk Not Ready ────────────────────────────────────────────────────────
	// Source: backing_image_controller.go:1261
	{
		ID: "longhorn-disk-not-ready", Name: "Longhorn Disk Not Ready", Category: "Longhorn",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "A Longhorn disk is not ready — backing image manager cannot start on this disk",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "Disk is not ready hence backing image manager can not be created", Weight: 1.0},
			{Type: "keyword", Pattern: "disk is not ready", Weight: 0.8},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-volume-degraded", Message: "Unready disk reduces schedulable space, blocking replica placement"},
			{PatternID: "longhorn-rebuild-throttled", Message: "Disk issues can stall ongoing rebuilds"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check the disk's conditions in the Longhorn node object. Common causes: disk full, filesystem errors, or node not ready.",
			Command:    "kubectl get nodes.longhorn.io -n longhorn-system -o jsonpath='{range .items[*]}{.metadata.name}{\"\\n\"}{range .status.diskStatus.*}{.diskUUID}{\" conditions=\"}{.conditions}{\"\\n\"}{end}{end}'",
		},
	},

	// ── Snapshot Sync Failure ─────────────────────────────────────────────────
	// Source: snapshot reconciler — replica unreachable during snapshot operation
	{
		ID: "longhorn-snapshot-sync-failed", Name: "Longhorn Snapshot Sync Failed", Category: "Longhorn",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "Longhorn snapshot sync failed — replica is unreachable during snapshot operation",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "Failed to sync Longhorn snapshot", Weight: 1.0},
			{Type: "keyword", Pattern: "Failed to sync Longhorn backup", Weight: 0.9},
		},
		Correlations: []Correlation{
			{PatternID: "longhorn-replica-connection-refused", Message: "Snapshot fails when replica gRPC endpoint is unreachable"},
			{PatternID: "longhorn-engine-crashed", Message: "Crashed engine makes snapshot operations fail on its replicas"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check replica health for volumes with pending snapshots. Snapshot sync will resume once replicas are healthy.",
			Command:    "kubectl get snapshots.longhorn.io -n longhorn-system | grep -v Completed",
		},
	},

	// ── KubeVirt CPU Label Mismatch ───────────────────────────────────────────
	// Source: kube-scheduler events — node affinity rejection during VM migration
	{
		ID: "kubevirt-cpu-label-mismatch", Name: "CPU Feature Label Mismatch", Category: "KubeVirt",
		Severity: SeverityCritical, Confidence: ConfidenceLikely,
		Description: "VM migration blocked by CPU feature label inconsistency — common after KubeVirt upgrade",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "ipred-ctrl", Weight: 1.0},
			{Type: "keyword", Pattern: "cpu-feature.node.kubevirt.io", Weight: 0.7},
			{Type: "keyword", Pattern: "node affinity", Weight: 0.4},
			{Type: "keyword", Pattern: "didn't match node selector", Weight: 0.4},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Add missing CPU feature labels to nodes lacking them. Annotate nodes to prevent node-labeller overwrite.",
			Command:    "kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.metadata.labels.cpu-feature\\.node\\.kubevirt\\.io/ipred-ctrl}{\"\\n\"}{end}'",
		},
	},

	// ── Harvester Fleet Stuck ─────────────────────────────────────────────────
	{
		ID: "harvester-fleet-stuck", Name: "Fleet Agent Stuck During Upgrade", Category: "HarvesterUpgrade",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "Fleet agent stuck in PodInitializing during Harvester upgrade — known race condition",
		Matchers: []Matcher{
			{Type: "regex", Pattern: `fleet-agent.* PodInitializing`, Weight: 1.0},
			{Type: "keyword", Pattern: "waiting for fleet", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Rollback Fleet Helm release to the last deployed revision.",
			Command:    "helm history -n cattle-fleet-system fleet && helm rollback fleet -n cattle-fleet-system <last-deployed-revision>",
			References: []string{"https://docs.harvesterhci.io/v1.4/upgrade/v1-3-2-to-v1-4-0/#3-upgrade-stuck-on-waiting-for-fleet"},
		},
	},
}
