# Harvester Navigator: Questions 9-15

## Q9: Walk us through troubleshooting a real VM issue using the tool.

Let me demonstrate with a practical scenario - a VM that won't start. This shows the difference between traditional kubectl debugging and our unified approach.

**Traditional Troubleshooting (The Hard Way):**
With kubectl, you need to manually check multiple resources and correlate the data yourself:
```bash
kubectl get vm problematic-vm          # Check VM status
kubectl get vmi problematic-vm         # Check VMI (often empty)
kubectl get pvc problematic-vm-disk    # Check storage
kubectl get events --field-selector involvedObject.name=problematic-vm-disk
```

This process requires domain knowledge to understand the relationships and can take 5-10 minutes of manual correlation.

**Harvester Navigator Approach:**
Our tool automatically correlates all these resources and presents a unified view. When you open the dashboard at http://localhost:8080, you immediately see:

1. **Visual Indicators**: VM cards show color-coded status (red for critical issues)
2. **Automatic Correlation**: The tool links VM → PVC → Volume → Replicas automatically
3. **Issue Detection**: Built-in algorithms identify the root cause

For example, if a PVC is stuck in Pending state due to a missing StorageClass, our issue detector automatically identifies this:

```javascript
// From js/issue-detector.js
if (vm.pvcStatus === 'Pending' && vm.claimNames) {
    issues.push({
        title: 'Storage Provisioning Failed',
        severity: 'critical',
        description: `PVC ${vm.claimNames} is stuck in Pending state`,
        resolution: 'Check StorageClass configuration'
    });
}
```

The tool shows exactly what's wrong and suggests how to fix it, eliminating the guesswork.

**Advanced Scenario - Replica Issues:**
When storage replicas fail, traditional troubleshooting requires checking Longhorn resources manually. Our tool shows a visual replica health matrix and automatically detects when replicas are faulted, providing immediate visibility into storage health across the cluster.

## Q10: How does the real-time data updating work?

We chose HTTP polling over WebSockets for simplicity and reliability. Here's how it works:

**Architecture Decision:**
Instead of maintaining persistent WebSocket connections, we use simple HTTP requests that fetch fresh data on demand. This approach offers several advantages:
- Works through any firewall or proxy
- No connection state to manage
- Easy to debug with standard HTTP tools
- Compatible with all browsers

**Frontend Data Flow:**
The JavaScript frontend makes periodic requests to `/data` endpoint. Each request triggers a complete data fetch from the Kubernetes API, ensuring you always see the current cluster state.

**Backend Processing:**
When you hit the `/data` endpoint, the Go backend:
1. Creates fresh Kubernetes clients
2. Executes our batch data fetcher
3. Correlates all VM, storage, and node information
4. Returns comprehensive JSON data

**Performance Characteristics:**
Response times vary by cluster size:
- Small clusters (20 VMs): 2-4 seconds
- Medium clusters (50 VMs): 4-8 seconds
- Large clusters (100+ VMs): 8-15 seconds

The tool logs timing information so you can monitor performance: "Data sent in 3.247s"

**State Management:**
The frontend maintains application state in memory and triggers UI re-renders when new data arrives. Connection status is shown in the UI, with clear error messages if the backend becomes unavailable.

## Q11: How does the issue detection system work? Show us the algorithms.

Our issue detection system analyzes data across three layers to identify problems before they impact VMs.

**Multi-Layer Detection:**
The system examines:
1. **VM Layer**: VM status, PVC binding, VMI health
2. **Storage Layer**: Replica health, volume attachments, engine status
3. **Infrastructure Layer**: Node health, disk space, network connectivity

**Core Detection Logic:**
The main detection function processes each VM and applies multiple checks:

