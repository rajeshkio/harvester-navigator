# Harvester Troubleshooting via UI

![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/rajeshkio/harvester-navigator)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Harvester Troubleshooting via UI** is a comprehensive web-based dashboard designed to work with the Harvester support bundle simulator, providing real-time insights into Harvester-based Kubernetes virtual machines and their associated resources. The tool can also be used directly with live Harvester clusters for real-time monitoring and troubleshooting.

## 🎯 Purpose

This tool is designed to provide a **holistic view of Harvester clusters** and enable rapid issue identification. It's built primarily to accompany the **Harvester support bundle simulator** for troubleshooting scenarios, while also supporting direct connections to live Harvester clusters.

## ✨ Features

### 🌐 **Web Dashboard**
- **Real-time monitoring** of Harvester clusters via WebSocket connections
- **Interactive VM explorer** with detailed drill-down capabilities
- **Comprehensive node dashboard** showing Longhorn node status and disk information

### 🔍 **VM & Infrastructure Insights**
- **Complete VM lifecycle tracking** - Status, resources, and configuration details
- **Advanced storage analytics** - PVC, volumes, and Longhorn-specific information
- **Replica health monitoring** - Detailed replica status with networking information
- **VMI details** - Guest OS, memory usage, and network interface information
- **Pod relationship mapping** - VM to Pod to Node associations

### 🚨 **Intelligent Error Detection**
- **Automatic issue identification** - Missing volumes, failed replicas, connection problems
- **Structured error reporting** - Categorized by severity (Warning, Error, Critical)
- **Resource-specific diagnostics** - Pinpoint exactly which components are failing
- **Troubleshooting guidance** - Clear error messages with actionable information

### 📊 **Upgrade & Version Tracking**
- **Harvester upgrade history** - Track version progressions and upgrade status
- **Node-level upgrade status** - Monitor upgrade success across cluster nodes
- **Upgrade timeline** - See when upgrades were performed and their outcomes


## 🚀 Installation & Setup

### Prerequisites

- **Harvester cluster** OR **Harvester support bundle simulator**
- **kubectl** configured with access to your environment
- **Web browser** for accessing the dashboard

### Option 1: Download Pre-built Binary (Recommended)

