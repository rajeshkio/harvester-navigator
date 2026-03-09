package patternengine

// genericPatterns are ported from r8s - generic Kubernetes patterns
var genericPatterns = []PatternV2{
	{
		ID: "oomkill", Name: "OOMKill Detected", Category: "OOM",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "Container was killed due to memory limits",
		Matchers: []Matcher{
			{Type: "regex", Pattern: `Memory cgroup out of memory: Kill process \d+ \((?P<Process>\S+)\) score \d+ or sacrifice child`, Weight: 1.0},
			{Type: "keyword", Pattern: "out of memory", Weight: 1.0},
			{Type: "keyword", Pattern: "oomkill", Weight: 1.0},
			{Type: "keyword", Pattern: "oom_kill_process", Weight: 1.0},
			{Type: "keyword", Pattern: "killed process", Weight: 0.8},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Increase memory limit in pod spec or optimize application memory usage",
			Command:    "kubectl describe pod {{.PodName}} -n {{.Namespace}} | grep -A5 'Last State'",
			References: []string{"https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"},
		},
	},
	{
		ID: "imagepullbackoff", Name: "ImagePullBackOff", Category: "Image",
		Severity: SeverityWarning, Confidence: ConfidenceCertain,
		Description: "Cannot pull container image from registry",
		Matchers: []Matcher{
			{Type: "regex", Pattern: `Failed to pull image "(?P<Image>[^"]+)": rpc error: code = (?P<Code>\S+) desc = (?P<PullError>.+)`, Weight: 1.0},
			{Type: "keyword", Pattern: "imagepullbackoff", Weight: 1.0},
			{Type: "keyword", Pattern: "pull access denied", Weight: 1.0},
			{Type: "keyword", Pattern: "failed to pull image", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check image name/tag exists, registry credentials, and network connectivity to registry",
			Command:    "kubectl describe pod {{.PodName}} -n {{.Namespace}} | grep -A10 'Events'",
		},
	},
	{
		ID: "crashloopbackoff", Name: "CrashLoopBackOff", Category: "Crash",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "Container repeatedly crashing and restarting",
		Matchers: []Matcher{
			{Type: "regex", Pattern: `(?P<Namespace>\S+)\s+(?P<PodName>\S+)\s+\S+\s+CrashLoopBackOff\s+(?P<RestartCount>\d+)`, Weight: 1.0},
			{Type: "keyword", Pattern: "crashloopbackoff", Weight: 1.0},
			{Type: "keyword", Pattern: "back-off restarting", Weight: 1.0},
		},
		Correlations: []Correlation{
			{PatternID: "oomkill", Message: "Crash loop may be caused by OOM kills"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check container logs. Common causes: missing env vars, config errors, dependency failures",
			Command:    "kubectl logs {{.PodName}} -n {{.Namespace}} --previous",
		},
	},
	{
		ID: "etcd-corruption", Name: "etcd Data Corruption", Category: "etcd",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "etcd data corruption or storage limit exceeded",
		Matchers: []Matcher{
			{Type: "regex", Pattern: `etcdserver: (?P<ErrorType>mvcc: database space exceeded)`, Weight: 1.0},
			{Type: "keyword", Pattern: "etcdserver: mvcc: database space exceeded", Weight: 1.0},
			{Type: "keyword", Pattern: "etcd data corruption", Weight: 1.0},
			{Type: "keyword", Pattern: "etcdserver: corrupt", Weight: 1.0},
			{Type: "keyword", Pattern: "raft: log corruption", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Run etcd compaction and defrag. For corruption: restore from backup or rebuild cluster",
			Command:    "ETCDCTL_API=3 etcdctl defrag",
			References: []string{"https://etcd.io/docs/v3.5/op-guide/maintenance/"},
		},
	},
	{
		ID: "etcd-quorum", Name: "etcd Quorum Loss", Category: "etcd",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "etcd cluster has lost quorum, control plane is down",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "etcdserver: no leader", Weight: 1.0},
			{Type: "keyword", Pattern: "etcd: lost quorum", Weight: 1.0},
			{Type: "keyword", Pattern: "raft: no elected leader", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Restore failed etcd nodes or restore cluster from snapshot",
			Command:    "ETCDCTL_API=3 etcdctl member list && ETCDCTL_API=3 etcdctl endpoint health --cluster",
			References: []string{"https://etcd.io/docs/v3.5/op-guide/recovery/"},
		},
	},
	{
		ID: "certificate-expired", Name: "Certificate Expired", Category: "Certificate",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "Kubernetes certificate has expired",
		Matchers: []Matcher{
			{Type: "regex", Pattern: `Serving cert is expired: (?P<Cert>\S+)`, Weight: 1.0},
			{Type: "keyword", Pattern: "certificate has expired", Weight: 1.0},
			{Type: "keyword", Pattern: "x509: certificate has expired", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Approve pending CSR to renew certificate",
			Command:    "kubectl get csr && kubectl certificate approve <csr-name>",
			References: []string{"https://kubernetes.io/docs/tasks/tls/certificate-issue/"},
		},
	},
	{
		ID: "certificate-invalid-ca", Name: "Invalid Certificate Authority", Category: "Certificate",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "Certificate signed by unknown or untrusted CA",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "x509: unknown authority", Weight: 1.0},
			{Type: "keyword", Pattern: "certificate signed by unknown authority", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check CA certificates are consistent across cluster. If CA was rotated, ensure all nodes have updated CA bundle.",
			References: []string{"https://docs.rke2.io/security/certificates/"},
		},
	},
	{
		ID: "dns-failure", Name: "DNS Resolution Failure", Category: "Networking",
		Severity: SeverityWarning, Confidence: ConfidenceLikely,
		Description: "DNS resolution failing for services or external hosts",
		Matchers: []Matcher{
			{Type: "regex", Pattern: `lookup (?P<Hostname>[\w\.\-]+)( on \S+)?(:)? (?P<Error>no such host|i/o timeout|nxdomain)`, Weight: 1.0},
			{Type: "keyword", Pattern: "dns resolution failed", Weight: 1.0},
			{Type: "keyword", Pattern: "could not resolve", Weight: 0.9},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check CoreDNS pods are running in kube-system. Verify DNS configuration.",
			Command:    "kubectl get pods -n kube-system -l k8s-app=kube-dns",
		},
	},
	{
		ID: "cni-error", Name: "CNI Plugin Error", Category: "Networking",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "CNI plugin errors preventing pod networking",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "cni plugin failed", Weight: 1.0},
			{Type: "keyword", Pattern: "failed to set up sandbox", Weight: 1.0},
			{Type: "keyword", Pattern: "networkplugin cni", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check CNI daemonset pods and logs. Verify CNI config files in /etc/cni/net.d/",
		},
	},
	{
		ID: "storage-pressure", Name: "Storage Pressure", Category: "Storage",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "Node or container experiencing disk space pressure",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "disk pressure", Weight: 1.0},
			{Type: "keyword", Pattern: "no space left on device", Weight: 1.0},
			{Type: "keyword", Pattern: "filesystem has no space left", Weight: 1.0},
			{Type: "keyword", Pattern: "InodePressure", Weight: 1.0},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Free up disk space: clean images (crictl rmi --prune), logs, or unused volumes",
			Command:    "df -h && crictl rmi --prune",
		},
	},
	{
		ID: "node-not-ready", Name: "Node Not Ready", Category: "Node",
		Severity: SeverityCritical, Confidence: ConfidenceCertain,
		Description: "Node is in NotReady state, not accepting pods",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "node notready", Weight: 1.0},
			{Type: "keyword", Pattern: "status notready", Weight: 1.0},
			{Type: "keyword", Pattern: "kubelet stopped posting node status", Weight: 1.0},
		},
		Correlations: []Correlation{
			{PatternID: "certificate-expired", Message: "Node NotReady often caused by expired certificates"},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Check: kubelet status, certificate expiration, network to API server, disk/memory pressure",
			Command:    "systemctl status kubelet && journalctl -u kubelet -n 50",
		},
	},
	{
		ID: "pod-stuck-terminating", Name: "Pod Stuck Terminating", Category: "Pod",
		Severity: SeverityWarning, Confidence: ConfidenceLikely,
		Description: "Pod is stuck in Terminating state",
		Matchers: []Matcher{
			{Type: "keyword", Pattern: "deletiontimestamp", Weight: 0.9},
			{Type: "keyword", Pattern: "failed to delete", Weight: 0.8},
		},
		HintGenerator: HintGenerator{
			Suggestion: "Causes: stuck finalizers, node unreachable, volume unmount stuck. Force delete as last resort.",
			Command:    "kubectl delete pod {{.PodName}} -n {{.Namespace}} --grace-period=0 --force",
		},
	},
}
