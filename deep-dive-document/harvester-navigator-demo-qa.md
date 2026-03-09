# Harvester Navigator: Technical Demo Session Q&A

_A comprehensive guide for technical audiences exploring the architecture, implementation details, and practical usage of the Harvester Navigator project_

---

## 🎯 **Overview & Architecture Questions**

### Q1: What is Harvester Navigator and what problem does it solve?

Harvester Navigator is a comprehensive web-based troubleshooting tool designed specifically for Harvester clusters. It solves the critical problem of fragmented visibility in Harvester environments where troubleshooting requires understanding the complex relationships between VMs, storage volumes, replicas, nodes, and networking.

**The Problem It Solves:**

- Traditional kubectl commands only show individual resource states
- Harvester spans multiple layers: Kubernetes, KubeVirt, Longhorn storage
- Troubleshooting requires correlating data across these layers
- No single view showing the health of VM → PVC → Volume → Replica → Node relationships

**Real Example:**

```bash
# Traditional way - requires multiple commands
kubectl get vm -A
kubectl get pvc -A
kubectl get volumes.longhorn.io -n longhorn-system
kubectl get replicas.longhorn.io -n longhorn-system
kubectl get nodes.longhorn.io -n longhorn-system

# With Harvester Navigator - single unified view
./harvesterNavigator
# Open http://localhost:8080 - see everything correlated
```

### Q2: How does the architecture work? Walk us through the data flow.

The architecture follows a **single-binary, embedded-assets** design with intelligent batch processing:

```go
//go:embed index.html js/* styles/*
var staticFiles embed.FS
```

**Data Flow Architecture:**

1. **Binary Initialization** (`main.go`):

   ```go
   func main() {
       // Detect kubeconfig automatically
       kubeconfigPath, source, err := determineKubeconfigPath()

       // Create Kubernetes clients
       config, err := kubeclient.GetConfig(kubeconfigPath)
       clientset, err := kubeclient.CreateClientWithConfig(config)
   }
   ```

2. **HTTP Server Setup**:

   ```go
   http.HandleFunc("/data", handleData(clientset, config))
   http.Handle("/js/", http.StripPrefix("/js/", http.FileServer(http.FS(jsFS))))
   ```

3. **Batch Data Fetching** (`batch_fetcher.go`):

   ```go
   func (df *DataFetcher) fetchFullClusterData() (models.FullClusterData, error) {
       // Parallel data collection
       var nodeWg sync.WaitGroup
       nodeWg.Add(1)
       go func() {
           defer nodeWg.Done()
           df.fetchNodeData(&allData)
       }()

       vmData, err := df.fetchVMData()  // Batch processes VMs
   }
   ```

4. **Frontend Processing**:
   ```javascript
   // app.js
   async startDataFetching() {
       const response = await fetch('/data');
       const data = await response.json();
       AppState.updateData(data);
   }
   ```

### Q3: What makes this different from just using kubectl?

**kubectl Limitations:**

```bash
# kubectl shows individual resource status:
kubectl get vm test-vm -o yaml
# Shows: VM spec, status, but no storage details

kubectl get pvc test-vm-disk-0 -o yaml
# Shows: PVC spec, but no replica health

kubectl get volumes.longhorn.io pvc-123 -n longhorn-system -o yaml
# Shows: Volume status, but requires manual correlation
```

**Harvester Navigator Advantages:**

1. **Correlation Intelligence:**

   ```go
   // Automatically links VM → PVC → Volume → Replicas
   func (df *DataFetcher) processVMWithBatchedData(
       vmIndex int,
       vmData map[string]interface{},
       vmToPVC map[int]string,
       volumeDetails map[string]*volume.VolumeDetails,
   ) *models.VMInfo
   ```

2. **Intelligent Error Detection:**

   ```javascript
   // js/issue-detector.js
   checkVMIssues(vm, issues) {
       if (vm.replicaInfo && vm.replicaInfo.length > 0) {
           const faultedReplicas = vm.replicaInfo.filter(r =>
               r.currentState === 'error' || !r.started
           );
           if (faultedReplicas.length > 0) {
               issues.push(this.createIssue({
                   severity: faultedReplicas.length === vm.replicaInfo.length ? 'critical' : 'high',
                   category: 'Storage'
               }));
           }
       }
   }
   ```

3. **Performance Benefits:**
   ```go
   // Batch processing vs individual kubectl calls
   volumeDetails, err := df.volumeService.BatchFetchVolumeDetails(pvcRequests)
   // vs hundreds of individual kubectl get pvc commands
   ```

### Q4: How does the kubeconfig detection work? Why this approach?

The kubeconfig detection implements a **priority-based fallback system** designed for both development and production environments:

```go
func determineKubeconfigPath() (string, string, error) {
    // Priority 1: KUBECONFIG environment variable
    if kubeconfigEnv := os.Getenv("KUBECONFIG"); kubeconfigEnv != "" {
        separator := ":"
        if os.PathSeparator == '\\' {
            separator = ";"  // Windows support
        }

        paths := strings.Split(kubeconfigEnv, separator)
        for i, path := range paths {
            // Expand ~ to home directory
            if strings.HasPrefix(path, "~/") {
                if home, err := os.UserHomeDir(); err == nil {
                    path = filepath.Join(home, path[2:])
                }
            }

            if _, err := os.Stat(path); err == nil {
                source := fmt.Sprintf("KUBECONFIG environment variable (path %d of %d)", i+1, len(paths))
                return path, source, nil
            }
        }
    }

    // Priority 2: Harvester simulator location
    home, err := os.UserHomeDir()
    simPath := filepath.Join(home, ".sim", "admin.kubeconfig")
    if _, err := os.Stat(simPath); err == nil {
        return simPath, "Harvester simulator location (~/.sim/admin.kubeconfig)", nil
    }

    // Priority 3: Current directory common names
    currentDir, _ := os.Getwd()
    commonNames := []string{"kubeconfig", "admin.kubeconfig", "config"}

    for _, name := range commonNames {
        path := filepath.Join(currentDir, name)
        if _, err := os.Stat(path); err == nil {
            return path, fmt.Sprintf("current directory (./%s)", name), nil
        }
    }

    return "", "", fmt.Errorf("no kubeconfig file found")
}
```

