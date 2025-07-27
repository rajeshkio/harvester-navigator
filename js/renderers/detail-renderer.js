// Detail view rendering
const DetailRenderer = {
    renderNodeDetail(nodeData, issues) {
        const readyCondition = (nodeData.conditions || []).find(c => c.type === 'Ready');
        const isReady = readyCondition && readyCondition.status === 'True';

        let conditionsHTML = (nodeData.conditions || []).map(c => {
            const conditionType = c.type ? c.type.replace(/([A-Z])/g, ' $1').trim() : 'Unknown';
            const statusIcon = c.status === 'True' ? '🟢' : c.status === 'False' ? '🔴' : '⚪️';
            return `<div class="flex items-center text-sm py-1" title="${c.message || ''}"><span class="w-4 mr-2">${statusIcon}</span><span class="text-slate-300">${conditionType}</span></div>`;
        }).join('');

        let disksHTML = (nodeData.disks || []).map(disk => {
            let replicasHTML = Object.entries(disk.scheduledReplicas || {}).map(([name, size]) =>
                `<div class="text-xs text-slate-400 truncate py-0.5 hover:text-slate-200" title="${name} (${(size / 1024**3).toFixed(2)} GB)">• ${name}</div>`
            ).join('');
            if (!replicasHTML) replicasHTML = '<div class="text-xs text-slate-500 italic">No replicas</div>';

            return `
                <div class="bg-slate-800/30 p-3 rounded-md mb-3">
                    <h4 class="font-bold text-base text-slate-200 mb-2">${disk.name} ${disk.isSchedulable ? '<span class="text-green-400 text-sm">✓</span>' : '<span class="text-red-400 text-sm">✗</span>'}</h4>
                    <div class="text-xs text-slate-400 mb-1">Path: <span class="font-mono text-slate-300">${disk.path}</span></div>
                    <div class="text-xs text-slate-400 mb-2">Storage: <span class="font-mono text-slate-300">${disk.storageScheduled} / ${disk.storageMaximum} (${disk.storageAvailable} free)</span></div>
                    <div class="">
                        <div class="text-xs font-semibold text-slate-400 mb-1">Replicas</div>
                        <div class="max-h-32 overflow-y-auto">${replicasHTML}</div>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="card p-4 fade-in">
                <h3 class="font-bold text-xl mb-4 text-slate-100">${nodeData.name} <span class="text-base font-medium ${isReady ? 'text-green-400' : 'text-red-400'}">${isReady ? 'Ready' : 'Not Ready'}</span></h3>
                <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div class="lg:col-span-1">
                        <div class="bg-slate-800/30 p-3 rounded-md">
                            <h4 class="font-bold text-base text-slate-200 mb-2">Conditions</h4>
                            ${conditionsHTML}
                        </div>
                    </div>
                    <div class="lg:col-span-3">
                        <h4 class="font-bold text-base text-slate-200 mb-2">Storage Disks</h4>
                        ${disksHTML}
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
    }
};
