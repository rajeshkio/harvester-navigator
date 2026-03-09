# Harvester Navigator: Questions 16-20

## Q16: How does the volume service handle different CSI drivers beyond Longhorn?

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

## Q17: What's the data model structure and how do we extend it?

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

## Q18: How does error handling work throughout the system?

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

## Q19: What are the actual limitations and known issues?

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

## Q20: How would someone contribute or modify the codebase?

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
│       └── health/       # Health check framework
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
1. **Setup**: `go mod tidy` to ensure dependencies
2. **Build**: `go build -o harvesterNavigator`
3. **Test**: Run against test cluster or simulator
4. **Frontend Changes**: Edit JS/CSS files (embedded on next build)

**Key Extension Points:**
- **New CSI Drivers**: Extend volume service with driver-specific logic
- **Custom Health Checks**: Add to health service framework
- **UI Components**: Modular renderer system in `js/renderers/`
- **Data Processing**: Batch fetcher supports adding new API endpoints

**Code Patterns to Follow:**
- **Error Handling**: Always include error context and continue processing
- **Logging**: Use descriptive log messages with timing information
- **Batch Processing**: Group related API calls for performance
- **Data Correlation**: Link related resources (VM → PVC → Volume → Replicas)

The modular architecture makes it straightforward to add new features while maintaining the existing functionality.