**Why This Approach:**

- **Developer Friendly**: Works with local development setups
- **Simulator Compatible**: Automatically detects Harvester simulator
- **Production Ready**: Respects standard KUBECONFIG environment
- **Transparent**: Shows which kubeconfig source was used

**Usage Examples:**

```bash
# Development with simulator
support-bundle-kit simulator --reset
./harvesterNavigator  # Automatically finds ~/.sim/admin.kubeconfig

# Production environment
export KUBECONFIG=/etc/kubernetes/admin.conf
./harvesterNavigator

# Multiple kubeconfigs
export KUBECONFIG="./dev.conf:./staging.conf:./prod.conf"
./harvesterNavigator  # Uses first valid one
```

---

## 🔧 **Implementation Deep Dive Questions**

### Q5: How does the data correlation work between VM, PVC, Volume, and Replicas?

The correlation system is the heart of Harvester Navigator - it automatically traces the entire storage stack for each VM.

**The Correlation Chain:**
VM → PVC → PV → Longhorn Volume → Replicas → Nodes

**Step-by-Step Correlation Process:**

**Step 1: Extract PVC from VM Spec**

```go
// From batch_fetcher.go
func (df *DataFetcher) fetchVMData() ([]models.VMInfo, error) {
    vmList, err := vm.FetchAllVMData(df.client, ...)

    // Extract PVC references from each VM
    var pvcRequests []batch.PVCRequest
    vmToPVC := make(map[int]string)

    for i, vmData := range vmList {
        // Parse VM spec to find PVC claim name
        if err := vm.ParseVMMetaData(vmData, vmInfo); err != nil {
            continue
        }

        if vmInfo.ClaimNames != "" {
            pvcRequests = append(pvcRequests, batch.PVCRequest{
                Name:      vmInfo.ClaimNames,
                Namespace: namespace,
            })
            vmToPVC[i] = vmInfo.ClaimNames  // Store mapping
        }
    }
}
```

**Step 2: Batch Fetch PVCs and Extract Volume Handles**

```go
// Fetch all PVCs in one batch operation
volumeDetails, err := df.volumeService.BatchFetchVolumeDetails(pvcRequests)

// Inside BatchFetchVolumeDetails:
func (vs *VolumeService) BatchFetchVolumeDetails(pvcRequests []PVCRequest) (map[string]*VolumeDetails, error) {
    for _, pvcReq := range pvcRequests {
        // Get PVC → find bound PV
        pvcData, _ := pvc.FetchPVCData(client, pvcReq.Name, pvcReq.Namespace)
        pvName, _ := pvc.ParsePVCSpec(pvcData)

        // Get PV → extract CSI volume handle
        pvData, _ := fetchPVData(client, pvName)
        volumeHandle := extractVolumeHandle(pvData)  // This is the Longhorn volume name

        volumeDetails[pvcKey] = &VolumeDetails{
            VolumeHandle: volumeHandle,  // Key for next step
            StorageClass: storageClass,
            CSIDriver:    csiDriver,
        }
    }
}
```

**Step 3: Fetch Longhorn Resources (Replicas, Engines)**

```go
// Pre-fetch ALL Longhorn resources once
longhornResources := df.batchFetcher.BatchFetchLonghornResources()

// Extract replicas for each volume
for volumeName, details := range volumeDetails {
    if details.IsLonghornCSI {
        // Find replicas for this volume
        replicas := filterReplicasByVolume(longhornResources["replicas"], volumeName)
        details.Replicas = replicas

        // Find engine for this volume
        engines := filterEnginesByVolume(longhornResources["engines"], volumeName)
        details.Engines = engines
    }
}
```

**Step 4: Correlate Everything Back to VM**

```go
func (df *DataFetcher) processVMWithBatchedData(
    vmIndex int,
    vmData map[string]interface{},
    vmToPVC map[int]string,
    volumeDetails map[string]*volume.VolumeDetails,
) *models.VMInfo {
    vmInfo := &models.VMInfo{}

    // Get PVC name for this VM
    pvcName := vmToPVC[vmIndex]
    pvcKey := fmt.Sprintf("pvc-%s-%s", namespace, pvcName)

    // Get volume details (already fetched)
    if volDetails, exists := volumeDetails[pvcKey]; exists {
        vmInfo.VolumeName = volDetails.VolumeHandle
        vmInfo.PVCStatus = volDetails.Status
        vmInfo.StorageClass = volDetails.StorageClass

        // Attach replica info
        vmInfo.ReplicaInfo = volDetails.Replicas
        vmInfo.EngineInfo = volDetails.Engines
    }

    return vmInfo
}
```

**The Result:**
Each VM object now contains complete storage stack information:

```go
type VMInfo struct {
    Name         string
    ClaimNames   string        // PVC name
    VolumeName   string        // Longhorn volume name
    PVCStatus    PVCStatus     // Bound/Pending/Lost
    StorageClass string        // longhorn/longhorn-static
    ReplicaInfo  []ReplicaInfo // All replicas with node placement
    EngineInfo   []EngineInfo  // Engine status
}
```

**Why This Matters:**

- **Single API Call Set**: Instead of N API calls per VM, we make ~15-20 total calls for the entire cluster
- **Complete Context**: Every VM shows its full storage stack without additional lookups
- **Performance**: 100-VM cluster analyzed in 15-30 seconds vs 10-15 minutes with kubectl

### Q6: What is the health check framework and how does it work?

The health check framework provides proactive cluster monitoring beyond individual VM status.

**Health Check Architecture:**
Located in `internal/services/health/`, the framework runs multiple checks and aggregates results:

