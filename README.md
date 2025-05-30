# Harvester Navigator

![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/rk280392/harvesterNavigator)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Harvester Navigator is a powerful CLI tool that provides comprehensive insight into Harvester-based Kubernetes virtual machines and their associated resources. The tool retrieves detailed information about VMs, their storage volumes, replicas, and guest OS, presenting it in a visually appealing and organized format.

## Features

- 🔍 **Comprehensive VM Details**: Fetch complete information about Harvester virtual machines
- 💾 **Storage Insights**: View PVC and volume details with Longhorn-specific information
- 🔄 **Replica Status**: Monitor replica health and status across nodes
- 💻 **Guest OS Information**: Display OS details when the guest agent is running
- 🖧 **Network Information**: Show VM network interfaces with IP and MAC details
- 🎨 **Colorized Output**: Clearly see the status of various components with colored output

## Installation

### Prerequisites

- Go 1.23 or higher
- Kubernetes cluster running Harvester
- `kubectl` configured with access to your Harvester cluster

### Building from Source

```bash
# Clone the repository
git clone https://github.com/rk280392/harvesterNavigator.git
cd harvesterNavigator

# Build the binary
go build -o harvester-navigator

# Move to a directory in your PATH (optional)
sudo mv harvester-navigator /usr/local/bin/
```

## Usage

```bash
# Basic usage with default namespace and kubeconfig
EXPORT NAMESPACE=default
EXPORT KUBECONFIG=kubeconfig.yaml

harvester-navigator <vm-name>

# Specify a namespace
harvester-navigator -n <namespace> <vm-name>

# Use a specific kubeconfig
harvester-navigator -k /path/to/kubeconfig <vm-name>

# Full options
harvester-navigator --kubeconfig /path/to/kubeconfig --namespace harvester-system <vm-name>
```

## Project Structure

```
.
├── go.mod                 # Go module definition
├── go.sum                 # Go module checksums
├── internal/              # Internal packages (not exported)
│   ├── client/            # Kubernetes client initialization
│   ├── models/            # Data structures and types
│   └── services/          # Service packages for different resources
│       ├── engine/        # Longhorn engine service
│       ├── pvc/   # PVC service for Longhorn
│       ├── replicas/      # Replica service
│       ├── vm/            # Virtual Machine service
│       ├── vmi/           # Virtual Machine Instance service
│       └── volume/        # Volume service
├── main.go                # Application entry point
└── pkg/                   # Exported packages
    └── display/           # Display formatting utilities
```

## How It Works

Harvester Navigator connects to your Kubernetes cluster and:

1. Retrieves the virtual machine details
2. Fetches associated PVC information
3. Queries Longhorn volumes linked to the PVC
4. Gathers replica details for the volume
5. Collects information about any VM instances
6. Displays all information in a structured, colorized format

## Contributing

Contributions are welcome! Here's how you can contribute:

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/my-new-feature
   ```
3. **Make your changes**
4. **Add tests**
5. **Commit your changes**:
   ```bash
   git commit -am 'Add some feature'
   ```
6. **Push to the branch**:
   ```bash
   git push origin feature/my-new-feature
   ```
7. **Create a new Pull Request**

### Development Guidelines

- Follow Go's [effective Go](https://golang.org/doc/effective_go) guidelines
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Write tests for new functionality

## Future Enhancements

- Write test cases
- Watching for status changes in real-time
- May be Web UI interface

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.