Download the latest release from the [releases page](https://github.com/rajeshkio/harvester-navigator/releases/latest):

**Choose the binary for your platform:**
- **Linux (x64)**: `harvesterNavigator-linux-amd64`
- **Linux (ARM64)**: `harvesterNavigator-linux-arm64`  
- **macOS (Intel)**: `harvesterNavigator-darwin-amd64`
- **macOS (Apple Silicon)**: `harvesterNavigator-darwin-arm64`
- **Windows**: `harvesterNavigator-windows-amd64.exe`

```bash
# Make executable (Linux/macOS)
chmod +x harvesterNavigator-*

# Run with default port 8080
./harvesterNavigator-linux-amd64

# Run with custom port
./harvesterNavigator-linux-amd64 -port 9090

# Show version information
./harvesterNavigator-linux-amd64 -version

# Access the dashboard
open http://localhost:8080
```

### Option 2: Build from Source

For development or if you prefer building from source:

```bash
# Prerequisites: Go 1.23+ required
git clone https://github.com/rajeshkio/harvester-navigator.git
cd harvester-navigator
go build -o harvesterNavigator
./harvesterNavigator
```

### macOS Security Notice

If macOS blocks the binary with "unverified developer" error:

**Option 1 - Build from source (Recommended for corporate environments):**
```bash
git clone https://github.com/rajeshkio/harvester-navigator.git
cd harvester-navigator
go build -o harvesterNavigator
./harvesterNavigator
```

**Option 2 - Override security (if allowed by IT policy):**
```bash
# Download the binary, then:
xattr -d com.apple.quarantine ./harvesterNavigator-darwin-arm64
chmod +x ./harvesterNavigator-darwin-arm64
./harvesterNavigator-darwin-arm64
```

### Windows Usage Instructions

**IMPORTANT:** Double-clicking the .exe file will NOT work because this is a command-line server application.

You must run it from Command Prompt or PowerShell:

**Option 1 - Command Prompt:**
```cmd
# Navigate to download folder
cd Downloads

# Run with default port 8080
harvesterNavigator-windows-amd64.exe

# Run with custom port
harvesterNavigator-windows-amd64.exe -port 9090

# Show version
harvesterNavigator-windows-amd64.exe -version
```

**Option 2 - PowerShell:**
```cmd
powershell# Navigate to download folder
cd $env:USERPROFILE\Downloads

# Run the server
.\harvesterNavigator-windows-amd64.exe

# Access dashboard (keep terminal open)
Start-Process "http://localhost:8080"
```

### Using with Harvester Support Bundle Simulator

```bash
# Start the Harvester simulator
support-bundle-kit simulator --reset

# Download and run harvesterNavigator (it will automatically connect to the simulator)
./harvesterNavigator

# Access the dashboard
open http://localhost:8080
```

### Using with Live Harvester Cluster

```bash
# Set your kubeconfig environment variable
export KUBECONFIG=/path/to/your/harvester-kubeconfig

# Run the application
./harvesterNavigator

# Access the dashboard
open http://localhost:8080
```

## 🔧 How It Works

### Self-Contained Architecture
The application is distributed as a **single binary** with all static assets (HTML, JavaScript, CSS) embedded directly into the executable using Go's `embed` feature. This means:
- **No external dependencies** - everything needed is in one file
- **Easy deployment** - just copy the binary and run
- **Consistent distribution** - same experience across all platforms

### Web Dashboard Architecture
1. **Backend server** starts and establishes Kubernetes API connections
2. **Automatic environment detection** - Works with both simulator and live clusters
3. **Comprehensive data gathering**:
   - Fetches all Harvester VMs and their metadata
   - Retrieves Longhorn node status and disk information
   - Gathers PVC, volume, and replica details
   - Collects VMI information including guest OS details
   - Tracks Harvester upgrade history and status
4. **Intelligent error detection** identifies missing or failed resources
5. **Interactive UI** presents data with drill-down capabilities for rapid troubleshooting

### Connection Methods
- **Automatic**: Detects simulator kubeconfig at `~/.sim/admin.kubeconfig`
- **Manual**: Uses `KUBECONFIG` environment variable for live cluster connections
- **Fallback**: Uses default kubeconfig at `~/.kube/config`

### Command Line Options
```bash
./harvesterNavigator -h

Usage of ./harvesterNavigator:
  -port string
        Port to run the server on (default "8080")
  -version
        Show version and exit
```

## 🏗️ Project Structure

```
.
├── go.mod                 # Go module definition
├── go.sum                 # Go module checksums
├── index.html             # Web dashboard frontend (embedded)
├── js/                    # JavaScript modules (embedded)
│   ├── app.js             # Main application logic
│   ├── config.js          # Configuration management
│   ├── issue-detector.js  # Error detection logic
│   ├── renderers/         # UI rendering components
│   ├── search.js          # Search functionality
│   ├── state.js           # Application state management
│   ├── utils.js           # Utility functions
│   ├── view-manager.js    # View routing and management
│   └── websocket.js       # WebSocket communication
├── styles/                # CSS stylesheets (embedded)
│   └── main.css           # Main stylesheet
├── main.go                # Application entry point & WebSocket server
├── internal/              # Internal packages
│   ├── client/            # Kubernetes client initialization
│   ├── models/            # Data structures and types
│   │   └── types.go       # VM, Node, Replica, and Error models
│   └── services/          # Resource-specific service packages
│       ├── engine/        # Longhorn engine service
│       ├── pod/           # Pod information service
│       ├── pvc/           # PVC service for storage
│       ├── replicas/      # Replica monitoring service
│       ├── upgrade/       # Harvester upgrade tracking
│       ├── vm/            # Virtual Machine service
│       ├── vmi/           # VM Instance service (with guest OS)
│       └── volume/        # Longhorn volume service
└── pkg/                   # Exported packages
    └── display/           # Terminal formatting utilities (legacy)
```

## 📱 Dashboard Features

### Main Dashboard
- **Node Status Grid**: Real-time status of all Longhorn nodes
- **VM Overview Cards**: Quick status overview of all virtual machines
- **Live Connection Status**: WebSocket connectivity and data freshness

### VM Detail View
- **Resource Summary**: VM configuration, namespace, and image details
- **Pod Information**: Associated pod status and node placement
- **VMI Details**: Guest OS information, memory usage, IP addresses
- **Storage Analysis**: PVC status, volume health, and replica distribution
- **Error Diagnostics**: Detailed issue reporting with severity levels

### Node Detail View
- **Node Health**: Comprehensive node condition monitoring
- **Disk Management**: Storage capacity, utilization, and schedulability
- **Replica Distribution**: Which replicas are hosted on each disk

## 🎯 Use Cases

### Platform Operations
- **Health monitoring** of Harvester infrastructure
- **Proactive issue detection** before VM failures
- **Storage capacity planning** and optimization
- **Upgrade progress tracking** across cluster nodes

### Troubleshooting Scenarios
- **VM won't start**: Check PVC binding, volume availability, node resources
- **Storage issues**: Identify failed replicas, engine problems, or disk issues
- **Network problems**: Verify VMI interfaces and IP assignments
- **Performance issues**: Monitor resource allocation and node distribution

### Infrastructure Management
- **Cluster overview** for operations teams
- **Resource dependency verification** for applications
- **Storage performance analysis** for workload optimization


## 🚨 Error Detection & Reporting

The system automatically detects and categorizes:

- **🔴 Critical**: Volume completely missing, all replicas failed
- **🟡 Warning**: Individual replica issues, temporary connectivity problems
- **📋 Info**: Resource state changes, upgrade progress

Error messages include:
- **Resource type** (Volume, PVC, Pod, VMI, Replica, Engine)
- **Specific resource name** causing the issue
- **Detailed error description** with actionable information
- **Severity classification** for prioritization

## 🔄 Development & Contributing

### Setting up Development Environment
```bash
# Clone and enter directory
git clone https://github.com/rajeshkio/harvester-navigator.git
cd harvester-navigator

# Install dependencies
go mod tidy

# Install CSS build tools
npm install

# Build CSS (required for offline support)
npm run build:css

# Run in development mode
go run main.go

# Build for production
go build -o harvester-troubleshoot
```

### CSS Development
```bash
# Rebuild CSS after changing HTML/JS classes
npm run build:css

# Auto-rebuild CSS during active development
npm run watch:css
```

### Project Structure

- `js/` - Frontend JavaScript modules
- `styles/` - CSS files
  - `main.css` - Custom styles
  - `tailwind.css` - Built Tailwind CSS (generated, do not edit)
- `index.html` - Main application UI
- `tailwind.config.js` - Tailwind configuration
- `input.css` - CSS source for Tailwind build

### Notes

- The application uses **local Tailwind CSS** for offline support
- CSS is embedded in the Go binary via `//go:embed`
- Run `npm run build:css` after adding new Tailwind classes
- `node_modules/` is gitignored (only needed for building)

### Contributing Guidelines

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with proper testing
4. **Add documentation** for new features
5. **Commit changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Create Pull Request**

### Code Standards
- Follow Go's [Effective Go](https://golang.org/doc/effective_go) guidelines
- Use meaningful variable and function names
- Add comprehensive error handling
- Include comments for complex logic
- Write tests for new functionality
- Maintain consistent code formatting


## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

*Built with ❤️ for the Harvester community*