```go
// From internal/services/health/health.go
type HealthChecker struct {
    client      *kubernetes.Clientset
    upgradeInfo *models.UpgradeInfo
}

func (hc *HealthChecker) RunAllChecks(ctx context.Context) *models.HealthCheckSummary {
    summary := &models.HealthCheckSummary{
        LastRun: time.Now(),
        Results: []models.HealthCheckResult{},
    }

    // Run various health checks
    checks := []func(context.Context) models.HealthCheckResult{
        hc.checkLonghornComponents,
        hc.checkKubevirtComponents,
        hc.checkHarvesterComponents,
        hc.checkPodHealth,
        hc.checkNodeConditions,
    }

    for _, checkFunc := range checks {
        result := checkFunc(ctx)
        summary.Results = append(summary.Results, result)

        // Categorize results
        switch result.Status {
        case "passed":
            summary.PassedChecks++
        case "failed":
            summary.FailedChecks++
        case "warning":
            summary.WarningChecks++
        }
    }

    summary.TotalChecks = len(summary.Results)
    return summary
}
```

**Key Health Checks:**

**1. Longhorn Component Health:**

```go
func (hc *HealthChecker) checkLonghornComponents(ctx context.Context) models.HealthCheckResult {
    result := models.HealthCheckResult{
        CheckName: "Longhorn System Health",
        Timestamp: time.Now(),
    }

    // Check critical Longhorn pods
    pods, err := hc.client.CoreV1().Pods("longhorn-system").List(ctx, metav1.ListOptions{})

    criticalComponents := []string{"longhorn-manager", "longhorn-driver-deployer", "csi-provisioner"}
    failedPods := []string{}

    for _, pod := range pods.Items {
        if isComponentPod(pod.Name, criticalComponents) {
            if pod.Status.Phase != "Running" {
                failedPods = append(failedPods, pod.Name)
            }
        }
    }

    if len(failedPods) > 0 {
        result.Status = "failed"
        result.Message = fmt.Sprintf("%d critical Longhorn components not running", len(failedPods))
        result.Details = failedPods
    } else {
        result.Status = "passed"
        result.Message = "All Longhorn components healthy"
    }

    return result
}
```

**2. Pod Health with Error Details:**

```go
func (hc *HealthChecker) checkPodHealth(ctx context.Context) models.HealthCheckResult {
    result := models.HealthCheckResult{
        CheckName: "Pod Health Analysis",
        Timestamp: time.Now(),
    }

    // Get all pods across all namespaces
    pods, err := hc.client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})

    podErrors := []models.PodError{}

    for _, pod := range pods.Items {
        // Check for failed/pending pods
        if pod.Status.Phase == "Failed" || pod.Status.Phase == "Pending" {
            podError := models.PodError{
                Name:      pod.Name,
                Namespace: pod.Namespace,
                Phase:     string(pod.Status.Phase),
                NodeName:  pod.Spec.NodeName,
                Reason:    pod.Status.Reason,
                Message:   pod.Status.Message,
            }

            // Analyze container statuses
            for _, containerStatus := range pod.Status.ContainerStatuses {
                if !containerStatus.Ready {
                    podError.ContainerErrors = append(podError.ContainerErrors, models.ContainerError{
                        Name:         containerStatus.Name,
                        RestartCount: containerStatus.RestartCount,
                        State:        getContainerState(containerStatus),
                        Reason:       getContainerReason(containerStatus),
                    })
                }
            }

            podErrors = append(podErrors, podError)
        }
    }

    if len(podErrors) > 0 {
        result.Status = "warning"
        result.Message = fmt.Sprintf("%d pods with issues detected", len(podErrors))
        result.PodErrors = podErrors
    } else {
        result.Status = "passed"
        result.Message = "All pods healthy"
    }

    return result
}
```

**3. Harvester Upgrade Tracking:**

```go
// Fetched during data collection
upgradeInfo, err := upgrade.FetchLatestUpgrade(df.client)
if err == nil {
    allData.UpgradeInfo = upgradeInfo
    log.Printf("Upgrade info: %s -> %s (%s)",
        upgradeInfo.PreviousVersion, upgradeInfo.Version, upgradeInfo.State)
}

// Data structure
type UpgradeInfo struct {
    Version         string            `json:"version"`
    PreviousVersion string            `json:"previousVersion"`
    UpgradeTime     time.Time         `json:"upgradeTime"`
    State           string            `json:"state"`  // "Succeeded", "Failed", "InProgress"
    NodeStatuses    map[string]string `json:"nodeStatuses"`  // Per-node upgrade status
}
```

**4. PDB (Pod Disruption Budget) Health Check:**

```go
// From internal/services/pdb/health.go
func (hc *HealthChecker) CheckAllNodesPDB() (map[string]*models.PDBHealthStatus, error) {
    results := make(map[string]*models.PDBHealthStatus)

    // Get all PDBs
    pdbs, _ := hc.listAllPDBs()

    // Get all Instance Managers
    instanceManagers, _ := hc.listInstanceManagers()

    // Cross-reference to find mismatches
    for _, pdb := range pdbs {
        nodeName := extractNodeFromPDB(pdb)
        issues := hc.detectPDBIssues(pdb, instanceManagers)

        if len(issues) > 0 {
            results[nodeName] = &models.PDBHealthStatus{
                NodeName:    nodeName,
                HasIssues:   true,
                IssueCount:  len(issues),
                Issues:      issues,
                Severity:    determineSeverity(issues),
                LastChecked: time.Now(),
            }
        }
    }

    return results, nil
}
```

**Frontend Display:**
The health check results are displayed in the UI with color-coded status:

```javascript
// Results structure sent to frontend
{
    "healthChecks": {
        "totalChecks": 5,
        "passedChecks": 4,
        "failedChecks": 0,
        "warningChecks": 1,
        "lastRun": "2025-10-07T10:30:00Z",
        "results": [
            {
                "checkName": "Longhorn System Health",
                "status": "passed",
                "message": "All Longhorn components healthy",
                "timestamp": "2025-10-07T10:30:00Z"
            }
        ]
    }
}
```

This proactive monitoring catches system-wide issues that might not be visible when looking at individual VMs.

### Q7: How does the tool handle VM migrations (VMIM) and what information does it show?

VM Instance Migrations (VMIM) are tracked comprehensively to provide visibility into live migration operations.

**Migration Data Collection:**
Located in `internal/services/vmim/vmim.go`:

```go
// Fetch all migrations for a specific VMI
func FetchAllVMIMsForVMI(client *kubernetes.Clientset, vmiName, absPath, namespace string) ([]map[string]interface{}, error) {
    // Get all VirtualMachineInstanceMigration objects for this VMI
    vmimListRaw, err := client.RESTClient().Get().
        AbsPath(absPath).
        Namespace(namespace).
        Resource("virtualmachineinstancemigrations").
        Do(context.Background()).Raw()

    var vmimList map[string]interface{}
    json.Unmarshal(vmimListRaw, &vmimList)

    items, _ := vmimList["items"].([]interface{})

    // Filter migrations for this specific VMI
    vmimDataList := []map[string]interface{}{}
    for _, item := range items {
        vmimMap, _ := item.(map[string]interface{})
        spec, _ := vmimMap["spec"].(map[string]interface{})
        if spec["vmiName"] == vmiName {
            vmimDataList = append(vmimDataList, vmimMap)
        }
    }

    return vmimDataList, nil
}
```

**Migration Data Structure:**

```go
type VMIMInfo struct {
    Name                      string                  `json:"name"`
    VMIName                   string                  `json:"vmiName"`
    Namespace                 string                  `json:"namespace"`
    MigrationState            string                  `json:"migrationState"`  // "Running", "Succeeded", "Failed"
    SourceNode                string                  `json:"sourceNode"`
    SourcePod                 string                  `json:"sourcePod"`
    TargetNode                string                  `json:"targetNode"`
    TargetPod                 string                  `json:"targetPod"`
    TargetNodeAddress         string                  `json:"targetNodeAddress"`
    StartTimestamp            string                  `json:"startTimestamp"`
    EndTimestamp              string                  `json:"endTimestamp"`
    Phase                     string                  `json:"phase"`
    PhaseTransitionTimestamps []PhaseTransition       `json:"phaseTransitionTimestamps"`
    LatestPhaseTransition     *PhaseTransition        `json:"latestPhaseTransition"`
    MigrationConfiguration    *MigrationConfiguration `json:"migrationConfiguration"`
    TargetPodExists           bool                    `json:"targetPodExists"`
    TargetPodStatus           string                  `json:"targetPodStatus"`
    MigrationMode             string                  `json:"migrationMode"`
}
```

**What the UI Shows:**
For each VM, the dashboard displays:

- **Migration Status**: Succeeded, Running, Failed
- **Source and Target Nodes**: Where the VM is migrating from/to
- **Migration Timeline**: Phase transitions with timestamps
- **Configuration Details**: Bandwidth limits, timeouts, auto-converge settings
- **Current Phase**: Real-time progress (Scheduling → TargetReady → Running → Succeeded)

This comprehensive migration tracking helps troubleshoot live migration issues and monitor migration performance across the cluster.

---

## 🚀 **Live Demonstration Questions**

### Q8: Show us how to set up and run the tool with a real Harvester cluster.

**Step 1: Environment Setup**

```bash
# First, verify you have access to your Harvester cluster
kubectl get nodes
kubectl get vm -A
kubectl get pvc -A

# Check if Longhorn is running
kubectl get pods -n longhorn-system | head -5
NAME                                          READY   STATUS    RESTARTS
csi-attacher-7bf4b7f996-2p4xk                1/1     Running   0
csi-provisioner-869bdc4b79-klm2n             1/1     Running   0
engine-image-ei-d4c780c6-7mpkz               1/1     Running   0
```

**Step 2: Download and Prepare Binary**

```bash
# Download the latest release for your platform
wget https://github.com/rajeshkio/harvester-navigator/releases/latest/download/harvesterNavigator-linux-amd64

# Make it executable
chmod +x harvesterNavigator-linux-amd64

# Verify the binary
./harvesterNavigator-linux-amd64 -version
# Harvester Navigator 1.2.3
```

**Step 3: Configuration Options**

_Option A - Using existing kubeconfig:_

```bash
# If you already have kubectl configured
kubectl config current-context
# harvester-cluster

# Run the tool (it will auto-detect your kubeconfig)
./harvesterNavigator-linux-amd64
```

_Option B - Specific kubeconfig file:_

```bash
# Point to specific kubeconfig
export KUBECONFIG=/path/to/harvester-kubeconfig.yaml

# Verify connection
kubectl get nodes

# Run the tool
./harvesterNavigator-linux-amd64 -port 9090
```

_Option C - With Harvester simulator:_

```bash
# Start the simulator first
support-bundle-kit simulator --reset

# Wait for it to initialize
kubectl --kubeconfig ~/.sim/admin.kubeconfig get nodes

# Run Navigator (auto-detects simulator)
./harvesterNavigator-linux-amd64
```

**Step 4: Verify Startup**

```bash
# Expected startup output:
2025/09/28 10:30:15 Starting Harvester Navigator Backend (version: 1.2.3)...
2025/09/28 10:30:15 Using kubeconfig: /home/user/.kube/config
2025/09/28 10:30:15 Source: KUBECONFIG environment variable (path 1 of 1)
2025/09/28 10:30:15 Kubernetes client initialized.
2025/09/28 10:30:15 Connected to Kubernetes cluster (version: v1.30.0+k3s1)
2025/09/28 10:30:15 === Discovered Storage Backends ===
2025/09/28 10:30:15   driver.longhorn.io: longhorn (default) (2 storage classes)
2025/09/28 10:30:15 =====================================
2025/09/28 10:30:15 Backend server started on port 8080. Open http://localhost:8080 in your browser.
```

**Step 5: Access and Verify**

```bash
# Open in browser
open http://localhost:8080

# Or test with curl
curl -s http://localhost:8080/data | jq '.vms | length'
# 15

# Check if data is flowing
curl -s http://localhost:8080/data | jq '.nodes | length'
# 3
```