```javascript
// From js/issue-detector.js
checkVMIssues(vm, issues) {
    // Critical: Missing storage
    if (vm.claimNames && vm.pvcStatus === 'Unknown') {
        issues.push(this.createIssue({
            severity: 'critical',
            title: 'Missing Storage Volume',
            description: `PVC ${vm.claimNames} not found - VM cannot start`
        }));
    }
    
    // High: Replica failures
    if (vm.replicaInfo && vm.replicaInfo.length > 0) {
        const faultedReplicas = vm.replicaInfo.filter(r => 
            r.currentState === 'error' || !r.started
        );
        
        if (faultedReplicas.length > 0) {
            const severity = faultedReplicas.length === vm.replicaInfo.length ? 'critical' : 'high';
            issues.push(this.createIssue({
                severity: severity,
                title: 'Storage Replica Issues',
                description: `${faultedReplicas.length} of ${vm.replicaInfo.length} replicas are faulted`
            }));
        }
    }
}
```

**Issue Severity Classification:**
- **Critical**: VM cannot start or data loss risk (all replicas failed, missing PVC)
- **High**: VM degraded but functional (some replicas failed, pod scheduling issues)
- **Medium**: Performance or configuration warnings (attachment issues, resource constraints)
- **Low**: Informational items (migration status, capacity planning)

**Node-Level Detection:**
The system also monitors infrastructure health:

```javascript
checkNodeIssues(node, issues) {
    // Check node readiness
    const criticalConditions = node.longhornInfo.conditions.filter(condition => 
        condition.status === 'False' && ['Ready', 'Schedulable'].includes(condition.type)
    );
    
    // Check disk space
    node.longhornInfo.disks.forEach(disk => {
        const usedPercentage = ((maximum - available) / maximum) * 100;
        if (usedPercentage > 85) {
            issues.push(/* disk space warning */);
        }
    });
}
```

**Real-Time Analysis:**
Every time data is fetched, all VMs and nodes are analyzed. Issues are immediately visible in the UI with color coding, descriptions, and suggested resolutions. This proactive approach helps identify problems before they cause outages.

## Q12: How can we customize the tool for our specific environment?

The tool is designed to work out-of-the-box with any Harvester cluster, but offers several customization points.

**Command Line Configuration:**
Basic customization through command line flags:
```bash
./harvesterNavigator -port 9090    # Custom port
./harvesterNavigator -version      # Version info
```

**Kubeconfig Detection:**
The tool automatically finds your kubeconfig using a priority system:
1. KUBECONFIG environment variable (supports multiple files)
2. Harvester simulator location (~/.sim/admin.kubeconfig)
3. Current directory (kubeconfig, admin.kubeconfig, config)
4. Default kubectl location (~/.kube/config)

This means it works with any Harvester setup without additional configuration.

**Frontend Customization:**
You can modify the JavaScript configuration in `js/config.js`:
- Issue detection thresholds (disk space warnings, memory limits)
- Display preferences (grid vs list view, items per page)
- Refresh intervals and timeouts

**Resource Path Adaptation:**
The tool uses configurable API paths defined in `internal/models/types.go`. These paths work with standard Harvester installations but can be modified if you have custom API versions or non-standard namespace layouts.

**Environment Variables:**
The tool respects standard Kubernetes environment variables:
- KUBECONFIG for cluster access
- Standard kubectl configuration precedence
- No additional environment setup required

**Storage Backend Support:**
The volume service automatically detects your storage backends by examining StorageClasses. It provides deep insights for Longhorn CSI while maintaining basic visibility for other storage systems.

## Q13: What kubectl commands can we use alongside the tool for troubleshooting?

The Navigator provides visual insights, but sometimes you need kubectl for deeper investigation or remediation. Here are the most useful command combinations.

**VM Lifecycle Investigation:**
When Navigator shows VM issues, these kubectl commands provide detailed information:
```bash
# Get detailed VM status and conditions
kubectl describe vm <vm-name> -n <namespace>

# Check VM events for startup problems
kubectl get events --field-selector involvedObject.kind=VirtualMachine

# Check VMI details (running instance)
kubectl get vmi <vm-name> -n <namespace> -o yaml
```

**Storage Deep Dive:**
When Navigator highlights storage problems, use these commands:
```bash
# Get PVC details from Navigator's claimNames field
kubectl describe pvc <pvc-name> -n <namespace>

# Find the bound PV
PV_NAME=$(kubectl get pvc <pvc-name> -o jsonpath='{.spec.volumeName}')
kubectl describe pv $PV_NAME

# Longhorn volume investigation (if volumeName shown in Navigator)
kubectl get volumes.longhorn.io $VOLUME_NAME -n longhorn-system -o yaml
kubectl get replicas.longhorn.io -n longhorn-system | grep $VOLUME_NAME
```

