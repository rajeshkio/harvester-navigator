// Detail view rendering
const DetailRenderer = {
    renderNodeDetail(nodeData, issues) {
        const nodeName = nodeData.longhornInfo ? nodeData.longhornInfo.name : (nodeData.name || 'Unknown');
        const longhornConditions = nodeData.longhornInfo ? nodeData.longhornInfo.conditions : (nodeData.conditions || []);
        const longhornDisks = nodeData.longhornInfo ? nodeData.longhornInfo.disks : (nodeData.disks || []);
        
        const longhornReadyCondition = longhornConditions.find(c => c.type === 'Ready');
        const k8sReadyCondition = nodeData.kubernetesInfo ? 
            (nodeData.kubernetesInfo.conditions || []).find(c => c.type === 'Ready') : null;
        
        const isReady = (longhornReadyCondition && longhornReadyCondition.status === 'True') ||
                       (k8sReadyCondition && k8sReadyCondition.status === 'True');

        const healthSummary = this.analyzeNodeHealth(nodeData);
        
        let resourceStatsHTML = this.renderResourceStats(nodeData);
        let healthStatusHTML = this.renderHealthStatus(nodeData, healthSummary);
        let storageOverviewHTML = this.renderStorageOverview(longhornDisks);
        let troubleshootingHTML = this.renderTroubleshootingActions(nodeData, healthSummary);
        let systemDetailsHTML = this.renderSystemDetails(nodeData);

        return `
            <div class="card p-4 fade-in max-w-7xl mx-auto">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-slate-100 mb-1">${nodeName}</h3>
                        <div class="flex items-center gap-3">
                            <span class="px-2 py-1 text-sm rounded-full ${isReady ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} font-medium">
                                ${isReady ? '● Ready' : '● Not Ready'}
                            </span>
                            ${this.renderHealthBadges(healthSummary)}
                        </div>
                    </div>
                    <div class="text-right text-sm">
                        <div class="text-xs text-slate-400 mb-1">Last Updated</div>
                        <div class="text-slate-200">${new Date().toLocaleString()}</div>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div class="lg:col-span-3 space-y-4">
                        ${healthStatusHTML}
                        ${storageOverviewHTML}
                    </div>
                    
                    <div class="space-y-4">
                        ${resourceStatsHTML}
                        ${systemDetailsHTML}
                        ${troubleshootingHTML}
                    </div>
                </div>
            </div>
        `;
    },
    
    renderVMDetail(vmData) {
        return `
            <div class="card p-4 fade-in">
                <h3 class="font-bold text-xl mb-4 text-slate-100">${vmData.name} <span class="text-base ${Utils.getStatusColorClass(vmData.printableStatus)} font-medium">(${vmData.printableStatus})</span></h3>
                
                ${vmData.errors && vmData.errors.length > 0 ? this.createStorageBackendSection(vmData.errors) : ''}
                ${vmData.errors && vmData.errors.length > 0 ? this.createErrorSection(vmData.errors) : ''}
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div class="bg-slate-800/30 p-3 rounded-md">
                        <h4 class="section-header">Virtual Machine</h4>
                        <div class="compact-row"><span class="data-label">Namespace:</span><span class="data-value">${vmData.namespace || 'N/A'}</span></div>
                        <div class="compact-row"><span class="data-label">Image:</span><span class="data-value">${vmData.imageId || 'N/A'}</span></div>
                        <div class="compact-row"><span class="data-label">Storage Class:</span><span class="data-value">${vmData.storageClass || 'N/A'}</span></div>
                    </div>

                    ${vmData.podInfo && vmData.podInfo.length > 0 ? `
                    <div class="bg-slate-800/30 p-3 rounded-md">
                        <h4 class="section-header">Pod</h4>
                        <div class="compact-row"><span class="data-label">Name:</span><span class="data-value">${vmData.podName || 'N/A'}</span></div>
                        <div class="compact-row"><span class="data-label">Node:</span><span class="data-value">${vmData.podInfo[0].nodeId || 'N/A'}</span></div>
                        <div class="compact-row"><span class="data-label">Status:</span><span class="data-value ${Utils.getStatusColorClass(vmData.podInfo[0].status)}">${vmData.podInfo[0].status || 'N/A'}</span></div>
                    </div>
                    ` : ''}

                    ${vmData.vmiInfo && vmData.vmiInfo.length > 0 ? this.createCompactVMICard(vmData.vmiInfo[0]) : ''}

                    <div class="bg-slate-800/30 p-3 rounded-md">
                        <h4 class="section-header">Storage</h4>
                        <div class="compact-row"><span class="data-label">PVC:</span><span class="data-value">${vmData.claimNames || 'N/A'}</span></div>
                        <div class="compact-row"><span class="data-label">Volume:</span><span class="data-value">${vmData.volumeName || 'N/A'}</span></div>
                        <div class="compact-row"><span class="data-label">Status:</span><span class="data-value ${Utils.getStatusColorClass(vmData.pvcStatus)}">${vmData.pvcStatus || 'N/A'}</span></div>
                    </div>
                </div>

                ${vmData.volumeName && vmData.replicaInfo && vmData.replicaInfo.length > 0 ? this.createCompactReplicaSection(vmData.replicaInfo) : ''}
            </div>
        `;
    },
    
    createStorageBackendSection(errors) {
        if (!errors || errors.length === 0) return '';
        
        const storageInfo = errors.find(error => 
            error.severity === 'info' && error.type === 'info'
        );
        
        if (!storageInfo) return '';
        
        const backendName = Utils.getStorageBackendDisplayName(storageInfo.resource);
        const isLonghorn = storageInfo.resource === 'driver.longhorn.io';
        
        return `
            <div class="mb-4">
                <div class="bg-blue-900/20 border border-blue-500/30 p-4 rounded-md">
                    <div class="flex items-start gap-3">
                        <span class="text-2xl">📦</span>
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-blue-400 font-semibold text-lg">Storage Backend</span>
                                <span class="bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-full font-mono">${storageInfo.resource}</span>
                            </div>
                            <h5 class="text-slate-200 font-medium text-base mb-2">${backendName}</h5>
                            <p class="text-slate-300 text-sm mb-3">${storageInfo.message}</p>
                            
                            ${!isLonghorn ? `
                                <div class="bg-slate-800/50 p-3 rounded border-l-4 border-yellow-400">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="text-yellow-400">ℹ️</span>
                                        <span class="text-yellow-400 font-medium text-sm">Limited Diagnostics</span>
                                    </div>
                                    <p class="text-slate-400 text-xs">
                                        Replica status, engine details, and advanced storage diagnostics are only available for Longhorn-managed volumes.
                                        This volume is managed by ${backendName} and provides basic volume information only.
                                    </p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    createErrorSection(errors) {
        if (!errors || errors.length === 0) return '';
        
        const actualIssues = errors.filter(error => 
            error.severity !== 'info' && error.severity !== 'information'
        );
        
        if (actualIssues.length === 0) return '';
        
        const errorRows = actualIssues.map(error => {
            let severityColor = 'text-slate-400';
            let severityIcon = '⚠️';
            
            switch (error.severity) {
                case 'error':
                    severityColor = 'text-red-400';
                    severityIcon = '❌';
                    break;
                case 'warning':
                    severityColor = 'text-yellow-400';
                    severityIcon = '⚠️';
                    break;
                case 'critical':
                    severityColor = 'text-red-500';
                    severityIcon = '🚨';
                    break;
            }
            
            return `
                <div class="bg-red-900/20 border border-red-500/30 p-3 rounded-md mb-2">
                    <div class="flex items-start gap-2">
                        <span class="text-lg">${severityIcon}</span>
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="${severityColor} font-semibold text-sm uppercase">${error.severity}</span>
                                <span class="text-slate-400 text-sm">•</span>
                                <span class="text-slate-300 text-sm font-medium">${error.type.toUpperCase()}</span>
                                <span class="text-slate-400 text-sm">•</span>
                                <span class="text-slate-400 text-xs font-mono">${error.resource}</span>
                            </div>
                            <p class="text-slate-200 text-sm">${error.message}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="mb-4">
                <h4 class="text-base font-bold text-red-400 mb-3 flex items-center gap-2">
                    <span>🚨</span>
                    Issues Found (${actualIssues.length})
                </h4>
                ${errorRows}
            </div>
        `;
    },
    
    createCompactVMICard(vmiInfo) {
        if (!vmiInfo) return '';

        let content = `
            <div class="bg-slate-800/30 p-3 rounded-md">
                <h4 class="section-header">VMI</h4>
                <div class="compact-row"><span class="data-label">Node:</span><span class="data-value">${vmiInfo.nodeName || 'N/A'}</span></div>
                <div class="compact-row"><span class="data-label">Phase:</span><span class="data-value ${Utils.getStatusColorClass(vmiInfo.phase)}">${vmiInfo.phase || 'N/A'}</span></div>
        `;

        if (vmiInfo.guestOSInfo && vmiInfo.guestOSInfo.prettyName) {
            content += `<div class="compact-row"><span class="data-label">OS:</span><span class="data-value">${vmiInfo.guestOSInfo.prettyName}</span></div>`;
        }

        if (vmiInfo.interfaces && vmiInfo.interfaces.length > 0) {
            const primaryInterface = vmiInfo.interfaces.find(iface => 
                iface.ipAddress && 
                !iface.interfaceName?.startsWith('lxc') && 
                !iface.interfaceName?.startsWith('cilium') &&
                iface.ipAddress !== '127.0.0.1'
            );
            
            if (primaryInterface) {
                content += `<div class="compact-row"><span class="data-label">IP:</span><span class="data-value text-blue-300">${primaryInterface.ipAddress}</span></div>`;
            }
        }

        content += `</div>`;
        return content;
    },
    
    createCompactReplicaSection(replicas) {
        if (!replicas || replicas.length === 0) return '';
        
        const replicaRows = replicas.map(r => {
            const storageIP = r.storageIP || 'N/A';
            const portDisplay = r.port ? `:${r.port}` : '';
            const networkInfo = storageIP !== 'N/A' ? `${storageIP}${portDisplay}` : 'N/A';
            
            return `
                <div class="bg-slate-900/50 p-4 rounded-lg mb-4 border border-slate-700/50">
                    <div class="flex justify-between items-center mb-3">
                        <span class="font-mono text-slate-100 text-lg font-bold" title="${r.name}">${r.name}</span>
                        <span class="text-sm ${Utils.getHealthColorClass(r.currentState)} font-semibold px-3 py-1 rounded-full bg-slate-800/50">${r.currentState || 'N/A'}</span>
                    </div>
                    
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between items-center py-1 border-b border-slate-700/30">
                            <span class="text-slate-400 font-medium">Node:</span> 
                            <span class="text-slate-200 font-mono">${r.nodeId || 'N/A'}</span>
                        </div>
                        
                        <div class="flex justify-between items-center py-1 border-b border-slate-700/30">
                            <span class="text-slate-400 font-medium">Network:</span> 
                            <span class="text-blue-300 font-mono">${networkInfo}</span>
                        </div>
                        
                        <div class="flex justify-between items-center py-1 border-b border-slate-700/30">
                            <span class="text-slate-400 font-medium">Started:</span> 
                            <span class="${r.started ? 'text-green-400' : 'text-red-400'} font-medium">${r.started ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="mt-6">
                <h4 class="text-xl font-bold text-slate-200 mb-4">Storage Replicas (${replicas.length})</h4>
                <div class="space-y-0">
                    ${replicaRows}
                </div>
            </div>
        `;
    },
    
    // Helper methods for node details
    createNodeOverviewSection(nodeData, isReady) {
        if (!nodeData.kubernetesInfo) {
            return '';
        }
        
        const k8sInfo = nodeData.kubernetesInfo;
        const roles = k8sInfo.roles ? k8sInfo.roles.join(', ') : 'worker';
        
        return `
            <div class="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 p-4 rounded-lg mb-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div class="flex flex-col">
                        <span class="text-slate-400 text-xs uppercase tracking-wide mb-1">Role</span>
                        <span class="text-blue-300 font-semibold">${roles}</span>
                    </div>
                    ${k8sInfo.internalIP ? `
                    <div class="flex flex-col">
                        <span class="text-slate-400 text-xs uppercase tracking-wide mb-1">Internal IP</span>
                        <span class="text-slate-200 font-mono">${k8sInfo.internalIP}</span>
                    </div>` : ''}
                    ${k8sInfo.nodeInfo && k8sInfo.nodeInfo.osImage ? `
                    <div class="flex flex-col">
                        <span class="text-slate-400 text-xs uppercase tracking-wide mb-1">OS Image</span>
                        <span class="text-slate-200">${k8sInfo.nodeInfo.osImage}</span>
                    </div>` : ''}
                    ${k8sInfo.nodeInfo && k8sInfo.nodeInfo.kubeletVersion ? `
                    <div class="flex flex-col">
                        <span class="text-slate-400 text-xs uppercase tracking-wide mb-1">Kubelet</span>
                        <span class="text-slate-200 font-mono">${k8sInfo.nodeInfo.kubeletVersion}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    },
    
    createKubernetesConditionsSection(nodeData) {
        if (!nodeData.kubernetesInfo || !nodeData.kubernetesInfo.conditions) {
            return '';
        }
        
        const conditions = nodeData.kubernetesInfo.conditions;
        const priorityConditions = ['Ready', 'MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable'];
        
        const conditionsHTML = priorityConditions.map(conditionType => {
            const condition = conditions.find(c => c.type === conditionType);
            if (!condition) return '';
            
            let statusIcon = '⚪️';
            let statusColor = 'text-slate-400';
            
            if (conditionType === 'Ready') {
                statusIcon = condition.status === 'True' ? '🟢' : '🔴';
                statusColor = condition.status === 'True' ? 'text-green-400' : 'text-red-400';
            } else {
                // For pressure conditions, False is good, True is bad
                statusIcon = condition.status === 'False' ? '🟢' : '🔴';
                statusColor = condition.status === 'False' ? 'text-green-400' : 'text-red-400';
            }
            
            return `
                <div class="flex items-center justify-between text-sm py-2 border-b border-slate-700/30">
                    <div class="flex items-center gap-2">
                        <span class="w-4">${statusIcon}</span>
                        <span class="text-slate-300">${conditionType}</span>
                    </div>
                    <span class="${statusColor} font-medium">${condition.status}</span>
                </div>
            `;
        }).filter(html => html).join('');
        
        return `
            <div class="bg-slate-800/30 p-3 rounded-md">
                <h4 class="font-bold text-base text-slate-200 mb-2">Node Conditions</h4>
                ${conditionsHTML || '<div class="text-slate-500 text-sm">No conditions available</div>'}
            </div>
        `;
    },
    
    createNodeInfoSection(nodeData) {
        if (!nodeData.kubernetesInfo || !nodeData.kubernetesInfo.nodeInfo) {
            return '';
        }
        
        const nodeInfo = nodeData.kubernetesInfo.nodeInfo;
        const capacity = nodeData.kubernetesInfo.capacity || {};
        
        return `
            <div class="bg-slate-800/30 p-3 rounded-md">
                <h4 class="font-bold text-base text-slate-200 mb-2">System Information</h4>
                <div class="space-y-2 text-sm">
                    ${nodeInfo.architecture ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">Architecture:</span>
                        <span class="text-slate-200">${nodeInfo.architecture}</span>
                    </div>` : ''}
                    ${nodeInfo.kernelVersion ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">Kernel:</span>
                        <span class="text-slate-200 font-mono text-xs">${nodeInfo.kernelVersion}</span>
                    </div>` : ''}
                    ${nodeInfo.containerRuntimeVersion ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">Container Runtime:</span>
                        <span class="text-slate-200 font-mono text-xs">${nodeInfo.containerRuntimeVersion}</span>
                    </div>` : ''}
                    ${capacity.cpu ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">CPU:</span>
                        <span class="text-slate-200">${capacity.cpu} cores</span>
                    </div>` : ''}
                    ${capacity.memory ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">Memory:</span>
                        <span class="text-slate-200">${this.formatMemory(capacity.memory)}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    },
    
    createVolumesSection(nodeData) {
        if (!nodeData.kubernetesInfo) {
            return '';
        }
        
        const volumesAttached = nodeData.kubernetesInfo.volumesAttached || [];
        const volumesInUse = nodeData.kubernetesInfo.volumesInUse || [];
        
        if (volumesAttached.length === 0 && volumesInUse.length === 0) {
            return '';
        }
        
        const attachedHTML = volumesAttached.slice(0, 5).map(vol => {
            const volumeName = this.formatVolumeName(vol.name);
            return `
                <div class="text-xs text-slate-400 py-0.5 hover:text-slate-200" title="${vol.name}">
                    • ${volumeName}
                </div>
            `;
        }).join('');
        
        const inUseHTML = volumesInUse.slice(0, 5).map(vol => {
            const volumeName = this.formatVolumeName(vol);
            return `
                <div class="text-xs text-slate-400 py-0.5 hover:text-slate-200" title="${vol}">
                    • ${volumeName}
                </div>
            `;
        }).join('');
        
        return `
            <div class="bg-slate-800/30 p-3 rounded-md">
                <h4 class="font-bold text-base text-slate-200 mb-2">Volumes</h4>
                ${volumesAttached.length > 0 ? `
                <div class="mb-3">
                    <div class="text-xs font-semibold text-slate-400 mb-1">Attached (${volumesAttached.length})</div>
                    <div class="max-h-24 overflow-y-auto">${attachedHTML}</div>
                    ${volumesAttached.length > 5 ? `<div class="text-xs text-slate-500 mt-1">... and ${volumesAttached.length - 5} more</div>` : ''}
                </div>` : ''}
                ${volumesInUse.length > 0 ? `
                <div>
                    <div class="text-xs font-semibold text-slate-400 mb-1">In Use (${volumesInUse.length})</div>
                    <div class="max-h-24 overflow-y-auto">${inUseHTML}</div>
                    ${volumesInUse.length > 5 ? `<div class="text-xs text-slate-500 mt-1">... and ${volumesInUse.length - 5} more</div>` : ''}
                </div>` : ''}
            </div>
        `;
    },
    
    formatMemory(memoryStr) {
        if (!memoryStr) return 'Unknown';
        
        // Convert Ki (kibibytes) to a more readable format
        if (memoryStr.includes('Ki')) {
            const value = parseInt(memoryStr.replace('Ki', ''));
            const gb = (value / (1024 * 1024)).toFixed(1);
            return `${gb} GB`;
        }
        
        return memoryStr;
    },
    
    formatVolumeName(volumeName) {
        if (!volumeName) return 'Unknown';
        
        // Shorten very long volume names for display
        if (volumeName.length > 40) {
            const parts = volumeName.split('^');
            if (parts.length > 1) {
                // For CSI volumes like "kubernetes.io/csi/driver.longhorn.io^pvc-abc123"
                const driver = parts[0].split('/').pop() || parts[0];
                const pvcId = parts[1];
                return `${driver}^${pvcId}`;
            }
            return volumeName.substring(0, 37) + '...';
        }
        
        return volumeName;
    },
    
    analyzeNodeHealth(nodeData) {
        const summary = {
            overall: 'healthy',
            issues: [],
            warnings: [],
            storageHealth: 'good',
            resourceHealth: 'good'
        };

        if (nodeData.kubernetesInfo && nodeData.kubernetesInfo.conditions) {
            nodeData.kubernetesInfo.conditions.forEach(condition => {
                if (condition.type === 'Ready' && condition.status !== 'True') {
                    summary.issues.push('Node is not ready');
                    summary.overall = 'critical';
                } else if (condition.type === 'MemoryPressure' && condition.status === 'True') {
                    summary.issues.push('Memory pressure detected');
                    summary.resourceHealth = 'warning';
                    summary.overall = 'warning';
                } else if (condition.type === 'DiskPressure' && condition.status === 'True') {
                    summary.issues.push('Disk pressure detected');
                    summary.resourceHealth = 'critical';
                    summary.overall = 'critical';
                } else if (condition.type === 'PIDPressure' && condition.status === 'True') {
                    summary.warnings.push('PID pressure detected');
                    if (summary.overall === 'healthy') summary.overall = 'warning';
                }
            });
        }

        const longhornConditions = nodeData.longhornInfo ? nodeData.longhornInfo.conditions : [];
        longhornConditions.forEach(condition => {
            if (condition.type === 'Schedulable' && condition.status !== 'True') {
                summary.warnings.push('Storage scheduling disabled');
                summary.storageHealth = 'warning';
            }
        });

        const disks = nodeData.longhornInfo ? nodeData.longhornInfo.disks : [];
        disks.forEach(disk => {
            if (!disk.isSchedulable) {
                summary.warnings.push(`Storage disk ${disk.name} not schedulable`);
                summary.storageHealth = 'warning';
            }
        });

        return summary;
    },

    renderHealthBadges(healthSummary) {
        const badges = [];
        
        if (healthSummary.issues.length > 0) {
            badges.push(`<span class="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded">${healthSummary.issues.length} Issues</span>`);
        }
        
        if (healthSummary.warnings.length > 0) {
            badges.push(`<span class="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded">${healthSummary.warnings.length} Warnings</span>`);
        }

        return badges.join('');
    },

    renderResourceStats(nodeData) {
        const capacity = nodeData.kubernetesInfo?.capacity || {};
        const allocatable = nodeData.kubernetesInfo?.allocatable || {};
        
        return `
            <div class="bg-slate-800/30 p-3 rounded-lg">
                <h4 class="text-base font-bold text-slate-200 mb-3 flex items-center gap-2">
                    📊 Resources
                </h4>
                <div class="space-y-2 text-sm">
                    ${capacity.cpu ? `
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">CPU:</span>
                        <span class="font-mono text-green-300">${capacity.cpu} cores</span>
                    </div>` : ''}
                    ${capacity.memory ? `
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Memory:</span>
                        <span class="font-mono text-green-300">${this.formatMemory(capacity.memory)}</span>
                    </div>` : ''}
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Running Pods:</span>
                        <span class="font-mono text-yellow-300">${nodeData.runningPods || 0}${capacity.pods ? ` / ${capacity.pods}` : ''}</span>
                    </div>
                    ${nodeData.kubernetesInfo?.volumesAttached ? `
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Volumes Attached:</span>
                        <span class="font-mono text-blue-300">${nodeData.kubernetesInfo.volumesAttached.length}</span>
                    </div>` : ''}
                    ${nodeData.kubernetesInfo?.volumesInUse ? `
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Volumes In Use:</span>
                        <span class="font-mono text-blue-300">${nodeData.kubernetesInfo.volumesInUse.length}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    },

    renderHealthStatus(nodeData, healthSummary) {
        const k8sConditions = nodeData.kubernetesInfo?.conditions || [];
        const criticalConditions = ['Ready', 'MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable'];
        
        // Find conditions that are problematic
        const problemConditions = [];
        const readyCondition = k8sConditions.find(c => c.type === 'Ready');
        
        // Check Ready condition
        if (readyCondition && readyCondition.status !== 'True') {
            problemConditions.push('Ready');
        }
        
        // Check pressure conditions (True means problem)
        criticalConditions.slice(1).forEach(conditionType => {
            const condition = k8sConditions.find(c => c.type === conditionType);
            if (condition && condition.status === 'True') {
                problemConditions.push(conditionType);
            }
        });
        
        // If no problems and Ready is True, show a simple "All systems healthy" message
        if (problemConditions.length === 0 && readyCondition?.status === 'True') {
            return `
                <div class="bg-slate-800/30 p-3 rounded-lg">
                    <h4 class="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                        🏥 Health Status
                    </h4>
                    <div class="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
                        <span class="text-lg">✅</span>
                        <div>
                            <div class="font-medium text-green-400 text-sm">All Systems Healthy</div>
                            <div class="text-xs text-slate-400">Node ready, no pressure detected</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="bg-slate-800/30 p-3 rounded-lg">
                <h4 class="text-base font-bold text-red-400 mb-2 flex items-center gap-2">
                    🚨 Health Issues
                </h4>
                <div class="space-y-2">
                    ${problemConditions.map(conditionType => {
                        const condition = k8sConditions.find(c => c.type === conditionType);
                        if (!condition) return '';
                        
                        let status, icon, description, bgColor, borderColor;
                        
                        if (conditionType === 'Ready') {
                            status = 'Not Ready';
                            icon = '❌';
                            description = 'Cannot schedule pods';
                            bgColor = 'bg-red-500/10';
                            borderColor = 'border-red-500/30';
                        } else {
                            status = 'Critical';
                            icon = '⚠️';
                            description = `${conditionType} detected`;
                            bgColor = 'bg-yellow-500/10';
                            borderColor = 'border-yellow-500/30';
                        }
                        
                        return `
                            <div class="flex items-center justify-between p-2 ${bgColor} border ${borderColor} rounded text-sm">
                                <div class="flex items-center gap-2">
                                    <span class="text-base">${icon}</span>
                                    <div>
                                        <div class="font-medium text-slate-200">${conditionType.replace(/([A-Z])/g, ' $1').trim()}</div>
                                        <div class="text-xs text-slate-400">${description}</div>
                                    </div>
                                </div>
                                <span class="text-xs font-medium px-2 py-1 rounded ${conditionType === 'Ready' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}">${status}</span>
                            </div>
                        `;
                    }).filter(html => html).join('')}
                </div>
            </div>
        `;
    },

    renderStorageOverview(longhornDisks) {
        if (!longhornDisks || longhornDisks.length === 0) {
            return `
                <div class="bg-slate-800/30 p-4 rounded-lg">
                    <h4 class="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                        💾 Storage Overview
                    </h4>
                    <div class="text-slate-400">No storage information available</div>
                </div>
            `;
        }

        const totalDisks = longhornDisks.length;
        const schedulableDisks = longhornDisks.filter(d => d.isSchedulable).length;
        const totalReplicas = longhornDisks.reduce((sum, disk) => 
            sum + Object.keys(disk.scheduledReplicas || {}).length, 0);

        return `
            <div class="bg-slate-800/30 p-3 rounded-lg">
                <h4 class="text-base font-bold text-slate-200 mb-3 flex items-center gap-2">
                    💾 Storage Overview
                </h4>
                
                <div class="grid grid-cols-3 gap-3 mb-3">
                    <div class="text-center p-2 bg-slate-900/50 rounded">
                        <div class="text-lg font-bold text-blue-400">${totalDisks}</div>
                        <div class="text-xs text-slate-400">Disks</div>
                    </div>
                    <div class="text-center p-2 bg-slate-900/50 rounded">
                        <div class="text-lg font-bold ${schedulableDisks === totalDisks ? 'text-green-400' : 'text-yellow-400'}">${schedulableDisks}</div>
                        <div class="text-xs text-slate-400">Active</div>
                    </div>
                    <div class="text-center p-2 bg-slate-900/50 rounded">
                        <div class="text-lg font-bold text-purple-400">${totalReplicas}</div>
                        <div class="text-xs text-slate-400">Replicas</div>
                    </div>
                </div>
                
                <div class="space-y-3">
                    ${longhornDisks.map(disk => {
                        const replicaCount = Object.keys(disk.scheduledReplicas || {}).length;
                        const replicaList = Object.entries(disk.scheduledReplicas || {});
                        
                        return `
                            <div class="border border-slate-700/50 rounded overflow-hidden">
                                <div class="p-2 bg-slate-900/30">
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="font-medium text-slate-200 text-sm">${disk.name}</div>
                                        <span class="px-2 py-1 text-xs rounded ${disk.isSchedulable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                                            ${disk.isSchedulable ? '●' : '●'}
                                        </span>
                                    </div>
                                    <div class="text-xs text-slate-400 mb-1 font-mono">${disk.path}</div>
                                    <div class="flex justify-between items-center text-xs">
                                        <div>
                                            <span class="text-green-400">${disk.storageAvailable}</span> / 
                                            <span class="text-blue-400">${disk.storageMaximum}</span>
                                        </div>
                                        <div class="text-purple-400">${replicaCount} replicas</div>
                                    </div>
                                </div>
                                
                                ${replicaCount > 0 ? `
                                <div class="p-2 bg-slate-800/20 max-h-32 overflow-y-auto">
                                    <div class="space-y-1">
                                        ${replicaList.map(([replicaName, size]) => {
                                            const sizeGB = (size / (1024**3)).toFixed(1);
                                            
                                            return `
                                                <div class="flex justify-between items-center p-1 bg-slate-900/30 rounded text-xs">
                                                    <div class="font-mono text-slate-300 flex-1 mr-2 break-all leading-tight">
                                                        ${replicaName}
                                                    </div>
                                                    <div class="text-green-400 font-medium whitespace-nowrap">${sizeGB}GB</div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                                ` : `
                                <div class="p-2 bg-slate-800/10 text-center">
                                    <span class="text-slate-500 text-xs">No replicas</span>
                                </div>
                                `}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    renderSystemDetails(nodeData) {
        if (!nodeData.kubernetesInfo?.nodeInfo) {
            return '';
        }
        
        const nodeInfo = nodeData.kubernetesInfo.nodeInfo;
        const capacity = nodeData.kubernetesInfo.capacity || {};
        
        return `
            <div class="bg-slate-800/30 p-3 rounded-lg">
                <h4 class="text-base font-bold text-slate-200 mb-3 flex items-center gap-2">
                    ⚙️ System
                </h4>
                <div class="space-y-2 text-xs">
                    ${nodeInfo.architecture ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">Architecture:</span>
                        <span class="text-slate-200 font-mono">${nodeInfo.architecture}</span>
                    </div>` : ''}
                    ${nodeInfo.kernelVersion ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">Kernel:</span>
                        <span class="text-slate-200 font-mono">${nodeInfo.kernelVersion.substring(0, 20)}...</span>
                    </div>` : ''}
                    ${nodeInfo.containerRuntimeVersion ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">Runtime:</span>
                        <span class="text-slate-200 font-mono">${nodeInfo.containerRuntimeVersion}</span>
                    </div>` : ''}
                    ${nodeInfo.operatingSystem ? `
                    <div class="flex justify-between">
                        <span class="text-slate-400">OS:</span>
                        <span class="text-slate-200">${nodeInfo.operatingSystem}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    },

    renderTroubleshootingActions(nodeData, healthSummary) {
        const troubleshootingSteps = [];
        
        // Add troubleshooting based on detected issues
        if (healthSummary.issues.includes('Node is not ready')) {
            troubleshootingSteps.push({
                title: 'Check Node Status',
                command: `kubectl describe node ${nodeData.longhornInfo?.name || 'NODE_NAME'}`,
                description: 'Get detailed node status and events'
            });
        }
        
        if (healthSummary.resourceHealth === 'warning' || healthSummary.resourceHealth === 'critical') {
            troubleshootingSteps.push({
                title: 'Check Resource Usage',
                command: `kubectl top node ${nodeData.longhornInfo?.name || 'NODE_NAME'}`,
                description: 'View current CPU and memory usage'
            });
        }
        
        if (healthSummary.storageHealth !== 'good') {
            troubleshootingSteps.push({
                title: 'Check Storage Health',
                command: `kubectl get nodes.longhorn.io ${nodeData.longhornInfo?.name || 'NODE_NAME'} -o yaml`,
                description: 'Examine Longhorn node configuration'
            });
        }

        // Always include common troubleshooting steps
        troubleshootingSteps.push(
            {
                title: 'View Running Pods',
                command: `kubectl get pods --all-namespaces --field-selector spec.nodeName=${nodeData.longhornInfo?.name || 'NODE_NAME'}`,
                description: 'List all pods running on this node'
            },
            {
                title: 'Check System Logs',
                command: `journalctl -u rke2-server`,
                description: 'View RKE2 server logs (run on the node)'
            }
        );

        return `
            <div class="bg-slate-800/30 p-3 rounded-lg">
                <h4 class="text-base font-bold text-slate-200 mb-3 flex items-center gap-2">
                    🔧 Quick Commands
                </h4>
                <div class="space-y-2">
                    ${troubleshootingSteps.slice(0, 3).map(step => `
                        <div class="p-2 bg-slate-900/50 rounded">
                            <div class="font-medium text-slate-200 mb-1 text-sm">${step.title}</div>
                            <div class="flex items-center gap-1">
                                <code class="flex-1 text-xs bg-slate-800 text-green-300 p-1 rounded font-mono overflow-hidden">
                                    ${step.command.length > 40 ? step.command.substring(0, 37) + '...' : step.command}
                                </code>
                                <button onclick="navigator.clipboard.writeText('${step.command}')" 
                                        class="px-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded">
                                    📋
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
};