### Q9: Walk us through troubleshooting a real VM issue using the tool.

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
if (vm.pvcStatus === "Pending" && vm.claimNames) {
  issues.push({
    title: "Storage Provisioning Failed",
    severity: "critical",
    description: `PVC ${vm.claimNames} is stuck in Pending state`,
    resolution: "Check StorageClass configuration",
  });
}
```

The tool shows exactly what's wrong and suggests how to fix it, eliminating the guesswork.

**Advanced Scenario - Replica Issues:**
When storage replicas fail, traditional troubleshooting requires checking Longhorn resources manually. Our tool shows a visual replica health matrix and automatically detects when replicas are faulted, providing immediate visibility into storage health across the cluster.

### Q10: How does the real-time data updating work?

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

### Q11: How does the issue detection system work? Show us the algorithms.

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

### Q12: How can we customize the tool for our specific environment?

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

### Q13: What kubectl commands can we use alongside the tool for troubleshooting?

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

---

## 🔬 **Advanced Technical Questions**

### Q14: How does the batch fetching system work and why is it important?

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

### Q15: How does the embedded file system work? Why not serve files separately?

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

### Q16: How does the volume service handle different CSI drivers beyond Longhorn?

The volume service implements a **universal CSI driver detection system** that works with any storage backend, not just Longhorn.

**Storage Backend Discovery:**
The tool automatically discovers all storage backends in your cluster by examining StorageClasses:

```go
// From internal/services/volume/volume.go
func DiscoverStorageBackends(client *kubernetes.Clientset) ([]StorageBackendInfo, error) {
    storageClasses, err := client.StorageV1().StorageClasses().List(context.TODO(), metav1.ListOptions{})

    backends := make(map[string]*StorageBackendInfo)

    for _, sc := range storageClasses.Items {
        // Group by CSI driver (provisioner)
        backends[sc.Provisioner] = &StorageBackendInfo{
            Name:         sc.Name,
            CSIDriver:    sc.Provisioner,
            IsDefault:    isDefaultStorageClass(sc),
            VolumeCount:  1,
        }
    }
}
```

**Universal Volume Analysis:**
When processing a VM's storage, the tool follows this pattern:

1. **Get PVC** → Find the bound PersistentVolume
2. **Extract CSI Details** → Identify the CSI driver and volume handle
3. **Driver-Specific Logic** → Apply deep analysis for known drivers

```go
func FetchVolumeDetails(client *kubernetes.Clientset, pvcName, namespace string) (*VolumeDetails, error) {
    // Step 1: Get PVC → PV mapping (universal)
    pvcData, err := pvc.FetchPVCData(client, pvcName, ...)
    pvName, err := pvc.ParsePVCSpec(pvcData)

    // Step 2: Extract CSI driver info (universal)
    pvData, err := fetchPVData(client, pvName)
    volumeDetails := extractPVDetails(pvData)

    // Step 3: Driver-specific deep dive
    volumeDetails.IsLonghornCSI = (volumeDetails.CSIDriver == "driver.longhorn.io")

    if volumeDetails.IsLonghornCSI {
        // Deep Longhorn analysis: replicas, engines, etc.
        longhornDetails, err := fetchLonghornVolumeDetails(client, volumeDetails.VolumeHandle)
        volumeDetails.BackendDetails = longhornDetails
    } else {
        // Basic visibility for other CSI drivers
        log.Printf("Volume uses CSI driver %s (not Longhorn), providing basic info only", volumeDetails.CSIDriver)
    }
}
```

**What This Means Practically:**

- **Any CSI Driver**: Shows basic volume info (size, status, storage class)
- **Longhorn CSI**: Deep analysis with replica health, engine status, attachment details
- **Future Extension**: Easy to add deep analysis for other CSI drivers

**Example Output:**

```bash
# Tool startup shows discovered backends:
=== Discovered Storage Backends ===
  driver.longhorn.io: longhorn (default) (2 storage classes)
  rbd.csi.ceph.com: ceph-rbd (1 storage classes)
  nfs-subdir-external-provisioner: nfs-client (1 storage classes)
```

### Q17: What's the data model structure and how do we extend it?

The data model is defined in `internal/models/types.go` and follows a hierarchical structure that mirrors Harvester's architecture.

**Top-Level Structure:**

```go
type FullClusterData struct {
    VMs          []VMInfo            `json:"vms"`
    Nodes        []NodeWithMetrics   `json:"nodes"`
    UpgradeInfo  *UpgradeInfo        `json:"upgradeInfo,omitempty"`
    HealthChecks *HealthCheckSummary `json:"healthChecks,omitempty"`
}
```

**VM Data Model:**
The VMInfo struct aggregates everything related to a single VM:

```go
type VMInfo struct {
    // Basic VM metadata
    Name                       string        `json:"name"`
    Namespace                  string        `json:"namespace"`
    ImageId                    string        `json:"imageId"`

    // Storage information
    StorageClass               string        `json:"storageClass"`
    ClaimNames                 string        `json:"claimNames"`
    VolumeName                 string        `json:"volumeName"`
    PVCStatus                  PVCStatus     `json:"pvcStatus"`

    // Longhorn-specific storage details
    ReplicaInfo                []ReplicaInfo `json:"replicaInfo"`
    EngineInfo                 []EngineInfo  `json:"engineInfo"`

    // Runtime information
    PodInfo                    []PodInfo     `json:"podInfo"`
    VMIInfo                    []VMIInfo     `json:"vmiInfo"`
    VMIMInfo                   []VMIMInfo    `json:"vmimInfo"`

    // Issue tracking
    Errors                     []VMError     `json:"errors,omitempty"`
    PrintableStatus            string        `json:"printableStatus"`
}
```

**Nested Data Structures:**
Each component has detailed information:

```go
type ReplicaInfo struct {
    Name            string             `json:"name"`
    NodeID          string             `json:"nodeId"`
    Active          bool               `json:"active"`
    CurrentState    string             `json:"currentState"`
    StorageIP       string             `json:"storageIP"`
    Port            string             `json:"port"`
    Conditions      []ReplicaCondition `json:"conditions"`
}