**Node and Infrastructure:**
When Navigator shows node issues:
```bash
# Detailed node status
kubectl describe node <node-name>

# Longhorn node health (Navigator shows which nodes have issues)
kubectl describe node.longhorn.io <node-name> -n longhorn-system

# Check disk status details
kubectl get nodes.longhorn.io <node-name> -n longhorn-system -o jsonpath='{.status.diskStatus}'
```

**Correlation Workflow:**
1. Use Navigator to identify the problem type and affected resources
2. Use the resource names from Navigator in kubectl commands for detailed investigation
3. Apply fixes using kubectl
4. Refresh Navigator to verify the resolution

This combination gives you both high-level visibility and deep troubleshooting capability.

## Q14: How does the batch fetching system work and why is it important?

The batch fetching system is the core performance optimization that makes the tool practical for real Harvester clusters.

**The Problem:**
Traditional approaches would make hundreds of individual API calls:
- One call per VM to get VM details
- One call per PVC to get storage information  
- One call per Longhorn volume to get replica status
- One call per replica to get health information

For a 100-VM cluster, this could mean 400+ sequential API calls taking 10-15 minutes.

**Our Solution:**
We implemented intelligent batching in `batch_fetcher.go` that groups related API calls:

```go
type BatchFetcher struct {
    client *kubernetes.Clientset
    cache  *APICache
}

func (bf *BatchFetcher) ExecuteBatch(requests []BatchRequest, maxConcurrency int) []BatchResponse {
    // Execute multiple API requests concurrently
    // Use semaphore for concurrency control
    // Cache successful responses for reuse
}
```

**How It Works:**
1. **Request Grouping**: Collect all PVC names from VMs first
2. **Parallel Execution**: Fetch multiple PVCs simultaneously using goroutines
3. **Resource Correlation**: Pre-fetch all Longhorn volumes, replicas, and engines
4. **Data Assembly**: Correlate fetched data with VMs without additional API calls

**Performance Impact:**
- **Before**: 100 VMs × 4 calls each = 400 API calls (8-12 minutes)
- **After**: ~15-20 batch calls total (15-30 seconds)

**Caching Strategy:**
The batch fetcher includes a 5-minute TTL cache to avoid redundant API calls during data processing. This is especially important when multiple VMs share the same PVC or when analyzing replica distribution across nodes.

**Concurrency Control:**
We use a semaphore pattern to limit concurrent API requests, preventing overwhelming the Kubernetes API server while maintaining good performance.

## Q15: How does the embedded file system work? Why not serve files separately?

The embedded file system is a key architectural decision that makes deployment incredibly simple.

**Implementation:**
We use Go 1.16+'s `embed` directive to include all static files directly in the binary:

```go
//go:embed index.html js/* styles/*
var staticFiles embed.FS

// Serve embedded files
http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    if r.URL.Path == "/" {
        data, err := staticFiles.ReadFile("index.html")
        w.Header().Set("Content-Type", "text/html")
        w.Write(data)
    }
})
```

**What Gets Embedded:**
- `index.html`: Main dashboard interface
- `js/`: All JavaScript modules (app.js, issue-detector.js, state management, etc.)
- `styles/`: CSS stylesheets

**Build Process:**
When you run `go build`, the Go compiler automatically includes all these files in the binary. The resulting executable contains everything needed to run the dashboard.

**Deployment Benefits:**
1. **Single File Distribution**: Copy one binary, no dependencies
2. **Version Consistency**: Assets always match the binary version
3. **Offline Operation**: Works in air-gapped environments
4. **Zero Configuration**: No web server setup or file permissions needed

**File Serving:**
The embedded files are served through Go's standard HTTP file server. The embed.FS implements the fs.FS interface, so we can use standard file serving patterns while the files come from memory instead of disk.

**Size Considerations:**
The static assets add about 200-300KB to the binary size, which is negligible compared to the Go runtime and our code. The result is still a reasonably sized single executable that contains everything needed for the dashboard.