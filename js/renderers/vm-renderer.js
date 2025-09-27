// Refined VM Table Renderer - Consistent Badges and Perfect Alignment
const VMRenderer = {
    render(vms, issues) {
        const container = document.getElementById('vm-list');
        container.innerHTML = '';
        
        // Update VM count
        const vmCountElement = document.getElementById('vm-count');
        if (vmCountElement) {
            vmCountElement.textContent = vms ? vms.length : 0;
        }
        
        if (!vms || vms.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">No virtual machines found</div>';
            return;
        }
        const sortedVMs = this.sortVMsByPriority(vms); 
        // Create the table structure
        const table = document.createElement('table');
        table.className = 'w-full text-sm';
        
        // Create table header with center-aligned status columns
        table.innerHTML = `
            <thead>
                <tr class="border-b border-slate-600 text-slate-300">
                    <th class="text-left py-3 px-4 font-medium text-base">Name</th>
                    <th class="text-center py-3 px-4 font-medium text-base">Status</th>
                    <th class="text-left py-3 px-4 font-medium text-base">Node</th>
                    <th class="text-left py-3 px-4 font-medium text-base">IP Address</th>
                    <th class="text-left py-3 px-4 font-medium text-base">Phase</th>
                    <th class="text-center py-3 px-4 font-medium text-base">Storage</th>
                </tr>
            </thead>
            <tbody id="vm-table-body" class="divide-y divide-slate-700">
            </tbody>
        `;
        
        container.appendChild(table);
        
        const tbody = document.getElementById('vm-table-body');
        
        // Create table rows for each VM
        sortedVMs.forEach(vm => {
            const vmRow = this.createVMTableRow(vm);
            tbody.appendChild(vmRow);
        });
    },
    
    createVMTableRow(vm) {
        const status = vm.printableStatus || 'Unknown';
        const realIssueCount = AppState.countRealIssues(vm.errors);
        const vmMetrics = this.getVMMetrics(vm);
        const migrationInfo = this.getMigrationInfo(vm.vmimInfo);
        
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-700/30 cursor-pointer transition-colors';
        
        row.innerHTML = `
            <!-- VM Name -->
            <td class="py-3 px-4">
                <div>
                    <div class="font-medium text-white text-base">${vm.name}</div>
                    <div class="text-sm text-slate-400">${vm.namespace}</div>
                    ${migrationInfo.isActive ? `
                        <div class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-yellow-900/30 text-yellow-300 text-sm rounded">
                            <span class="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
                            Migration: ${migrationInfo.phase}
                        </div>
                    ` : ''}
                </div>
            </td>
            
            <!-- Status - Centered with consistent badge styling -->
            <td class="py-3 px-4 text-center">
                <div class="flex flex-col items-center gap-1">
                    <span class="px-2 py-1 text-sm font-medium rounded ${this.getStatusBadgeClass(status)}">
                        ${status}
                    </span>
                    ${vm.vmStatusReason ? `
                        <div class="text-sm text-slate-400 max-w-24 truncate" title="${vm.vmStatusReason}">
                            ${vm.vmStatusReason}
                        </div>
                    ` : ''}
                </div>
            </td>
            
            <!-- Node -->
            <td class="py-3 px-4">
                <span class="text-white font-medium text-base">${vmMetrics.node}</span>
                ${migrationInfo.isActive && migrationInfo.targetNode ? `
                    <div class="text-sm text-yellow-400 mt-1">
                        → ${migrationInfo.targetNode}
                    </div>
                ` : ''}
            </td>
            
            <!-- IP Address -->
            <td class="py-3 px-4">
                ${vmMetrics.ipAddress ? `
                    <span class="font-mono text-white text-sm">${vmMetrics.ipAddress}</span>
                ` : `
                    <span class="text-slate-500 text-sm">No IP</span>
                `}
            </td>
            
            <!-- Phase -->
            <td class="py-3 px-4">
                <span class="text-white text-base">${vmMetrics.phase}</span>
            </td>
            
            <!-- Storage - Centered with consistent badge styling -->
            <td class="py-3 px-4 text-center">
                <div class="flex flex-col items-center gap-1">
                    ${vm.pvcStatus ? `
                        <span class="px-2 py-1 text-sm font-medium rounded ${this.getStorageStatusClass(vm.pvcStatus)}">
                            ${vm.pvcStatus}
                        </span>
                    ` : `
                        <span class="px-2 py-1 text-sm rounded bg-slate-700/50 text-slate-400">N/A</span>
                    `}
                    ${vm.storageClass ? `
                        <div class="text-slate-400 text-sm">${vm.storageClass}</div>
                    ` : ''}
                </div>
            </td>
        `;
        
        // Add click handler for VM details
        row.addEventListener('click', () => ViewManager.showVMDetail(vm.name));
        
        return row;
    },

    getVMMetrics(vm) {
        let node = 'N/A';
        let phase = 'Unknown';
        let ipAddress = null;

        if (vm.vmiInfo && vm.vmiInfo.length > 0) {
            const vmi = vm.vmiInfo[0];
            node = vmi.nodeName || node;
            phase = vmi.phase || phase;
            
            if (vmi.interfaces && vmi.interfaces.length > 0) {
                const prioritizedInterfaces = vmi.interfaces
                    .filter(iface => iface.ipAddress && iface.ipAddress !== '127.0.0.1')
                    .sort((a, b) => {
                        // Prioritize non-system interfaces
                        const aIsSystem = a.interfaceName?.match(/(^lo|^lxc|cilium|flannel|cni)/i);
                        const bIsSystem = b.interfaceName?.match(/(^lo|^lxc|cilium|flannel|cni)/i);
                        
                        if (aIsSystem && !bIsSystem) return 1;
                        if (!aIsSystem && bIsSystem) return -1;
                        return 0;
                    });
                
                if (prioritizedInterfaces.length > 0) {
                    ipAddress = prioritizedInterfaces[0].ipAddress;
                }
            }
        }

        if (node === 'N/A' && vm.podInfo && vm.podInfo.length > 0) {
            node = vm.podInfo[0].nodeId || vm.podInfo[0].nodeName || node;
        }

        return { node, phase, ipAddress };
    },

    getMigrationInfo(vmimInfo) {
        if (!vmimInfo || vmimInfo.length === 0) {
            return { isActive: false };
        }

        const latestMigration = vmimInfo[vmimInfo.length - 1];
        const isActive = ['Running', 'Scheduling', 'Scheduled', 'PreparingTarget', 'TargetReady'].includes(latestMigration.phase);
        
        return {
            isActive,
            phase: latestMigration.phase,
            sourceNode: latestMigration.sourceNode,
            targetNode: latestMigration.targetNode
        };
    },

    getStatusBadgeClass(status) {
        const statusMap = {
            'running': 'bg-green-700/80 text-green-200',
            'stopped': 'bg-slate-600/80 text-slate-200', 
            'starting': 'bg-yellow-700/80 text-yellow-200',
            'stopping': 'bg-orange-700/80 text-orange-200',
            'error': 'bg-red-700/80 text-red-200',
            'failed': 'bg-red-700/80 text-red-200',
            'paused': 'bg-blue-700/80 text-blue-200',
            'bound': 'bg-green-700/80 text-green-200',
            'pending': 'bg-yellow-700/80 text-yellow-200',
            'lost': 'bg-red-700/80 text-red-200'
        };
        return statusMap[status?.toLowerCase()] || 'bg-slate-600/80 text-slate-200';
    },

    getStorageStatusClass(status) {
        const statusMap = {
            'bound': 'bg-green-700/80 text-green-200',
            'pending': 'bg-yellow-700/80 text-yellow-200',
            'lost': 'bg-red-700/80 text-red-200'
        };
        return statusMap[status?.toLowerCase()] || 'bg-slate-600/80 text-slate-200';
    },

    sortVMsByPriority(vms) {
        return [...vms].sort((a, b) => {
            const getHasSplitBrain = (vm) => {
                if (!vm.vmiInfo || !vm.vmiInfo.length || !vm.vmiInfo[0].activePods) return false;
                const activePods = vm.vmiInfo[0].activePods;
                const nodes = [...new Set(Object.values(activePods))];
                return Object.keys(activePods).length > 1 && nodes.length > 1;
            };

            // Update priority calculation:
            const aHasSplitBrain = getHasSplitBrain(a);
            const bHasSplitBrain = getHasSplitBrain(b);

            // 0. Split-brain comes first (critical priority)
            if (aHasSplitBrain && !bHasSplitBrain) return -1;
            if (!aHasSplitBrain && bHasSplitBrain) return 1;
            const getMigrationInfo = (vm) => {
                if (!vm.vmimInfo || !Array.isArray(vm.vmimInfo) || vm.vmimInfo.length === 0) {
                    return { isActive: false, phase: 'None' };
                }
                
                const migration = vm.vmimInfo[0];
                const isActive = ['Running', 'Scheduling', 'Scheduled', 'PreparingTarget', 'TargetReady'].includes(migration.phase);
                return { isActive, phase: migration.phase || 'Unknown' };
            };
            
            const getIssueCount = (vm) => AppState.countRealIssues(vm.errors || []);
            
            const getStatusPriority = (status) => {
                // Lower number = higher priority (shows first)
                const statusPriority = {
                    'Failed': 1,
                    'Error': 1,
                    'Stopped': 2,
                    'Stopping': 2,
                    'Starting': 3,
                    'Pending': 3,
                    'Running': 4,
                    'Succeeded': 5
                };
                return statusPriority[status] || 3; // Default to middle priority
            };
            
            // Priority calculation for VM A and B
            const aMigration = getMigrationInfo(a);
            const bMigration = getMigrationInfo(b);
            const aIssues = getIssueCount(a);
            const bIssues = getIssueCount(b);
            const aStatusPriority = getStatusPriority(a.printableStatus);
            const bStatusPriority = getStatusPriority(b.printableStatus);
            
            // 1. Active migrations come first (highest priority)
            if (aMigration.isActive && !bMigration.isActive) return -1;
            if (!aMigration.isActive && bMigration.isActive) return 1;
            
            // 2. VMs with issues come next
            if (aIssues > 0 && bIssues === 0) return -1;
            if (aIssues === 0 && bIssues > 0) return 1;
            if (aIssues !== bIssues) return bIssues - aIssues; // More issues = higher priority
            
            // 3. Non-running statuses come before running
            if (aStatusPriority !== bStatusPriority) {
                return aStatusPriority - bStatusPriority;
            }
            
            // 4. Within same priority, sort alphabetically by name
            return a.name.localeCompare(b.name);
        });
    },
};