type VMIInfo struct {
    Name               string            `json:"name"`
    NodeName           string            `json:"nodeName"`
    Phase              string            `json:"phase"`
    ActivePods         map[string]string `json:"activePods"`
    GuestOSInfo        *GuestOSInfo      `json:"guestOSInfo"`
    MemoryInfo         *MemoryInfo       `json:"memoryInfo"`
    Interfaces         []Interface       `json:"interfaces"`
}
```

**Extension Points:**
To add new data to the model:

1. **Add Field to Struct**: Extend the relevant struct in `types.go`
2. **Update Collection Logic**: Modify the appropriate service (vm, volume, node, etc.)
3. **Update Frontend**: Add rendering logic in JavaScript
4. **Update Issue Detection**: Add checks in `issue-detector.js` if needed

**Example Extension - Adding Network Metrics:**

```go
// Add to VMIInfo struct
type VMIInfo struct {
    // ... existing fields
    NetworkMetrics     *NetworkMetrics   `json:"networkMetrics,omitempty"`
}

type NetworkMetrics struct {
    BytesReceived      int64  `json:"bytesReceived"`
    BytesTransmitted   int64  `json:"bytesTransmitted"`
    PacketsDropped     int64  `json:"packetsDropped"`
}
```

The modular structure makes it straightforward to add new data sources or extend existing ones.

### Q18: How does error handling work throughout the system?

The system implements **graceful degradation** - if one component fails, the rest continues working. This ensures you always get partial visibility even when some data sources are unavailable.

**Backend Error Handling Strategy:**
The Go backend uses a multi-layer error handling approach:

```go
// From batch_fetcher.go - VM processing continues even if individual components fail
func (df *DataFetcher) processVMWithBatchedData(...) *models.VMInfo {
    vmInfo := &models.VMInfo{Errors: []models.VMError{}}

    // Parse VM metadata - if this fails, skip this VM
    if err := vm.ParseVMMetaData(vmData, vmInfo); err != nil {
        vmInfo.Errors = append(vmInfo.Errors, models.VMError{
            Type:     "metadata",
            Resource: vmName,
            Message:  fmt.Sprintf("Could not parse VM metadata: %v", err),
            Severity: "warning",
        })
        return vmInfo  // Return partial info rather than failing completely
    }

    // Fetch VMI details - if this fails, continue without VMI data
    vmiData, err := vmi.FetchVMIDetails(client, vmInfo.Name, ...)
    if err != nil {
        vmInfo.Errors = append(vmInfo.Errors, models.VMError{
            Type:     "vmi",
            Resource: vmInfo.Name,
            Message:  fmt.Sprintf("Could not fetch VMI details: %v", err),
            Severity: "warning",
        })
        // Continue processing other components
    }
}
```

**Error Classification:**
Errors are categorized by type and severity:

```go
type VMError struct {
    Type     string `json:"type"`      // "metadata", "vmi", "storage", "network"
    Resource string `json:"resource"`  // Specific resource name that failed
    Message  string `json:"message"`   // Human-readable error description
    Severity string `json:"severity"`  // "critical", "warning", "info"
}
```

**Frontend Error Handling:**
The JavaScript frontend handles various error scenarios:

```javascript
// From js/app.js - Connection error handling
async startDataFetching() {
    try {
        const response = await fetch('/data');

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        AppState.updateData(data);

    } catch (error) {
        // Provide specific error messages based on error type
        let userMessage = 'Unable to connect to server';

        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            userMessage = 'Server is not responding - check if backend is running';
        } else if (error.message.includes('500')) {
            userMessage = 'Server error - check backend logs';
        }

        ViewManager.updateUpgradeStatus('error', userMessage);
        this.showConnectionError(userMessage);
    }
}
```

**Error Propagation to UI:**
VM errors collected during data processing are displayed in the dashboard:

```javascript
// From js/issue-detector.js - VM errors become visible issues
checkVMIssues(vm, issues) {
    if (vm.errors && vm.errors.length > 0) {
        const realErrors = vm.errors.filter(error =>
            error.severity !== 'info' && error.severity !== 'information'
        );

        realErrors.forEach(error => {
            issues.push(this.createIssue({
                title: `${error.type.toUpperCase()} Issue`,
                severity: error.severity || 'warning',
                description: error.message,
                affectedResource: `VM: ${vm.name}`,
            }));
        });
    }
}
```

**Logging Strategy:**
The system provides detailed logging for troubleshooting:

- Backend logs show which API calls succeeded/failed and timing
- Frontend logs connection issues and data parsing errors
- All errors include context about what was being attempted

This approach ensures the tool remains useful even when parts of the Harvester cluster are experiencing issues.

# Node and infrastructure data

│ ├── health/ # Health check framework
│ ├── vmim/ # VM migration tracking
│ └── pdb/ # Pod Disruption Budget checks
├── js/ # Frontend JavaScript modules
│ ├── app.js # Main application logic
│ ├── issue-detector.js # Issue detection algorithms
│ ├── state.js # Application state management
│ └── renderers/ # UI rendering components
└── styles/ # CSS stylesheets

````

**Adding New Data Sources:**
To add a new data type (e.g., network policies):

1. **Define Data Model** in `internal/models/types.go`:
```go
type NetworkPolicyInfo struct {
    Name      string   `json:"name"`
    Namespace string   `json:"namespace"`
    Rules     []string `json:"rules"`
}
````

2. **Create Service** in `internal/services/network/`:

```go
func FetchNetworkPolicies(client *kubernetes.Clientset) ([]NetworkPolicyInfo, error) {
    // API call logic
}
```

3. **Update Data Collection** in `batch_fetcher.go`:

```go
func (df *DataFetcher) fetchFullClusterData() (models.FullClusterData, error) {
    // Add network policy collection
    networkPolicies, err := network.FetchNetworkPolicies(df.client)
    allData.NetworkPolicies = networkPolicies
}
```

4. **Add Frontend Display** in `js/app.js` and create rendering logic

**Adding New Issue Detection:**
To add custom issue detection rules:

1. **Extend Issue Detector** in `js/issue-detector.js`:

```javascript
checkNetworkIssues(data, issues) {
    if (data.networkPolicies) {
        data.networkPolicies.forEach(policy => {
            if (policy.rules.length === 0) {
                issues.push(this.createIssue({
                    title: 'Empty Network Policy',
                    severity: 'warning',
                    description: `Network policy ${policy.name} has no rules`
                }));
            }
        });
    }
}
```

2. **Call from Main Detection** function:

