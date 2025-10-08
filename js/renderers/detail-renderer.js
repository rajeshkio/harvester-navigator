// Compact Detail Renderer - Dense Layout with Consolidated Health Issues
const DetailRenderer = {
    
    renderNodeDetail(nodeData) {
        if (!nodeData) {
            return '<div class="text-center py-8 text-slate-400">Node data not available</div>';
        }

        let healthSummary;
        try {
            healthSummary = this.analyzeNodeHealth(nodeData);
        } catch (error) {
            healthSummary = {
                issues: [],
                warnings: ['Health analysis failed'],
                overallHealthy: false,
                summary: 'Health check unavailable due to error'
            };
        }

        if (!healthSummary || typeof healthSummary !== 'object') {
            healthSummary = {
                issues: [],
                warnings: [],
                overallHealthy: true,
                summary: 'Health status unknown'
            };
        }

        const nodeName = nodeData.longhornInfo?.name || nodeData.kubernetesInfo?.name || 'Unknown Node';
        const lastUpdated = new Date().toLocaleString();
                
        return `
            <div class="bg-slate-800 rounded-lg">
                <div class="p-4 border-b border-slate-700">
                    <div class="flex justify-between items-start">
                        <div>
                            <h1 class="text-2xl font-semibold text-white">${nodeName}</h1>
                            <div class="flex items-center gap-3 mt-2">
                                <span class="px-3 py-1 text-sm rounded ${this.getNodeStatusBadge(nodeData)}">
                                    ${this.getNodeStatus(nodeData)}
                                </span>
                                ${this.renderRoleTags(nodeData.kubernetesInfo?.roles || ['worker'])}
                            </div>
                        </div>
                        <div class="text-right text-sm text-slate-400">
                            <div>Last Updated</div>
                            <div class="font-medium">${lastUpdated}</div>
                        </div>
                    </div>
                </div>

                <div class="p-6">
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        
                        <!-- Left Column -->
                        <div class="space-y-6">
                            ${this.renderHealth(nodeData, healthSummary)}
                            ${this.renderResources(nodeData)}
                            ${this.renderSystem(nodeData)}
                            ${this.renderQuickCommands(nodeName)}
                        </div>

                        <!-- Right Column -->
                        <div class="space-y-6">
                            ${this.renderStorage(nodeData.longhornInfo ? nodeData.longhornInfo.disks : [])}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderRoleTags(roles) {
        if (!roles || roles.length === 0) {
            return '<span class="px-2 py-1 text-xs rounded-full bg-slate-600/60 text-slate-300">worker</span>';
        }
        
        return roles.map(role => {
            const isControlPlane = role === 'control-plane';
            const bgClass = isControlPlane ? 'bg-blue-600/60 text-blue-200' : 'bg-slate-600/60 text-slate-300';
            return `<span class="px-2 py-1 text-xs rounded-full ${bgClass}">${role}</span>`;
        }).join(' ');
    },

    renderHealth(nodeData, healthSummary) {


        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">🏥</span>
                    <h2 class="text-lg font-medium text-white">Health Status</h2>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center gap-3 p-3 rounded ${healthSummary.overallHealthy ? 'bg-green-900/20 border border-green-600/30' : 'bg-red-900/20 border border-red-600/30'}">
                        <div>
                            <div class="font-medium text-white">${healthSummary.overallHealthy ? 'All Systems Healthy' : 'Issues Detected'}</div>
                            <div class="text-sm text-slate-400">${healthSummary.summary || 'Status information unavailable'}</div>
                        </div>
                    </div>

                    ${healthSummary.issues.length > 0 ? `
                        <div class="space-y-2">
                            ${healthSummary.issues.map(issue => `
                                <div class="flex items-start gap-2 p-2 bg-red-900/20 border border-red-600/30 rounded">
                                    <span class="text-red-400 mt-0.5">•</span>
                                    <div class="flex-1">
                                        <div class="text-red-300 text-sm font-medium">${issue.type}</div>
                                        <div class="text-red-200 text-xs">${issue.message}</div>
                                    </div>
                                    <span class="px-2 py-0.5 text-xs rounded ${this.getSeverityBadge(issue.severity)}">${issue.severity.toUpperCase()}</span>
                                </div>
                            `).join('')}
                            
                            <!-- View Issues Link -->
                            <div class="pt-2 border-t border-slate-600">
                                <button onclick="ViewManager.showAllIssuesView(); window.scrollTo(0, 0);" 
                                        class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2">
                                    <span>🔍</span>
                                    View All Issues Details
                                </button>
                            </div>
                        </div>
                    ` : ''}

                    ${healthSummary.warnings.length > 0 ? `
                        <div class="space-y-2">
                            ${healthSummary.warnings.map(warning => `
                                <div class="flex items-start gap-2 p-2 bg-yellow-900/20 border border-yellow-600/30 rounded">
                                    <span class="text-yellow-400 mt-0.5">•</span>
                                    <div class="flex-1">
                                        <div class="text-yellow-300 text-sm">${warning}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    analyzeNodeHealth(nodeData) {
        
        let issues = [];
        let warnings = [];
        let overallHealthy = true;
        let summary = '';

        try {
            // Kubernetes health checks
            if (nodeData && nodeData.kubernetesInfo && nodeData.kubernetesInfo.conditions && Array.isArray(nodeData.kubernetesInfo.conditions)) {
                if (nodeData.kubernetesInfo && nodeData.kubernetesInfo.unschedulable === true) {
                    warnings.push('Node is cordoned (scheduling disabled)');
                }
                nodeData.kubernetesInfo.conditions.forEach((condition, index) => {      
                    if (condition && condition.type === 'Ready' && condition.status !== 'True') {
                        issues.push({
                            type: 'Node Not Ready',
                            message: 'Kubernetes node is not in Ready state',
                            severity: 'critical'
                        });
                    }
                    if (condition && ['MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(condition.type) && condition.status === 'True') {
                        warnings.push(`${condition.type} detected`);
                    }
                });
            }
            // Storage health checks
            if (nodeData && nodeData.longhornInfo && nodeData.longhornInfo.disks && Array.isArray(nodeData.longhornInfo.disks)) {
                const unschedulableDisks = nodeData.longhornInfo.disks.filter(d => d && !d.isSchedulable).length;
                if (unschedulableDisks > 0) {
                    warnings.push(`${unschedulableDisks} disk${unschedulableDisks > 1 ? 's' : ''} not schedulable`);
                }
            }
            // PDB health checks
            if (nodeData && nodeData.pdbHealthStatus && nodeData.pdbHealthStatus.hasIssues) {
                const pdbHealth = nodeData.pdbHealthStatus;
                
                if (pdbHealth.issues && Array.isArray(pdbHealth.issues)) {
                    pdbHealth.issues.forEach((issue, index) => {                        
                        // Safe string handling
                        const issueType = (issue && issue.issueType && typeof issue.issueType === 'string') 
                            ? issue.issueType.replace(/_/g, ' ') 
                            : 'PDB Issue';
                        
                        const description = (issue && issue.description && typeof issue.description === 'string') 
                            ? issue.description 
                            : 'Configuration issue detected';
                            
                        issues.push({
                            type: 'Pod Disruption Budget',
                            message: `${issueType} - ${description}`,
                            severity: (pdbHealth.severity && typeof pdbHealth.severity === 'string') ? pdbHealth.severity : 'medium',
                            canFix: Boolean(pdbHealth.canSafelyDelete),
                            lastChecked: pdbHealth.lastChecked
                        });
                        
                    });
                }
            }

        } catch (error) {
            console.error('Error in health analysis:', error);
            console.error('Error stack:', error.stack);
            warnings.push('Health analysis encountered an error');
        }
        
        overallHealthy = issues.length === 0 && warnings.length === 0;

        if (overallHealthy) {
            summary = 'All systems operational';
        } else {
            const parts = [];
            if (issues.length > 0) {
                parts.push(`${issues.length} issue${issues.length > 1 ? 's' : ''}`);
            }
            if (warnings.length > 0) {
                parts.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`);
            }
            summary = parts.length > 0 ? parts.join(', ') : 'Issues detected';
        }

        const result = { issues, warnings, overallHealthy, summary };
        
        return result;
    },

    getSeverityBadge(severity) {
        const badges = {
            'critical': 'bg-red-700/80 text-red-200',
            'high': 'bg-orange-700/80 text-orange-200', 
            'medium': 'bg-yellow-700/80 text-yellow-200',
            'low': 'bg-blue-700/80 text-blue-200'
        };
        return badges[severity] || 'bg-slate-700/80 text-slate-200';
    },

    renderResources(nodeData) {
        const k8sInfo = nodeData.kubernetesInfo;
        const cpu = k8sInfo?.capacity?.cpu || '0';
        const memoryBytes = k8sInfo?.capacity?.memory ? this.parseMemoryToBytes(k8sInfo.capacity.memory) : 0;
        const memory = this.formatBytes(memoryBytes);
        
        // Try multiple possible paths for attached volumes
        const attachedVolumes = k8sInfo?.volumesAttached?.length || 0;
        
        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">📊</span>
                    <h2 class="text-lg font-medium text-white">Resources</h2>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-blue-400">${cpu}</div>
                        <div class="text-sm text-slate-400">cores</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-green-400">${memory}</div>
                        <div class="text-sm text-slate-400">Memory</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-purple-400">${nodeData.runningPods || 0}</div>
                        <div class="text-sm text-slate-400">Running Pods</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-orange-400">${attachedVolumes}</div>
                        <div class="text-sm text-slate-400">Volumes Attached</div>
                    </div>
                </div>
                ${k8sInfo?.internalIP ? `
                    <div class="mt-4 pt-4 border-t border-slate-600">
                        <div class="text-sm text-slate-400">Internal IP</div>
                        <div class="font-mono text-blue-300">${k8sInfo.internalIP}</div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    renderSystem(nodeData) {
        const k8sInfo = nodeData.kubernetesInfo;
        const nodeInfo = k8sInfo?.nodeInfo || {};
        
        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">⚙️</span>
                    <h2 class="text-lg font-medium text-white">System</h2>
                </div>
                <div class="space-y-3">
                    <div class="grid grid-cols-[120px_1fr] gap-2 text-sm">
                        <span class="text-slate-400">Architecture:</span>
                        <span class="text-white font-medium">${nodeInfo.architecture || 'amd64'}</span>
                        
                        <span class="text-slate-400">Kernel:</span>
                        <span class="text-white font-medium">${nodeInfo.kernelVersion || 'N/A'}</span>
                        
                        <span class="text-slate-400">Runtime:</span>
                        <span class="text-white font-medium">${nodeInfo.containerRuntimeVersion || 'N/A'}</span>
                        
                        <span class="text-slate-400">OS:</span>
                        <span class="text-white font-medium">${nodeInfo.osImage || 'linux'}</span>
                        
                        <span class="text-slate-400">Kubelet:</span>
                        <span class="text-white font-medium">${nodeInfo.kubeletVersion || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
    },

    renderStorage(disks) {
        if (!disks || disks.length === 0) {
            return `
                <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                    <div class="flex items-center gap-2 mb-4">
                        <h2 class="text-lg font-medium text-white">Storage Overview</h2>
                    </div>
                    <div class="text-center py-4 text-slate-400">No storage information available</div>
                </div>
            `;
        }

        const totalDisks = disks.length;
        const activeDisks = disks.filter(d => d.isSchedulable).length;
        
        // Calculate total replica count correctly (count entries, not sum bytes)
        const totalReplicas = disks.reduce((sum, disk) => {
            const replicaCount = Object.keys(disk.scheduledReplicas || {}).length;
            return sum + replicaCount;
        }, 0);

        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <h2 class="text-lg font-medium text-white">Storage Overview</h2>
                </div>
                
                <!-- Storage Summary -->
                <div class="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div>
                        <div class="text-2xl font-bold text-blue-400">${totalDisks}</div>
                        <div class="text-sm text-slate-400">Disks</div>
                    </div>
                    <div>
                        <div class="text-2xl font-bold text-green-400">${activeDisks}</div>
                        <div class="text-sm text-slate-400">Active</div>
                    </div>
                    <div>
                        <div class="text-2xl font-bold text-purple-400">${totalReplicas}</div>
                        <div class="text-sm text-slate-400">Replicas</div>
                    </div>
                </div>

                <!-- Disk Details -->
                <div class="space-y-3">
                    ${disks.map(disk => {
                        return this.renderDiskDetail(disk);
                    }).join('')}
                </div>
            </div>
        `;
    },

    renderDiskDetail(disk) {
        // Extract readable disk name from path
        const diskName = this.getDiskDisplayName(disk.path);
        
        // Parse storage information correctly - check both locations
        const usedBytes = this.parseStorageToBytes(disk.storageScheduled || '0');
        const totalBytes = this.parseStorageToBytes(disk.storageMaximum || '0');
        const availableBytes = this.parseStorageToBytes(disk.storageAvailable || '0');
        const usagePercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
        
        // Count actual replicas and get their details
        const replicaEntries = Object.entries(disk.scheduledReplicas || {});
        const replicaCount = replicaEntries.length;
        
        return `
            <div class="border border-slate-600 rounded p-3" data-disk-name="${diskName}">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full ${disk.isSchedulable ? 'bg-green-400' : 'bg-gray-400'}"></span>
                        <span class="text-white font-medium">${diskName}</span>
                        <span class="text-xs text-slate-400">${replicaCount} replicas</span>
                    </div>
                    <span class="text-sm text-slate-300">${this.formatBytes(totalBytes)}</span>
                </div>
                
                <!-- Disk Usage -->
                <div class="mb-3">
                    <div class="flex justify-between text-sm text-slate-400 mb-1">
                        <span>Used: ${this.formatBytes(usedBytes)}</span>
                        <span>Available: ${this.formatBytes(availableBytes)}</span>
                    </div>
                    <div class="flex justify-between text-xs text-slate-500 mb-2">
                        <span>${usagePercent}% used</span>
                        <span>${Math.round((availableBytes / totalBytes) * 100)}% free</span>
                    </div>
                    <div class="w-full bg-slate-600 rounded-full h-2">
                        <div class="bg-blue-500 h-2 rounded-full" style="width: ${Math.min(usagePercent, 100)}%"></div>
                    </div>
                </div>

                <!-- Replicas List -->
                ${replicaCount > 0 ? `
                    <div class="border-t border-slate-600 pt-3">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-slate-300">Replicas (${replicaCount})</span>
                            ${replicaCount > 10 ? `<span class="text-xs text-slate-400">Showing first 10</span>` : ''}
                        </div>
                        <div class="max-h-40 overflow-y-auto space-y-1 replicas-container">
                            ${replicaEntries.slice(0, 10).map(([replicaName, sizeBytes]) => `
                                <div class="flex justify-between items-center py-1 text-xs">
                                    <span class="text-slate-400 font-mono">${replicaName}</span>
                                    <span class="text-slate-300 font-medium ml-2">${this.formatBytes(sizeBytes)}</span>
                                </div>
                            `).join('')}
                            ${replicaCount > 10 ? `
                                <div class="text-center py-1">
                                    <button onclick="DetailRenderer.expandReplicas('${diskName}', '${encodeURIComponent(JSON.stringify(replicaEntries))}')" 
                                            class="text-blue-400 hover:text-blue-300 text-xs">
                                        Show ${replicaCount - 10} more replicas...
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    detectSplitBrain(vmData) {
        if (!vmData.vmiInfo || !vmData.vmiInfo.length) {
            return { hasSplitBrain: false };
        }
        
        const activePods = vmData.vmiInfo[0].activePods || {};
        const podUIDs = Object.keys(activePods);
        
        if (podUIDs.length <= 1) {
            return { hasSplitBrain: false };
        }
        
        // CRITICAL FIX: Check actual pod status to filter out completed/failed pods
        if (vmData.podInfo && Array.isArray(vmData.podInfo)) {
            // Only consider pods that are actually Running or Pending (not Completed/Failed/Succeeded)
            const runningPods = vmData.podInfo.filter(pod => 
                pod.status === 'Running' || pod.status === 'Pending'
            );
            
            if (runningPods.length <= 1) {
                return { hasSplitBrain: false };
            }
            
            // Get nodes for running pods only
            const runningNodes = [...new Set(runningPods.map(pod => pod.nodeId))];
            
            return {
                hasSplitBrain: runningNodes.length > 1,
                totalPods: runningPods.length,
                nodes: runningNodes,
                podsPerNode: runningNodes.map(node => ({
                    node,
                    podCount: runningPods.filter(pod => pod.nodeId === node).length
                }))
            };
        }
        
        // Fallback to original logic if no pod status info available
        const uniqueNodes = [...new Set(Object.values(activePods))];
        return {
            hasSplitBrain: uniqueNodes.length > 1,
            totalPods: podUIDs.length,
            nodes: uniqueNodes,
            podsPerNode: uniqueNodes.map(node => ({
                node,
                podCount: Object.values(activePods).filter(n => n === node).length
            }))
        };
    },
    getDiskDisplayName(diskPath) {
        if (!diskPath) return 'Unknown';
        
        // Extract meaningful name from path
        if (diskPath.includes('/defaultdisk')) {
            return 'defaultdisk';
        } else if (diskPath.includes('/extra-disks/')) {
            const parts = diskPath.split('/');
            const diskId = parts[parts.length - 1];
            // Show first 8 and last 8 characters for readability
            if (diskId.length > 16) {
                return `${diskId.substring(0, 8)}...${diskId.substring(diskId.length - 8)}`;
            }
            return diskId;
        } else {
            return diskPath.split('/').pop() || 'Unknown';
        }
    },

    renderQuickCommands(nodeName) {
        const commands = [
            {
                title: 'View Running Pods',
                command: `kubectl get pods --all-namespaces --field-selector spec.nodeName=${nodeName}`,
                icon: ''
            },
            {
                title: 'List All Replicas on Node',
                command: `kubectl get replicas.longhorn.io -n longhorn-system -l longhornnode=${nodeName}`,
                icon: ''
            },
            {
                title: 'Node Describe',
                command: `kubectl describe node ${nodeName}`,
                icon: ''
            },
            {
                title: 'List Instance Managers on Node',
                command: `kubectl get instancemanager -n longhorn-system -l longhorn.io/node=${nodeName}`,
                icon: ''
            },
            {
                title: 'List All Volumes (check nodeID column)',
                command: `kubectl get volumes.longhorn.io -n longhorn-system -o wide`,
                icon: ''
            },
            {
                title: 'Check Storage Resources by Node',
                command: `echo '=== ENGINES ==='; kubectl get engines.longhorn.io -n longhorn-system -l longhornnode=${nodeName}; echo ''; echo '=== REPLICAS ==='; kubectl get replicas.longhorn.io -n longhorn-system -l longhornnode=${nodeName}; echo ''; echo '=== INSTANCE MANAGERS ==='; kubectl get instancemanager -n longhorn-system -l longhorn.io/node=${nodeName}`,
                icon: ''
            }
        ];

        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">⚡</span>
                    <h2 class="text-lg font-medium text-white">Quick Commands</h2>
                </div>
                <div class="space-y-3">
                    ${commands.map(cmd => `
                        <div class="border border-slate-600 rounded-lg p-3">
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <span>${cmd.icon}</span>
                                    <span class="text-white font-medium">${cmd.title}</span>
                                </div>
                                <button data-copy-text="${cmd.command.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">
                                    Copy
                                </button>
                            </div>
                            <code class="text-xs text-green-300 bg-slate-800 p-2 rounded block overflow-x-auto">${cmd.command}</code>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    // Keep existing utility methods
    getNodeStatusBadge(nodeData) {
        const k8sReady = this.getNodeStatus(nodeData);
        const isSchedulable = !nodeData.kubernetesInfo?.unschedulable;
        
        if (!k8sReady) {
            return 'bg-red-700/80 text-red-200';
        } else if (!isSchedulable) {
            return 'bg-yellow-700/80 text-yellow-200';
        } else {
            return 'bg-green-700/80 text-green-200';
        }
    },

    getNodeStatus(nodeData) {
        
        const k8sReady = nodeData.kubernetesInfo?.conditions?.find(c => c.type === 'Ready')?.status === 'True';
        const isSchedulable = !nodeData.kubernetesInfo?.unschedulable;

        if (!k8sReady) {
            return 'Not Ready';
        } else if (!isSchedulable) {
            return 'Ready, SchedulingDisabled';
        } else {
            return 'Ready';
        }
    },

    parseStorageSize(sizeStr) {
        if (!sizeStr || sizeStr === '0') return 0;
        const numValue = parseFloat(sizeStr);
        return isNaN(numValue) ? 0 : numValue;
    },

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const base = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(base));
        return `${parseFloat((bytes / Math.pow(base, i)).toFixed(1))}${units[i]}`;
    },

    parseMemoryToBytes(memoryStr) {
        if (!memoryStr) return 0;
        const match = memoryStr.match(/^(\d+)(\w+)$/);
        if (!match) return 0;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        const unitMultipliers = {
            'ki': 1024,
            'mi': 1024 * 1024,
            'gi': 1024 * 1024 * 1024,
            'ti': 1024 * 1024 * 1024 * 1024
        };
        
        return value * (unitMultipliers[unit] || 1);
    },

    parseStorageToBytes(storageStr) {
        if (!storageStr) return 0;
        
        // Handle both string and number inputs
        if (typeof storageStr === 'number') {
            return storageStr;
        }
        
        // Handle formatted strings like "5.77 TB", "660.13 GB", etc.
        const match = storageStr.toString().match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
        if (!match) {
            return 0;
        }
        
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        
        const unitMultipliers = {
            'b': 1,
            'kb': 1000,
            'mb': 1000 * 1000,
            'gb': 1000 * 1000 * 1000,
            'tb': 1000 * 1000 * 1000 * 1000,
            'pb': 1000 * 1000 * 1000 * 1000 * 1000,
            'ki': 1024,
            'mi': 1024 * 1024,
            'gi': 1024 * 1024 * 1024,
            'ti': 1024 * 1024 * 1024 * 1024,
            'pi': 1024 * 1024 * 1024 * 1024 * 1024
        };
        
        return value * (unitMultipliers[unit] || 1);
    },

    expandReplicas(diskName, encodedReplicaData) {
        try {
            const replicaEntries = JSON.parse(decodeURIComponent(encodedReplicaData));
            const diskElement = document.querySelector(`[data-disk-name="${diskName}"]`);
            
            if (!diskElement) {
                console.error('Disk element not found for:', diskName);
                return;
            }
            
            // Find the replicas container within this disk
            const replicasContainer = diskElement.querySelector('.replicas-container');
            if (!replicasContainer) {
                return;
            }
            
            // Generate HTML for all replicas
            const allReplicasHtml = replicaEntries.map(([replicaName, sizeBytes]) => `
                <div class="flex justify-between items-center py-1 text-xs">
                    <span class="text-slate-400 font-mono">${replicaName}</span>
                    <span class="text-slate-300 font-medium ml-2">${this.formatBytes(sizeBytes)}</span>
                </div>
            `).join('');
            
            // Replace the container content
            replicasContainer.innerHTML = allReplicasHtml;
            
        } catch (error) {
            console.error('Error expanding replicas:', error);
        }
    },
    
    renderVMDetail(vmData) {
        if (!vmData) {
            return '<div class="text-center py-8 text-slate-400">VM data not available</div>';
        }

        const vmName = vmData.name || 'Unknown VM';
        const status = vmData.printableStatus || 'Unknown';
        const namespace = vmData.namespace || 'default';
        const splitBrainInfo = this.detectSplitBrain(vmData);
        
        return `
            <div class="bg-slate-800 rounded-lg">
                <div class="p-6 border-b border-slate-700">
                    <div class="flex justify-between items-start">
                        <div>
                            <h1 class="text-2xl font-semibold text-white">${vmName}</h1>
                            <div class="flex items-center gap-3 mt-2">
                                <span class="px-3 py-1 text-sm rounded ${this.getVMStatusBadge(status)}">${status}</span>
                                <span class="text-slate-400">Namespace: ${namespace}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- VM Header Info Row -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-600">
                        <div>
                            <div class="text-xs text-slate-400 uppercase tracking-wide">Image</div>
                            <div class="text-sm text-white font-medium">${vmData.imageId || 'N/A'}</div>
                        </div>
                        <div>
                            <div class="text-xs text-slate-400 uppercase tracking-wide">Storage Class</div>
                            <div class="text-sm text-white font-medium">${vmData.storageClass || 'N/A'}</div>
                        </div>
                        <div>
                            <div class="text-xs text-slate-400 uppercase tracking-wide">PVC Status</div>
                            <div class="text-sm">
                                <span class="px-2 py-1 text-xs rounded ${this.getStorageStatusBadge(vmData.pvcStatus)}">${vmData.pvcStatus || 'Unknown'}</span>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs text-slate-400 uppercase tracking-wide">Volume</div>
                            <div class="text-sm text-blue-300 font-mono">${vmData.volumeName || 'N/A'}</div>
                        </div>
                    </div>
                </div>
                ${splitBrainInfo.hasSplitBrain ? `
                    <div class="p-6 border-b border-slate-700">
                        <div class="p-4 bg-red-900/40 border border-red-600/50 rounded-lg">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-red-400 text-xl">⚠️</span>
                                <span class="text-red-300 font-semibold text-lg">CRITICAL: Split-Brain Detected</span>
                            </div>
                            <div class="text-red-200 mb-3">
                                VM has ${splitBrainInfo.totalPods} pods running on ${splitBrainInfo.nodes.length} different nodes simultaneously. This can cause data corruption!
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-${splitBrainInfo.nodes.length} gap-4">
                                ${splitBrainInfo.podsPerNode.map(nodeInfo => `
                                    <div class="bg-red-800/30 rounded p-3 text-center">
                                        <div class="text-red-300 font-mono text-sm">${nodeInfo.node}</div>
                                        <div class="text-red-200 text-xs">${nodeInfo.podCount} pod${nodeInfo.podCount > 1 ? 's' : ''}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${vmData.printableStatus === 'Terminating' && 
                  (!vmData.vmiInfo || vmData.vmiInfo.length === 0) && 
                  (!vmData.podInfo || vmData.podInfo.length === 0) ? `
                    <div class="p-6 border-b border-slate-700">
                        <div class="p-4 bg-yellow-900/40 border border-yellow-600/50 rounded-lg">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-yellow-400 text-xl">⚠️</span>
                                <span class="text-yellow-300 font-semibold text-lg">VM Stuck in Terminating State</span>
                            </div>
                            <div class="text-yellow-200 mb-3">
                                This VM has no active VMI or pods but is stuck terminating. This usually indicates finalizers blocking deletion.
                            </div>
                            <button onclick="ViewManager.showAllIssuesView()" 
                                    class="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition-colors">
                                View Issue Details & Resolution Steps →
                            </button>
                        </div>
                    </div>
                ` : ''}

                <div class="p-6">
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        
                        <!-- Left Column: Compute & Migration -->
                        <div class="space-y-6">
                            ${this.renderComputeResources(vmData)}
                            ${this.renderVMIDetails(vmData)}
                            ${this.renderPodDetails(vmData, splitBrainInfo)}
                            ${this.renderVMErrors(vmData.errors || [])}
                            ${this.renderVolumeAttachment(vmData.attachmentTicketsRaw)}
                            ${this.renderMigration(vmData.vmimInfo || [], vmData.vmiInfo)}
                        </div>

                        <!-- Right Column: Storage & Replicas -->
                        <div class="space-y-6">
                            ${this.renderVMStorage(vmData)}   
                            ${this.renderStorageReplicas(vmData)}
                            ${this.renderVolumeAttachment(vmData.attachmentTicketsRaw)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderCompactVMInfo(vmData) {
        const vmMetrics = this.getCompactVMMetrics(vmData);
        
        return `
            <div class="bg-slate-700 rounded p-3">
                <h3 class="font-medium mb-2">VM Information</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-slate-400">Status:</span>
                        <span class="text-white">${vmData.printableStatus || 'Unknown'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-400">Node:</span>
                        <span class="text-white">${vmMetrics.node}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-400">Phase:</span>
                        <span class="text-white">${vmMetrics.phase}</span>
                    </div>
                    ${vmMetrics.ipAddress ? `
                        <div class="flex justify-between">
                            <span class="text-slate-400">IP:</span>
                            <span class="text-white font-mono text-xs">${vmMetrics.ipAddress}</span>
                        </div>
                    ` : ''}
                    ${vmData.podName ? `
                        <div class="border-t border-slate-600 pt-2 mt-2">
                            <div class="text-slate-400 text-xs mb-1">Pod:</div>
                            <div class="text-white font-mono text-xs break-all">${vmData.podName}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderCompactVMIssues(errors) {
        const realIssues = (errors || []).filter(error => error.severity !== 'info' || error.type !== 'info');
        
        return `
            <div class="bg-slate-700 rounded p-3">
                <h3 class="font-medium mb-2">Health Status</h3>
                ${realIssues.length === 0 ? `
                    <div class="text-green-400 text-sm">✓ No issues detected</div>
                ` : `
                    <div class="space-y-1 max-h-32 overflow-y-auto text-sm">
                        ${realIssues.map(error => `
                            <div class="text-${this.getSeverityColor(error.severity)} text-xs">
                                • ${error.type || 'Issue'}: ${error.message}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    },

    renderCompactVMIInfo(vmData) {
        const vmiInfo = vmData.vmiInfo && vmData.vmiInfo.length > 0 ? vmData.vmiInfo[0] : null;
        
        if (!vmiInfo) {
            return `
                <div class="bg-slate-700 rounded p-3">
                    <h3 class="font-medium mb-2">VMI Details</h3>
                    <div class="text-slate-400 text-sm">VMI information not available</div>
                </div>
            `;
        }

        return `
            <div class="bg-slate-700 rounded p-3">
                <h3 class="font-medium mb-2">VMI Details</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-slate-400">Node Name:</span>
                        <span class="text-white font-mono text-xs">${vmiInfo.nodeName || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-400">Phase:</span>
                        <span class="text-white">${vmiInfo.phase || 'Unknown'}</span>
                    </div>
                    
                    ${vmiInfo.memoryInfo && vmiInfo.memoryInfo.guestCurrent ? `
                        <div class="border-t border-slate-600 pt-2 mt-2">
                            <div class="text-slate-400 text-xs mb-1">Memory:</div>
                            <div class="text-white text-xs">${vmiInfo.memoryInfo.guestCurrent}</div>
                        </div>
                    ` : ''}

                    ${this.renderCompactNetworkInterfaces(vmiInfo.interfaces)}
                </div>
            </div>
        `;
    },

    renderCompactNetworkInterfaces(interfaces) {
        if (!interfaces || interfaces.length === 0) {
            return `
                <div class="border-t border-slate-600 pt-2 mt-2">
                    <div class="text-slate-400 text-xs mb-1">Network Interfaces:</div>
                    <div class="text-slate-500 text-xs">No interfaces available</div>
                </div>
            `;
        }

        return `
            <div class="border-t border-slate-600 pt-2 mt-2">
                <div class="text-slate-400 text-xs mb-1">Network Interfaces:</div>
                <div class="space-y-1 max-h-24 overflow-y-auto">
                    ${interfaces.map(iface => `
                        <div class="flex justify-between text-xs">
                            <span class="text-slate-400">${iface.name || 'Unknown'}:</span>
                            <span class="text-white font-mono">${iface.ipAddress || 'No IP'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    renderCompactStorageInfo(vmData) {
        return `
            <div class="bg-slate-700 rounded p-3">
                <h3 class="font-medium mb-2">Storage</h3>
                <div class="space-y-2 text-sm">
                    ${vmData.storageClass ? `
                        <div class="flex justify-between">
                            <span class="text-slate-400">Class:</span>
                            <span class="text-white text-xs">${vmData.storageClass}</span>
                        </div>
                    ` : ''}
                    ${vmData.pvcStatus ? `
                        <div class="flex justify-between">
                            <span class="text-slate-400">PVC:</span>
                            <span class="text-white text-xs">${vmData.pvcStatus}</span>
                        </div>
                    ` : ''}
                    ${vmData.claimNames ? `
                        <div class="border-t border-slate-600 pt-2 mt-2">
                            <div class="text-slate-400 text-xs mb-1">Claim:</div>
                            <div class="text-white font-mono text-xs break-all">${vmData.claimNames}</div>
                        </div>
                    ` : ''}
                    ${vmData.volumeName ? `
                        <div class="border-t border-slate-600 pt-2 mt-2">
                            <div class="text-slate-400 text-xs mb-1">Volume:</div>
                            <div class="text-white font-mono text-xs break-all">${vmData.volumeName}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderCompactMigration(vmimInfo) {
        // Always show the migration section to help with debugging
        const hasData = vmimInfo && vmimInfo.length > 0;
        
        if (!hasData) {
            return `
                <div class="bg-slate-700 rounded p-3">
                    <h3 class="font-medium mb-2">Migration History</h3>
                    <div class="text-slate-400 text-sm">No migrations found</div>
                    <div class="text-xs text-slate-500 mt-1">
                        This VM has not been migrated between nodes
                    </div>
                </div>
            `;
        }

        // Show comprehensive migration information
        return `
            <div class="bg-slate-700 rounded p-3">
                <h3 class="font-medium mb-2">Migration History (${vmimInfo.length})</h3>
                <div class="space-y-3 max-h-64 overflow-y-auto">
                    ${vmimInfo.map((migration, index) => this.renderMigrationItem(migration, index, vmimInfo.length)).join('')}
                </div>
            </div>
        `;
    },

    renderMigrationItem(migration, index, total) {
        const isLatest = index === total - 1;
        const isActive = ['Running', 'Scheduling', 'Scheduled', 'PreparingTarget', 'TargetReady'].includes(migration.phase);
        const isCompleted = migration.phase === 'Succeeded';
        const isFailed = migration.phase === 'Failed';
        
        // Get status styling
        let statusBadge = 'bg-slate-600 text-slate-200';
        if (isActive) statusBadge = 'bg-yellow-700 text-yellow-200';
        else if (isCompleted) statusBadge = 'bg-green-700 text-green-200';
        else if (isFailed) statusBadge = 'bg-red-700 text-red-200';

        return `
            <div class="border border-slate-600 rounded p-2 ${isLatest ? 'border-blue-500/50 bg-blue-900/10' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 text-xs rounded ${statusBadge}">
                            ${migration.phase}
                        </span>
                        ${isActive ? '<span class="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>' : ''}
                        ${isLatest ? '<span class="text-xs text-blue-400">(Latest)</span>' : ''}
                    </div>
                    <span class="text-xs text-slate-400">#${total - index}</span>
                </div>

                <!-- Migration details grid -->
                <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    ${migration.sourceNode ? `
                        <span class="text-slate-400">From:</span>
                        <span class="text-white font-mono">${migration.sourceNode}</span>
                    ` : ''}
                    
                    ${migration.targetNode ? `
                        <span class="text-slate-400">To:</span>
                        <span class="text-white font-mono">${migration.targetNode}</span>
                    ` : ''}

                    ${migration.sourcePod ? `
                        <span class="text-slate-400">Source Pod:</span>
                        <span class="text-white font-mono text-xs break-all">${migration.sourcePod}</span>
                    ` : ''}

                    ${migration.targetPod ? `
                        <span class="text-slate-400">Target Pod:</span>
                        <span class="text-white font-mono text-xs break-all ${!migration.targetPodExists ? 'text-red-400' : ''}">${migration.targetPod}</span>
                    ` : ''}

                    ${migration.creationTimestamp ? `
                        <span class="text-slate-400">Created:</span>
                        <span class="text-white">${this.formatTimestamp(migration.creationTimestamp)}</span>
                    ` : ''}

                    ${migration.startTimestamp ? `
                        <span class="text-slate-400">Started:</span>
                        <span class="text-white">${this.formatTimestamp(migration.startTimestamp)}</span>
                    ` : ''}

                    ${migration.endTimestamp ? `
                        <span class="text-slate-400">Completed:</span>
                        <span class="text-white">${this.formatTimestamp(migration.endTimestamp)}</span>
                    ` : ''}
                </div>

                <!-- Warning indicators -->
                ${migration.targetPod && !migration.targetPodExists ? `
                    <div class="mt-2 p-2 bg-yellow-900/30 border border-yellow-700/30 rounded text-xs">
                        <span class="text-yellow-300">Target pod missing or not ready</span>
                    </div>
                ` : ''}

                ${migration.conditions && migration.conditions.length > 0 ? `
                    <div class="mt-2">
                        <div class="text-slate-400 text-xs mb-1">Conditions:</div>
                        ${migration.conditions.map(condition => `
                            <div class="text-xs ${condition.status === 'True' ? 'text-green-400' : 'text-red-400'}">
                                • ${condition.type}: ${condition.status}
                                ${condition.reason ? ` (${condition.reason})` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <!-- Migration method if available -->
                ${migration.method ? `
                    <div class="mt-2 text-xs">
                        <span class="text-slate-400">Method:</span>
                        <span class="text-white">${migration.method}</span>
                    </div>
                ` : ''}
            </div>
        `;
    },

    formatTimestamp(timestamp) {
        if (!timestamp) return 'N/A';
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch (e) {
            return timestamp;
        }
    },

    renderCompactReplicas(vmData) {
        if (!vmData.replicaInfo || vmData.replicaInfo.length === 0) {
            return '';
        }

        return `
            <div class="bg-slate-700 rounded p-3">
                <h3 class="font-medium mb-2">Replicas (${vmData.replicaInfo.length})</h3>
                <div class="space-y-2 max-h-40 overflow-y-auto text-sm">
                    ${vmData.replicaInfo.map(replica => `
                        <div class="flex justify-between items-center text-xs">
                            <div>
                                <div class="text-white">${replica.nodeId}</div>
                                <div class="text-slate-400">${replica.storageIP}:${replica.port}</div>
                            </div>
                            <span class="px-1 py-0.5 rounded text-xs ${replica.active ? 'bg-green-700 text-green-200' : 'bg-slate-600 text-slate-300'}">
                                ${replica.currentState}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    // Utility methods
    getCompactVMMetrics(vm) {
        let node = 'N/A';
        let phase = 'Unknown';
        let ipAddress = null;

        if (vm.vmiInfo && vm.vmiInfo.length > 0) {
            const vmi = vm.vmiInfo[0];
            node = vmi.nodeName || node;
            phase = vmi.phase || phase;
            
            if (vmi.interfaces && vmi.interfaces.length > 0) {
                const goodInterface = vmi.interfaces.find(iface => 
                    iface.ipAddress && 
                    iface.ipAddress !== '127.0.0.1' &&
                    !iface.interfaceName?.match(/(^lo|^lxc|cilium|flannel)/i)
                );
                if (goodInterface) {
                    ipAddress = goodInterface.ipAddress;
                }
            }
        }

        if (node === 'N/A' && vm.podInfo && vm.podInfo.length > 0) {
            node = vm.podInfo[0].nodeId || vm.podInfo[0].nodeName || node;
        }

        return { node, phase, ipAddress };
    },

    getSeverityColor(severity) {
        const colorMap = {
            'error': 'red-400',
            'critical': 'red-400',
            'warning': 'yellow-400',
            'info': 'blue-400'
        };
        return colorMap[severity] || 'yellow-400';
    },

    getVMStatusBadge(status) {
        const statusMap = {
            'running': 'bg-green-700 text-green-200',
            'stopped': 'bg-slate-600 text-slate-300',
            'starting': 'bg-yellow-700 text-yellow-200',
            'stopping': 'bg-orange-700 text-orange-200',
            'error': 'bg-red-700 text-red-200',
            'failed': 'bg-red-700 text-red-200',
            'paused': 'bg-blue-700 text-blue-200'
        };
        return statusMap[status?.toLowerCase()] || 'bg-slate-600 text-slate-300';
    },

    parseStorageSize(sizeStr) {
        if (!sizeStr || sizeStr === '0') return 0;
        const numValue = parseFloat(sizeStr);
        return isNaN(numValue) ? 0 : numValue;
    },

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const base = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(base));
        return `${parseFloat((bytes / Math.pow(base, i)).toFixed(1))}${units[i]}`;
    },

    parseMemoryToBytes(memoryStr) {
        if (!memoryStr) return 0;
        const match = memoryStr.match(/^(\d+)(\w+)$/);
        if (!match) return 0;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        const unitMultipliers = {
            'ki': 1024,
            'mi': 1024 * 1024,
            'gi': 1024 * 1024 * 1024,
            'ti': 1024 * 1024 * 1024 * 1024
        };
        
        return value * (unitMultipliers[unit] || 1);
    },

    renderVolumeAttachment(attachmentData) {
        if (!attachmentData || typeof attachmentData !== 'object') {
            return `
                <div class="p-4 bg-slate-800/30 rounded-lg">
                    <h4 class="font-medium text-slate-200 mb-4 flex items-center gap-2">
                        <span>🔗</span> Volume Attachment Status
                    </h4>
                    <div class="text-center py-4 text-slate-400">No attachment information available</div>
                </div>
            `;
        }

        const ticketIds = Object.keys(attachmentData);
        
        if (ticketIds.length === 0) {
            return `
                <div class="p-4 bg-slate-800/30 rounded-lg">
                    <h4 class="font-medium text-slate-200 mb-4 flex items-center gap-2">
                        <span>🔗</span> Volume Attachment Status
                    </h4>
                    <div class="text-center py-4 text-slate-400">No attachment tickets found</div>
                </div>
            `;
        }

        // Generate ticket HTML
        const ticketHTML = ticketIds.map(ticketId => {
            const statusTicket = attachmentData[ticketId];
            const satisfied = statusTicket?.satisfied || false;
            const conditions = statusTicket?.conditions || [];
            const generation = statusTicket?.generation || 0;
            const shortTicketId = ticketId.length > 20 ? ticketId.substring(0, 20) + '...' : ticketId;
            
            const conditionsHTML = conditions.map(condition => {
                const conditionSatisfied = condition.status === 'True';
                const conditionType = condition.type || 'Unknown';
                let formattedTime = 'Unknown';
                
                if (condition.lastTransitionTime) {
                    try {
                        const date = new Date(condition.lastTransitionTime);
                        formattedTime = date.toLocaleDateString() + ', ' + date.toLocaleTimeString();
                    } catch (e) {
                        formattedTime = condition.lastTransitionTime;
                    }
                }
                
                return `
                    <div class="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${conditionSatisfied ? 'bg-green-500' : 'bg-red-500'}"></span>
                            <span class="text-sm text-slate-200">${conditionType}</span>
                        </div>
                        <div class="text-right">
                            <div class="text-xs ${conditionSatisfied ? 'text-green-400' : 'text-red-400'} font-medium">
                                ${conditionSatisfied ? 'True' : 'False'}
                            </div>
                            <div class="text-xs text-slate-400">${formattedTime}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="bg-slate-800/40 rounded p-3 border ${satisfied ? 'border-green-500/30' : 'border-red-500/30'}">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="${satisfied ? 'text-green-400' : 'text-red-400'}">${satisfied ? '[OK]' : '[WAIT]'}</span>
                            <span class="text-sm text-slate-200">Ticket ${shortTicketId}</span>
                        </div>
                        <span class="px-2 py-1 text-xs rounded ${satisfied ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                            ${satisfied ? 'SATISFIED' : 'PENDING'}
                        </span>
                    </div>
                    <div class="text-xs text-slate-400 mb-2">ID: <code class="bg-slate-800 px-1 rounded">${ticketId}</code></div>
                    ${conditions.length > 0 ? `<div class="space-y-1">${conditionsHTML}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="p-4 bg-slate-800/30 rounded-lg">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="font-medium text-slate-200 flex items-center gap-2">
                        <span>🔗</span> Volume Attachment Status
                    </h4>
                    <span class="text-sm text-slate-400">${ticketIds.length} tickets</span>
                </div>
                <div class="space-y-3">${ticketHTML}</div>
            </div>
        `;
    },

    getStorageStatusBadge(status) {
        const statusMap = {
            'Bound': 'bg-green-700/80 text-green-200',
            'Pending': 'bg-yellow-700/80 text-yellow-200',
            'Lost': 'bg-red-700/80 text-red-200'
        };
        return statusMap[status] || 'bg-slate-600/80 text-slate-200';
    },

    getStatusBadgeClass(status) {
        const statusMap = {
            'Running': 'bg-green-700/80 text-green-200',
            'Pending': 'bg-yellow-700/80 text-yellow-200',
            'Failed': 'bg-red-700/80 text-red-200',
            'Succeeded': 'bg-green-700/80 text-green-200'
        };
        return statusMap[status] || 'bg-slate-600/80 text-slate-200';
    },

    parseStorageToBytes(storageStr) {
        if (!storageStr) return 0;
        
        // Handle both string and number inputs
        if (typeof storageStr === 'number') {
            return storageStr;
        }
        
        // Handle formatted strings like "5.77 TB", "660.13 GB", etc.
        const match = storageStr.toString().match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
        if (!match) {
            return 0;
        }
        
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        
        const unitMultipliers = {
            'b': 1,
            'kb': 1000,
            'mb': 1000 * 1000,
            'gb': 1000 * 1000 * 1000,
            'tb': 1000 * 1000 * 1000 * 1000,
            'pb': 1000 * 1000 * 1000 * 1000 * 1000,
            'ki': 1024,
            'mi': 1024 * 1024,
            'gi': 1024 * 1024 * 1024,
            'ti': 1024 * 1024 * 1024 * 1024,
            'pi': 1024 * 1024 * 1024 * 1024 * 1024
        };
        
        return value * (unitMultipliers[unit] || 1);
    },

    renderVolumeAttachment(attachmentData) {
        if (!attachmentData || typeof attachmentData !== 'object') {
            return `
                <div class="p-4 bg-slate-800/30 rounded-lg">
                    <h4 class="font-medium text-slate-200 mb-4 flex items-center gap-2">
                        <span>🔗</span> Volume Attachment Status
                    </h4>
                    <div class="text-center py-4 text-slate-400">No attachment information available</div>
                </div>
            `;
        }

        const ticketIds = Object.keys(attachmentData);
        
        if (ticketIds.length === 0) {
            return `
                <div class="p-4 bg-slate-800/30 rounded-lg">
                    <h4 class="font-medium text-slate-200 mb-4 flex items-center gap-2">
                        <span>🔗</span> Volume Attachment Status
                    </h4>
                    <div class="text-center py-4 text-slate-400">No attachment tickets found</div>
                </div>
            `;
        }

        // Generate ticket HTML
        const ticketHTML = ticketIds.map(ticketId => {
            const statusTicket = attachmentData[ticketId];
            const satisfied = statusTicket?.satisfied || false;
            const conditions = statusTicket?.conditions || [];
            const generation = statusTicket?.generation || 0;
            const shortTicketId = ticketId.length > 20 ? ticketId.substring(0, 20) + '...' : ticketId;
            
            const conditionsHTML = conditions.map(condition => {
                const conditionSatisfied = condition.status === 'True';
                const conditionType = condition.type || 'Unknown';
                let formattedTime = 'Unknown';
                
                if (condition.lastTransitionTime) {
                    try {
                        const date = new Date(condition.lastTransitionTime);
                        formattedTime = date.toLocaleDateString() + ', ' + date.toLocaleTimeString();
                    } catch (e) {
                        formattedTime = condition.lastTransitionTime;
                    }
                }
                
                return `
                    <div class="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${conditionSatisfied ? 'bg-green-500' : 'bg-red-500'}"></span>
                            <span class="text-sm text-slate-200">${conditionType}</span>
                        </div>
                        <div class="text-right">
                            <div class="text-xs ${conditionSatisfied ? 'text-green-400' : 'text-red-400'} font-medium">
                                ${conditionSatisfied ? 'True' : 'False'}
                            </div>
                            <div class="text-xs text-slate-400">${formattedTime}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="bg-slate-800/40 rounded p-3 border ${satisfied ? 'border-green-500/30' : 'border-red-500/30'}">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="${satisfied ? 'text-green-400' : 'text-red-400'}">${satisfied ? 'OK' : 'WAIT'}</span>
                            <span class="text-sm text-slate-200">Ticket ${shortTicketId}</span>
                        </div>
                        <span class="px-2 py-1 text-xs rounded ${satisfied ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                            ${satisfied ? 'SATISFIED' : 'PENDING'}
                        </span>
                    </div>
                    <div class="text-xs text-slate-400 mb-2">ID: <code class="bg-slate-800 px-1 rounded">${ticketId}</code></div>
                    ${conditions.length > 0 ? `<div class="space-y-1">${conditionsHTML}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="p-4 bg-slate-800/30 rounded-lg">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="font-medium text-slate-200 flex items-center gap-2">
                        <span>🔗</span> Volume Attachment Status
                    </h4>
                    <span class="text-sm text-slate-400">${ticketIds.length} tickets</span>
                </div>
                <div class="space-y-3">${ticketHTML}</div>
            </div>
        `;
    },

    renderComputeResources(vmData) {
        const vmiInfo = vmData.vmiInfo && vmData.vmiInfo.length > 0 ? vmData.vmiInfo[0] : null;
        
        // Extract CPU and Memory logic (same as before)
        let cpuCores = 'N/A';
        let memory = 'N/A';
        
        if (vmiInfo) {
            memory = (vmiInfo.memoryInfo && vmiInfo.memoryInfo.guestCurrent) ||
                    (vmiInfo.memoryInfo && vmiInfo.memoryInfo.guestRequested) ||
                    (vmiInfo.memoryInfo && vmiInfo.memoryInfo.guestAtBoot) || 'N/A';
            
            const coresFromCurrentTopology = vmiInfo.currentCPUTopology && vmiInfo.currentCPUTopology.cores;
            const coresFromDomain = vmiInfo.cpuDomain && vmiInfo.cpuDomain.cores;
            
            if (coresFromCurrentTopology) {
                cpuCores = `${coresFromCurrentTopology} cores`;
            } else if (coresFromDomain) {
                cpuCores = `${coresFromDomain} cores`;
            }
        }
        
        const vmiPhase = vmiInfo && vmiInfo.phase ? vmiInfo.phase : vmData.phase || 'N/A';
        const nodeName = vmiInfo && vmiInfo.nodeName || vmData.nodeName || 'N/A';
        
        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">💻</span>
                    <h2 class="text-lg font-medium text-white">Compute Resources</h2>
                </div>
                
                <!-- Resource Cards -->
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-slate-800/60 rounded p-3 text-center">
                        <div class="text-xl font-bold text-blue-400">${cpuCores}</div>
                        <div class="text-xs text-slate-400">CPU</div>
                    </div>
                    <div class="bg-slate-800/60 rounded p-3 text-center">
                        <div class="text-xl font-bold text-green-400">${memory}</div>
                        <div class="text-xs text-slate-400">Memory</div>
                    </div>
                </div>

                <!-- Instance Status -->
                <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <span class="text-slate-400">Phase:</span>
                    <span class="px-2 py-1 rounded text-xs ${vmiPhase === 'Running' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">${vmiPhase}</span>
                    
                    <span class="text-slate-400">Node:</span>
                    <span class="text-slate-200 font-mono">${nodeName}</span>
                </div>
            </div>
        `;
    },

    renderVMIDetails(vmData) {
        const vmiInfo = vmData.vmiInfo && vmData.vmiInfo.length > 0 ? vmData.vmiInfo[0] : null;
        
        if (!vmiInfo) {
            return `
                <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-lg">🖥️</span>
                        <h2 class="text-lg font-medium text-white">VMI Information</h2>
                    </div>
                    <div class="text-center py-4 text-slate-400">No VMI information available</div>
                </div>
            `;
        }

        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">🖥️</span>
                    <h2 class="text-lg font-medium text-white">VMI Information</h2>
                </div>
                
                <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <span class="text-slate-400">VMI Name:</span>
                    <span class="text-white font-mono">${vmiInfo.name || vmData.name}</span>
                    
                    <span class="text-slate-400">Phase:</span>
                    <span class="px-2 py-1 rounded text-xs ${vmiInfo.phase === 'Running' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">${vmiInfo.phase || 'Unknown'}</span>
                    
                    <span class="text-slate-400">Node:</span>
                    <span class="text-slate-200 font-mono">${vmiInfo.nodeName || 'N/A'}</span>
                    
                    ${vmiInfo.guestOSInfo && vmiInfo.guestOSInfo.prettyName ? `
                        <span class="text-slate-400">Guest OS:</span>
                        <span class="text-slate-200">${vmiInfo.guestOSInfo.prettyName}</span>
                    ` : ''}
                    
                    ${vmiInfo.interfaces && vmiInfo.interfaces.length > 0 ? `
                        <span class="text-slate-400">IP Address:</span>
                        <span class="text-slate-200 font-mono">${vmiInfo.interfaces.find(i => i.ipAddress)?.ipAddress || 'N/A'}</span>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderPodDetails(vmData, splitBrainInfo) {
        const vmiInfo = vmData.vmiInfo && vmData.vmiInfo.length > 0 ? vmData.vmiInfo[0] : null;
        const podInfo = vmData.podInfo && vmData.podInfo.length > 0 ? vmData.podInfo[0] : null;
        
        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">🔗</span>
                    <h2 class="text-lg font-medium text-white">Pod Information</h2>
                    ${splitBrainInfo.hasSplitBrain ? `
                        <span class="px-2 py-1 text-xs bg-red-600/80 text-red-200 rounded font-medium">
                            SPLIT-BRAIN
                        </span>
                    ` : ''}
                </div>
                
                ${vmiInfo && vmiInfo.activePods && Object.keys(vmiInfo.activePods).length > 0 ? `
                    <div class="space-y-2">
                        <div class="text-sm text-slate-400 mb-2">
                            Active Pods: ${Object.keys(vmiInfo.activePods).length}
                            ${splitBrainInfo.hasSplitBrain ? ' ⚠️' : ''}
                        </div>
                        ${Object.entries(vmiInfo.activePods).map(([podUID, nodeName]) => {
                            // Get actual pod name or fall back to generated name
                            const podName = vmiInfo.activePodNames && vmiInfo.activePodNames[podUID] 
                                ? vmiInfo.activePodNames[podUID]
                                : `virt-launcher-${vmData.name}-${podUID.substring(0, 5)}`;
                            
                            // Find pod status from podInfo by matching node or by VM name
                            let podStatus = 'Unknown';
                            if (vmData.podInfo) {
                                // Try to find by node first
                                let podInfo = vmData.podInfo.find(pod => pod.nodeId === nodeName);
                                
                                // If not found by node, try to match by VM name
                                if (!podInfo) {
                                    podInfo = vmData.podInfo.find(pod => pod.vmi === vmData.name);
                                }
                                
                                podStatus = podInfo?.status || 'Unknown';
                            }
                            
                            // Get status badge styling
                            const getStatusBadge = (status) => {
                                const statusMap = {
                                    'running': 'bg-green-600/80 text-green-100',
                                    'pending': 'bg-yellow-600/80 text-yellow-100',
                                    'succeeded': 'bg-blue-600/80 text-blue-100',
                                    'completed': 'bg-blue-600/80 text-blue-100',
                                    'failed': 'bg-red-600/80 text-red-100',
                                    'error': 'bg-red-600/80 text-red-100',
                                    'unknown': 'bg-slate-600/80 text-slate-300'
                                };
                                return statusMap[status?.toLowerCase()] || 'bg-slate-600/80 text-slate-200';
                            };
                            
                            return `
                                <div class="border border-slate-600 rounded p-2 ${splitBrainInfo.hasSplitBrain ? 'border-red-500/30 bg-red-900/10' : ''}">
                                    <div class="space-y-2">
                                        <div class="flex justify-between items-center text-sm">
                                            <span class="text-purple-300 font-mono text-xs">${podName}</span>
                                            <span class="text-slate-200 font-mono">${nodeName}</span>
                                        </div>
                                        <div class="flex justify-between items-center">
                                            <div class="text-xs text-slate-400">
                                                UID: ${podUID.substring(0, 8)}...${podUID.substring(podUID.length - 8)}
                                            </div>
                                            <span class="px-2 py-1 text-xs font-medium rounded ${getStatusBadge(podStatus)}">
                                                ${podStatus}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : `
                    <div class="text-center py-4 text-slate-400">No pod information available</div>
                `}
            </div>
        `;
    },
 
    renderMigration(vmimInfo, vmiInfo) {
        const migration = vmimInfo && vmimInfo.length > 0 ? vmimInfo[0] : null;
        
        if (!migration) {
            return `
                <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-lg">🔄</span>
                        <h2 class="text-lg font-medium text-white">Migration</h2>
                    </div>
                    <div class="text-center py-4 text-slate-400">No active migrations</div>
                </div>
            `;
        }

        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">🔄</span>
                    <h2 class="text-lg font-medium text-white">Migration</h2>
                    <span class="px-2 py-1 text-xs rounded ${migration.phase === 'Running' ? 'bg-yellow-600/80 text-yellow-200' : 'bg-slate-600/80 text-slate-200'}">${migration.phase}</span>
                </div>
                
                <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <span class="text-slate-400">Source:</span>
                    <span class="text-blue-300 font-mono">${migration.sourceNode || 'N/A'}</span>
                    
                    <span class="text-slate-400">Target:</span>
                    <span class="text-green-300 font-mono">${migration.targetNode || 'N/A'}</span>
                    
                    ${migration.startTimestamp ? `
                        <span class="text-slate-400">Started:</span>
                        <span class="text-slate-300 text-xs">${new Date(migration.startTimestamp).toLocaleString()}</span>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderVMErrors(errors) {
        if (!errors || errors.length === 0) {
            return '';
        }

        return `
            <div class="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-lg">[WARNING]</span>
                    <h2 class="text-lg font-medium text-white">Issues (${errors.length})</h2>
                </div>
                <div class="space-y-2">
                    ${errors.map(error => `
                        <div class="border border-red-600/50 rounded p-3">
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-red-300 font-medium text-sm">${error.type}</span>
                                <span class="px-2 py-1 text-xs rounded bg-red-700/80 text-red-200">${error.severity}</span>
                            </div>
                            <div class="text-sm text-slate-300">${error.message}</div>
                            <div class="text-xs text-slate-400 mt-1">Resource: ${error.resource}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    renderVMStorage(vmData) {
        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <h2 class="text-lg font-medium text-white">Storage</h2>
                </div>
                
                <div class="space-y-4">
                    <!-- Storage Summary -->
                    <div class="grid grid-cols-2 gap-4">
                        <div class="text-center">
                            <div class="text-lg font-bold text-blue-400">${vmData.storageClass || 'N/A'}</div>
                            <div class="text-xs text-slate-400">Storage Class</div>
                        </div>
                        <div class="text-center">
                            <div class="text-lg font-bold ${vmData.pvcStatus === 'Bound' ? 'text-green-400' : 'text-yellow-400'}">${vmData.pvcStatus || 'Unknown'}</div>
                            <div class="text-xs text-slate-400">PVC Status</div>
                        </div>
                    </div>

                    <!-- Volume Details -->
                    ${vmData.volumeName ? `
                        <div class="border border-slate-600 rounded p-3">
                            <div class="text-sm font-medium text-white mb-2">Volume Details</div>
                            <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                                <span class="text-slate-400">Volume:</span>
                                <div class="flex items-center gap-2">
                                    <code class="text-blue-300 bg-slate-700/80 px-2 py-1 rounded font-mono text-xs break-all">${vmData.volumeName}</code>
                                    <button onclick="navigator.clipboard.writeText('${vmData.volumeName}'); this.textContent='[COPIED]'; setTimeout(() => this.textContent='Copy', 1500)" 
                                            class="text-slate-400 hover:text-white transition-colors" title="Copy volume name">Copy</button>
                                </div>
                                
                                <span class="text-slate-400">Claim:</span>
                                <div class="flex items-center gap-2">
                                    <code class="text-green-300 bg-slate-700/80 px-2 py-1 rounded font-mono text-xs break-all">${vmData.claimNames || 'N/A'}</code>
                                    ${vmData.claimNames ? `<button onclick="navigator.clipboard.writeText('${vmData.claimNames}'); this.textContent='[COPIED]'; setTimeout(() => this.textContent='Copy', 1500)" 
                                            class="text-slate-400 hover:text-white transition-colors" title="Copy claim name">Copy</button>` : ''}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderStorageReplicas(vmData) {
        const replicas = vmData.replicaInfo || [];
        
        if (replicas.length === 0) {
            return `
                <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                    <div class="flex items-center gap-2 mb-4">
                        <h2 class="text-lg font-medium text-white">Storage Replicas (0)</h2>
                    </div>
                    <div class="text-center py-4 text-slate-400">No replica information available</div>
                </div>
            `;
        }

        const runningReplicas = replicas.filter(r => r.currentState === 'running').length;

        return `
            <div class="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">  
                    <h2 class="text-lg font-medium text-white">Storage Replicas (${replicas.length})</h2>
                </div>
                
                <!-- Replica Summary -->
                <div class="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div>
                        <div class="text-lg font-bold text-blue-400">${replicas.length}</div>
                        <div class="text-xs text-slate-400">Total</div>
                    </div>
                    <div>
                        <div class="text-lg font-bold text-green-400">${runningReplicas}</div>
                        <div class="text-xs text-slate-400">Running</div>
                    </div>
                    <div>
                        <div class="text-lg font-bold text-yellow-400">${replicas.filter(r => r.active).length}</div>
                        <div class="text-xs text-slate-400">Active</div>
                    </div>
                </div>

                <!-- Replica Details -->
                <div class="space-y-2">
                    ${replicas.map(replica => `
                        <div class="border border-slate-600 rounded p-3">
                            <div class="flex justify-between items-start mb-2">
                                <div class="flex items-center gap-2">
                                    <span class="w-2 h-2 rounded-full ${replica.currentState === 'running' ? 'bg-green-400' : 'bg-gray-400'}"></span>
                                    <span class="text-white font-medium text-sm">${replica.name}</span>
                                </div>
                                <span class="px-2 py-1 text-xs rounded ${replica.currentState === 'running' ? 'bg-green-700/80 text-green-200' : 'bg-slate-600/80 text-slate-200'}">${replica.currentState}</span>
                            </div>
                            <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                                <span class="text-slate-400">Node:</span>
                                <span class="text-blue-300 font-mono">${replica.nodeId}</span>
                                
                                <span class="text-slate-400">Started:</span>
                                <span class="text-slate-300">${replica.started ? 'Yes' : 'No'}</span>
                                
                                <span class="text-slate-400">Active:</span>
                                <span class="text-slate-300">${replica.active ? 'Yes' : 'No'}</span>
                                
                                ${replica.storageIP ? `
                                    <span class="text-slate-400">Storage IP:</span>
                                    <span class="text-green-300 font-mono">${replica.storageIP}:${replica.port || 'N/A'}</span>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    expandReplicas(diskName, encodedReplicaData) {
        try {
            const replicaEntries = JSON.parse(decodeURIComponent(encodedReplicaData));
            const diskElement = document.querySelector(`[data-disk-name="${diskName}"]`);
            
            if (!diskElement) {
                console.error('Disk element not found for:', diskName);
                return;
            }
            
            // Find the replicas container within this disk
            const replicasContainer = diskElement.querySelector('.replicas-container');
            if (!replicasContainer) {
                return;
            }
            
            // Generate HTML for all replicas
            const allReplicasHtml = replicaEntries.map(([replicaName, sizeBytes]) => `
                <div class="flex justify-between items-center py-1 text-xs">
                    <span class="text-slate-400 font-mono">${replicaName}</span>
                    <span class="text-slate-300 font-medium ml-2">${this.formatBytes(sizeBytes)}</span>
                </div>
            `).join('');
            
            // Replace the container content
            replicasContainer.innerHTML = allReplicasHtml;
            
        } catch (error) {
            console.error('Error expanding replicas:', error);
        }
    },
};