```javascript
detectIssues(data) {
    const issues = [];
    this.checkVMIssues(data.vms, issues);
    this.checkNodeIssues(data.nodes, issues);
    this.checkNetworkIssues(data, issues);  // Add new check
    return issues;
}
```

### Q19: What are the actual limitations and known issues?

Being transparent about limitations helps set proper expectations for the tool.

**Current Limitations:**

**1. Read-Only Operation:**

- The tool only displays information; it cannot fix issues
- No ability to restart VMs, rebuild replicas, or modify configurations
- You still need kubectl or Harvester UI for remediation actions

**2. Polling-Based Updates:**

- Data freshness depends on when you last loaded the page
- No automatic refresh - you need to manually reload to see changes
- Real-time events (like VM starting/stopping) aren't immediately visible

**3. Single Cluster View:**

- Current implementation connects to one cluster at a time
- No built-in multi-cluster aggregation
- Need separate instances for multiple Harvester clusters

**4. Longhorn-Centric Storage Analysis:**

- Deep storage insights only available for Longhorn CSI
- Other storage backends show basic information only
- Replica health, engine status only available for Longhorn volumes

**5. Network Connectivity Requirements:**

- Requires active connection to Kubernetes API server
- No offline mode or cached data persistence
- Network issues affect data availability

**Known Issues:**

**1. Large Cluster Performance:**

- Data fetching can take 15-30 seconds for clusters with 200+ VMs
- Browser memory usage increases with cluster size
- No pagination in the UI currently

**2. Error Recovery:**

- If kubeconfig becomes invalid, requires manual restart
- No automatic retry on transient API server connectivity issues
- Partial data corruption if API calls timeout mid-fetch

**3. Browser Compatibility:**

- Requires modern JavaScript (ES6+)
- Not tested extensively on mobile browsers
- Some features may not work in older browser versions

**4. Resource Detection Edge Cases:**

- Complex PVC topologies (shared volumes) may not display correctly
- Custom storage configurations might not be fully understood
- VMI without corresponding VM objects might be missed

**What We Don't Support:**

- **VM Management**: No start/stop/restart capabilities
- **Configuration Changes**: No editing of VM specs or storage
- **Historical Data**: No trending or time-series analysis
- **Alerting**: No built-in notification system
- **Authentication**: No user management or access control
- **Custom Resources**: No support for non-standard Harvester extensions

**Workarounds:**

- Use kubectl for management operations
- Refresh the page periodically for updated data
- Deploy multiple instances for multi-cluster visibility
- Check logs for detailed error information when issues occur

Being aware of these limitations helps you use the tool effectively as part of a broader troubleshooting toolkit.

### Q20: How would someone contribute or modify the codebase?

The project is structured to be developer-friendly with clear separation of concerns.

**Project Structure Overview:**

```
harvesterNavigator/
├── main.go                 # Entry point and HTTP server
├── batch_fetcher.go        # Main data collection orchestration
├── internal/
│   ├── client/            # Kubernetes client setup
│   ├── models/            # Data structures (types.go)
│   └── services/          # Resource-specific collection logic
│       ├── vm/           # Virtual machine data
│       ├── volume/       # Storage and PVC handling
│       ├── replicas/     # Longhorn replica analysis
│       ├── node/         # Node and infrastructure data
│       ├── health/       # Health check framework
│       ├── vmim/         # VM migration tracking
│       └── pdb/          # Pod Disruption Budget checks
├── js/                    # Frontend JavaScript modules
│   ├── app.js            # Main application logic
│   ├── issue-detector.js # Issue detection algorithms
│   ├── state.js          # Application state management
│   └── renderers/        # UI rendering components
└── styles/               # CSS stylesheets
```

**Adding New Data Sources:**
To add a new data type (e.g., network policies):

1. **Define Data Model** in `internal/models/types.go`:

```go
type NetworkPolicyInfo struct {
    Name      string   `json:"name"`
    Namespace string   `json:"namespace"`
    Rules     []string `json:"rules"`
}
```

2. **Create Service** in `internal/services/network/`:

```go
func FetchNetworkPolicies(client *kubernetes.Clientset) ([]NetworkPolicyInfo, error) {
    // API call logic
}
```

3. **Update Data Collection** in `batch_fetcher.go`:

```go
func (df *DataFetcher) fetchFullClusterData() (models.FullClusterData, error) {
    // Add network policy collection
    networkPolicies, err := network.FetchNetworkPolicies(df.client)
    allData.NetworkPolicies = networkPolicies
}
```

4. **Add Frontend Display** in `js/app.js` and create rendering logic

**Adding New Issue Detection:**
To add custom issue detection rules:

1. **Extend Issue Detector** in `js/issue-detector.js`:

```javascript
checkNetworkIssues(data, issues) {
    if (data.networkPolicies) {
        data.networkPolicies.forEach(policy => {
            if (policy.rules.length === 0) {
                issues.push(this.createIssue({
                    title: 'Empty Network Policy',
                    severity: 'warning',
                    description: `Network policy ${policy.name} has no rules`
                }));
            }
        });
    }
}
```

2. **Call from Main Detection** function:

```javascript
detectIssues(data) {
    const issues = [];
    this.checkVMIssues(data.vms, issues);
    this.checkNodeIssues(data.nodes, issues);
    this.checkNetworkIssues(data, issues);  // Add new check
    return issues;
}
```

**Development Workflow:**

1. **Setup Development Environment:**

```bash
# Clone the repository
git clone https://github.com/rajeshkio/harvester-navigator.git
cd harvester-navigator

# Install dependencies
go mod tidy

# Verify build
go build -o harvesterNavigator
```

2. **Local Development with Simulator:**

```bash
# Start Harvester simulator in another terminal
support-bundle-kit simulator --reset

# Run your modified version
./harvesterNavigator

# Access at http://localhost:8080
```

3. **Making Changes:**

```bash
# Backend changes - edit Go files
vim internal/services/vm/vm.go

# Rebuild
go build -o harvesterNavigator

# Frontend changes - edit JS/HTML/CSS (no rebuild needed)
vim js/app.js
# Just refresh browser to see changes
```

**Testing Your Changes:**

**Backend Testing:**

```bash
# Run with verbose logging
./harvesterNavigator 2>&1 | tee debug.log

# Test specific endpoints
curl -s http://localhost:8080/data | jq '.vms[0]'

# Check API call performance
grep "Data sent in" debug.log
```

**Frontend Testing:**

```bash
# Open browser console (F12) to see JavaScript logs
# Check for errors in Console tab
# Monitor Network tab to see API calls

# Test with different cluster sizes
# Verify issue detection works
# Check UI responsiveness
```

**Code Style Guidelines:**

**Go Backend:**

- Follow standard Go conventions (gofmt)
- Add comments for exported functions
- Use descriptive variable names
- Handle errors gracefully with proper logging

```go
// Good example
func FetchVMData(client *kubernetes.Clientset, namespace string) ([]VMInfo, error) {
    vms, err := client.CoreV1().VirtualMachines(namespace).List(context.Background(), metav1.ListOptions{})
    if err != nil {
        log.Printf("Failed to fetch VMs: %v", err)
        return nil, fmt.Errorf("fetching VMs: %w", err)
    }
    return parseVMData(vms), nil
}
```

**JavaScript Frontend:**

- Use ES6+ features (const, arrow functions, async/await)
- Keep functions focused and modular
- Add comments for complex logic
- Use descriptive names for UI elements

```javascript
// Good example
async function fetchClusterData() {
  try {
    const response = await fetch("/data");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch data:", error);
    throw error;
  }
}
```

**Building for Release:**

```bash
# Build for multiple platforms
GOOS=linux GOARCH=amd64 go build -o harvesterNavigator-linux-amd64
GOOS=darwin GOARCH=amd64 go build -o harvesterNavigator-darwin-amd64
GOOS=darwin GOARCH=arm64 go build -o harvesterNavigator-darwin-arm64
GOOS=windows GOARCH=amd64 go build -o harvesterNavigator-windows-amd64.exe

# Verify embedded assets are included
ls -lh harvesterNavigator-*
# Should be ~10-15MB per binary
```

**Contribution Process:**

1. **Fork and Branch:**

```bash
git checkout -b feature/add-network-policy-support
```

2. **Make Changes:**

- Write code following the patterns above
- Test with real Harvester cluster or simulator
- Document new features in README

3. **Commit with Clear Messages:**

```bash
git commit -m "Add network policy monitoring

- Add NetworkPolicyInfo struct to models
- Implement FetchNetworkPolicies service
- Add frontend rendering for network policies
- Include issue detection for empty policies"
```

4. **Submit Pull Request:**

- Describe what the change does and why
- Include screenshots for UI changes
- Mention any breaking changes
- Reference related issues

**Common Extension Patterns:**

**Adding New Resource Type:**

```go
// 1. Define model in internal/models/types.go
type NewResourceInfo struct {
    Name   string `json:"name"`
    Status string `json:"status"`
}

// 2. Create service in internal/services/newresource/
func FetchNewResources(client *kubernetes.Clientset) ([]models.NewResourceInfo, error) {
    // Implementation
}

// 3. Add to batch_fetcher.go
func (df *DataFetcher) fetchFullClusterData() {
    // ... existing code ...
    allData.NewResources, err = newresource.FetchNewResources(df.client)
}

// 4. Add to types.go FullClusterData
type FullClusterData struct {
    // ... existing fields ...
    NewResources []NewResourceInfo `json:"newResources"`
}
```

**Adding New Issue Detection:**

```javascript
// In js/issue-detector.js
class IssueDetector {
  // ... existing methods ...

  checkNewResourceIssues(data, issues) {
    if (!data.newResources) return;

    data.newResources.forEach((resource) => {
      if (resource.status === "Failed") {
        issues.push(
          this.createIssue({
            severity: "high",
            title: "Resource Failure",
            description: `${resource.name} has failed`,
            category: "Infrastructure",
          })
        );
      }
    });
  }

  detectIssues(data) {
    const issues = [];
    this.checkVMIssues(data.vms, issues);
    this.checkNodeIssues(data.nodes, issues);
    this.checkNewResourceIssues(data, issues); // Add here
    return issues;
  }
}
```

**Debugging Tips:**

**Backend Debugging:**

```bash
# Add debug logging
log.Printf("DEBUG: Processing VM %s with %d replicas", vmName, len(replicas))

# Check timing
start := time.Now()
// ... operation ...
log.Printf("Operation took %v", time.Since(start))

# Inspect API responses
fmt.Printf("API Response: %+v\n", response)
```

**Frontend Debugging:**

```javascript
// Add console logging
console.log("Processing VM:", vm.name);
console.table(vm.replicaInfo);

// Debug state changes
AppState.updateData = function (data) {
  console.log("State update:", data);
  // ... rest of function
};

// Check performance
console.time("issue-detection");
const issues = IssueDetector.detectIssues(data);
console.timeEnd("issue-detection");
```

**Resources for Contributors:**

- **Kubernetes Client-Go**: https://github.com/kubernetes/client-go
- **Longhorn Documentation**: https://longhorn.io/docs/
- **KubeVirt Documentation**: https://kubevirt.io/user-guide/
- **Harvester Documentation**: https://docs.harvesterhci.io/

**Getting Help:**

- Open an issue on GitHub for bugs or feature requests
- Check existing issues for similar problems
- Include logs, cluster size, and steps to reproduce
- Share your kubeconfig setup (without sensitive data)

The codebase is designed to be hackable - dive in and experiment. The modular structure makes it straightforward to add new features without breaking existing functionality.

## 📝 **Summary**

These 20 questions cover the complete technical depth of Harvester Navigator:

**Architecture & Design** (Q1-4): Core concepts, data flow, kubeconfig detection  
**Implementation Details** (Q5-7): Data correlation, health checks, migration tracking  
**Live Demonstration** (Q8-13): Setup, troubleshooting, kubectl integration  
**Advanced Topics** (Q14-20): Batch fetching, embedded files, CSI drivers, data models, error handling, limitations, contribution guide

The tool represents a practical solution to real Harvester troubleshooting challenges, combining intelligent batch processing with comprehensive data correlation to provide unified cluster visibility.
