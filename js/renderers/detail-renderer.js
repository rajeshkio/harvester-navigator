/**
 * DetailRenderer - Clean, Aligned, Professional UI Layout
 * Fixes alignment issues and creates an intuitive, space-efficient interface
 */
const DetailRenderer = {
    
    renderVMDetail(vmData) {
        return `
            <div class="max-w-6xl mx-auto p-6 space-y-6">
                <!-- VM Header -->
                <div class="flex items-center justify-between pb-4 border-b border-slate-700">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-100">${vmData.name}</h1>
                        <p class="text-slate-400">${vmData.namespace}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="px-3 py-1 rounded-full text-sm font-medium ${this.getStatusBadgeClass(vmData.printableStatus)}">${vmData.printableStatus}</span>
                        ${vmData.vmStatusReason ? `<span class="text-slate-400 text-sm">• ${vmData.vmStatusReason}</span>` : ''}
                    </div>
                </div>

                <!-- VM Details Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-slate-800/30 rounded-lg">
                    <div>
                        <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Image</div>
                        <div class="text-sm text-slate-200 font-mono">${this.truncateText(vmData.imageId || 'N/A', 30)}</div>
                    </div>
                    <div>
                        <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Storage Class</div>
                        <div class="text-sm text-slate-200">${vmData.storageClass || 'N/A'}</div>
                    </div>
                    <div>
                        <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">PVC Status</div>
                        <div class="text-sm font-medium ${Utils.getStatusColorClass(vmData.pvcStatus)}">${vmData.pvcStatus || 'N/A'}</div>
                    </div>
                    <div>
                        <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Volume</div>
                        <div class="text-sm text-slate-200 font-mono">${this.truncateText(vmData.volumeName || 'N/A', 25)}</div>
                    </div>
                </div>

                ${vmData.errors && vmData.errors.length > 0 ? this.createErrorSection(vmData.errors) : ''}

                <!-- Two Column Layout -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Left: Compute Section -->
                    <div class="space-y-2">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">💻</span>
                            <h2 class="text-lg font-semibold text-slate-200">Compute</h2>
                        </div>
                        
                        ${vmData.vmiInfo && vmData.vmiInfo.length > 0 ? this.createVMICard(vmData.vmiInfo[0]) : ''}
                        ${vmData.podInfo && vmData.podInfo.length > 0 ? this.createPodCard(vmData) : ''}
                    </div>

                    <!-- Right: Migration Section -->
                    <div>
                        ${vmData.vmimInfo && vmData.vmimInfo.length > 0 ? this.createMigrationSection(vmData.vmimInfo) : ''}
                    </div>
                </div>

                ${this.createAdditionalSections(vmData)}
            </div>
        `;
    },

    getStatusBadgeClass(status) {
        const statusMap = {
            'running': 'bg-green-500/20 text-green-400',
            'stopped': 'bg-gray-500/20 text-gray-400',
            'starting': 'bg-yellow-500/20 text-yellow-400',
            'stopping': 'bg-orange-500/20 text-orange-400',
            'error': 'bg-red-500/20 text-red-400',
            'failed': 'bg-red-500/20 text-red-400'
        };
        return statusMap[status?.toLowerCase()] || 'bg-slate-500/20 text-slate-400';
    },

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    },

    createVMICard(vmiInfo) {
        if (!vmiInfo) return '';

        const primaryInterface = vmiInfo.interfaces?.find(iface => 
            iface.ipAddress && 
            !iface.interfaceName?.startsWith('lxc') && 
            !iface.interfaceName?.startsWith('cilium') &&
            iface.ipAddress !== '127.0.0.1'
        );

        return `
            <div class="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
                <div class="flex items-center gap-2 mb-3">
                    <span class="text-blue-400">🖥️</span>
                    <span class="font-medium text-slate-200">VMI</span>
                </div>
                <div class="space-y-1 text-sm">
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Node</span>
                        <span class="text-slate-200 font-medium">${vmiInfo.nodeName || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Phase</span>
                        <span class="px-2 py-0.5 rounded text-xs font-medium ${this.getStatusBadgeClass(vmiInfo.phase)}">${vmiInfo.phase || 'N/A'}</span>
                    </div>
                    ${primaryInterface ? `
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">IP Address</span>
                        <span class="text-blue-300 font-mono">${primaryInterface.ipAddress}</span>
                    </div>
                    ` : ''}
                    ${vmiInfo.guestOSInfo?.prettyName ? `
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Guest OS</span>
                        <span class="text-slate-200">${this.truncateText(vmiInfo.guestOSInfo.prettyName, 25)}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    createPodCard(vmData) {
        if (!vmData.podInfo || vmData.podInfo.length === 0) return '';

        return `
            <div class="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
                <div class="flex items-center gap-2 mb-3">
                    <span class="text-purple-400">📦</span>
                    <span class="font-medium text-slate-200">Pod</span>
                </div>
                <div class="space-y-1 text-sm">
                    <div>
                        <div class="text-slate-400 text-xs mb-1">Name</div>
                        <div class="bg-slate-900/50 rounded p-1.5 border border-slate-700/50">
                            <div class="flex items-center justify-between gap-2">
                                <div class="text-slate-200 font-mono text-xs break-all text-left" title="${vmData.podName || 'N/A'}">
                                    ${vmData.podName || 'N/A'}
                                </div>
                                ${vmData.podName ? `
                                <button class="flex-shrink-0 text-slate-400 hover:text-slate-200 p-1 rounded transition-colors" 
                                        onclick="DetailRenderer.copyToClipboard('${vmData.podName}', this)"
                                        title="Copy pod name">
                                    <span class="copy-icon">📋</span>
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Node</span>
                        <span class="text-slate-200">${vmData.podInfo[0].nodeId || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Status</span>
                        <span class="px-2 py-0.5 rounded text-xs font-medium ${this.getStatusBadgeClass(vmData.podInfo[0].status)}">${vmData.podInfo[0].status || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
    },

    createMigrationSection(vmimInfos) {
        if (!vmimInfos || vmimInfos.length === 0) return '';

        const latestMigration = vmimInfos[vmimInfos.length - 1];
        if (!latestMigration) return '';

        const migrationIcon = this.getMigrationIcon(latestMigration.phase);
        const isActive = ['Running', 'Scheduling', 'Scheduled', 'PreparingTarget', 'TargetReady'].includes(latestMigration.phase);
        const migrationId = `migration-section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="space-y-2">
                <div class="bg-slate-800/40 rounded-lg border border-slate-700/50">
                    <div class="p-4 border-b border-slate-700/50">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-lg">${migrationIcon}</span>
                                <h2 class="text-lg font-semibold text-slate-200">Migration</h2>
                                ${isActive ? '<span class="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full font-medium">ACTIVE</span>' : ''}
                            </div>
                            <button class="text-slate-400 hover:text-slate-300 text-sm transition-colors" 
                                    onclick="DetailRenderer.toggleMigrationSection('${migrationId}', this)">
                                <span class="toggle-text">Show Details</span>
                            </button>
                        </div>
                    </div>
                    <div id="${migrationId}" class="hidden p-4 space-y-4">

                        <!-- Current Migration Status -->
                        <div class="bg-slate-900/50 rounded-lg p-4 border ${latestMigration.phase === 'Failed' ? 'border-red-500/50' : 'border-slate-700/50'}">
                            <div class="flex items-center justify-between mb-4">
                                <div class="flex items-center gap-3">
                                    <span class="text-lg">${migrationIcon}</span>
                                    <div>
                                        <div class="text-slate-200 font-medium">Latest Migration</div>
                                        <div class="text-slate-400 text-sm">${this.truncateText(latestMigration.name || 'Unknown', 30)}</div>
                                    </div>
                                </div>
                                <span class="px-3 py-1 rounded text-sm font-medium ${this.getStatusBadgeClass(latestMigration.phase)}">${latestMigration.phase || 'Unknown'}</span>
                            </div>

                            <!-- Migration Path -->
                            <div class="bg-slate-800/50 rounded-lg p-4 mb-4">
                                <div class="grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <div class="text-slate-400 text-xs mb-1">Source</div>
                                        <div class="text-slate-200 font-medium">${latestMigration.sourceNode || 'Unknown'}</div>
                                        ${latestMigration.sourcePod ? `
                                        <div class="mt-2">
                                            <div class="text-slate-400 text-xs mb-1">Source Pod</div>
                                            <div class="bg-slate-800/50 rounded p-2 border border-slate-700/50">
                                                <div class="flex items-center justify-between gap-2">
                                                    <div class="text-slate-300 font-mono text-xs break-all text-left" title="${latestMigration.sourcePod}">
                                                        ${latestMigration.sourcePod}
                                                    </div>
                                                    <button class="flex-shrink-0 text-slate-400 hover:text-slate-200 p-1 rounded transition-colors" 
                                                            onclick="DetailRenderer.copyToClipboard('${latestMigration.sourcePod}', this)"
                                                            title="Copy pod name">
                                                        <span class="copy-icon">📋</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        ` : ''}
                                    </div>
                                    <div class="flex items-center justify-center">
                                        <span class="text-2xl text-slate-500">→</span>
                                    </div>
                                    <div>
                                        <div class="text-slate-400 text-xs mb-1">Target</div>
                                        <div class="text-green-400 font-medium">${latestMigration.targetNode || 'Unknown'}</div>
                                        ${latestMigration.targetPod ? `
                                        <div class="mt-2">
                                            <div class="text-slate-400 text-xs mb-1">Target Pod</div>
                                            <div class="bg-slate-800/50 rounded p-2 border ${latestMigration.targetPodExists ? 'border-slate-700/50' : 'border-red-500/50'}">
                                                <div class="flex items-center justify-between gap-2">
                                                    <div class="${latestMigration.targetPodExists ? 'text-slate-300' : 'text-red-400'} font-mono text-xs break-all text-left" title="${latestMigration.targetPod}">
                                                        ${latestMigration.targetPod}
                                                        ${!latestMigration.targetPodExists ? ' ⚠️' : ''}
                                                    </div>
                                                    <button class="flex-shrink-0 text-slate-400 hover:text-slate-200 p-1 rounded transition-colors" 
                                                            onclick="DetailRenderer.copyToClipboard('${latestMigration.targetPod}', this)"
                                                            title="Copy pod name">
                                                        <span class="copy-icon">📋</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                                ${latestMigration.migrationMode ? `
                                <div class="text-center mt-3 pt-3 border-t border-slate-700/50">
                                    <span class="text-slate-400 text-xs">Mode: </span>
                                    <span class="text-slate-300 text-sm font-medium">${latestMigration.migrationMode}</span>
                                </div>
                                ` : ''}
                            </div>

                            <!-- Migration Details -->
                            ${latestMigration.latestPhaseTransition ? `
                            <div class="text-sm text-slate-400">
                                <span>Last updated: </span>
                                <span class="text-slate-300">${new Date(latestMigration.latestPhaseTransition.phaseTransitionTimestamp).toLocaleString('en-GB', { 
                                    day: '2-digit', 
                                    month: '2-digit', 
                                    year: 'numeric',
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                })}</span>
                            </div>
                            ` : ''}

                            ${!latestMigration.targetPodExists && latestMigration.targetPod ? `
                            <div class="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                <div class="flex items-center gap-2">
                                    <span class="text-red-400">⚠️</span>
                                    <span class="text-red-400 text-sm font-medium">Target pod validation failed</span>
                                </div>
                                <div class="text-red-300 text-xs mt-1">The target pod could not be found or is not running</div>
                            </div>
                            ` : ''}
                        </div>

                        <!-- Migration History -->
                        ${vmimInfos.length > 1 ? this.createMigrationHistory(vmimInfos) : ''}
                    </div>
                </div>
            </div>
        `;
    },

    createMigrationHistory(vmimInfos) {
        const historyItems = vmimInfos.slice(0, -1).reverse(); // Exclude current migration, newest first
        const historyId = `migration-history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="bg-slate-800/40 rounded-lg border border-slate-700/50">
                <div class="p-4 border-b border-slate-700/50">
                    <div class="flex items-center justify-between">
                        <h4 class="font-medium text-slate-200">Migration History (${historyItems.length})</h4>
                        <button class="text-slate-400 hover:text-slate-300 text-sm transition-colors" 
                                onclick="DetailRenderer.toggleMigrationHistory('${historyId}', this)">
                            <span class="toggle-text">Show History</span>
                        </button>
                    </div>
                </div>
                <div id="${historyId}" class="hidden p-4 space-y-3">
                    ${historyItems.map(migration => `
                        <div class="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-b-0">
                            <div class="flex items-center gap-3">
                                <span class="text-sm">${this.getMigrationIcon(migration.phase)}</span>
                                <div>
                                    <div class="text-sm font-medium ${this.getMigrationColorClass(migration.phase)}">${migration.phase}</div>
                                    <div class="text-xs text-slate-400">${migration.sourceNode || 'Unknown'} → ${migration.targetNode || 'Unknown'}</div>
                                </div>
                            </div>
                            <div class="text-right">
                                ${migration.latestPhaseTransition ? `
                                <div class="text-xs text-slate-400">
                                    ${new Date(migration.latestPhaseTransition.phaseTransitionTimestamp).toLocaleDateString('en-GB')}
                                </div>
                                ` : ''}
                                <div class="text-xs text-slate-500">${migration.migrationMode || 'Unknown mode'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    toggleMigrationSection(sectionId, button) {
        const sectionDiv = document.getElementById(sectionId);
        const toggleText = button.querySelector('.toggle-text');
        
        if (sectionDiv) {
            if (sectionDiv.classList.contains('hidden')) {
                sectionDiv.classList.remove('hidden');
                toggleText.textContent = 'Hide Details';
                button.classList.add('text-slate-300');
                button.classList.remove('text-slate-400');
            } else {
                sectionDiv.classList.add('hidden');
                toggleText.textContent = 'Show Details';
                button.classList.add('text-slate-400');
                button.classList.remove('text-slate-300');
            }
        }
    },

    toggleMigrationHistory(historyId, button) {
        const historyDiv = document.getElementById(historyId);
        const toggleText = button.querySelector('.toggle-text');
        
        if (historyDiv) {
            if (historyDiv.classList.contains('hidden')) {
                historyDiv.classList.remove('hidden');
                toggleText.textContent = 'Hide History';
                button.classList.add('text-slate-300');
                button.classList.remove('text-slate-400');
            } else {
                historyDiv.classList.add('hidden');
                toggleText.textContent = 'Show History';
                button.classList.add('text-slate-400');
                button.classList.remove('text-slate-300');
            }
        }
    },

    createErrorSection(errors) {
        if (!errors || errors.length === 0) return '';
        
        // Separate actual errors from storage info
        const actualIssues = errors.filter(error => 
            error.severity !== 'info' && error.severity !== 'information'
        );
        
        const storageInfo = errors.filter(error => 
            error.severity === 'info' && error.type === 'info'
        );
        
        let sections = '';
        
        // Storage backend info section
        if (storageInfo.length > 0) {
            sections += this.createStorageBackendSection(storageInfo);
        }
        
        // Actual error section
        if (actualIssues.length > 0) {
            sections += `
                <div class="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <h3 class="text-lg font-bold text-red-400 mb-3 flex items-center gap-2">
                        <span>🚨</span> Issues Found (${actualIssues.length})
                    </h3>
                    <div class="space-y-3">
                        ${actualIssues.map(error => `
                            <div class="flex items-start gap-3 p-3 bg-red-900/10 rounded border border-red-500/20">
                                <span class="text-lg">${this.getErrorIcon(error.severity)}</span>
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="text-red-400 font-semibold text-sm uppercase">${error.severity}</span>
                                        <span class="text-slate-400">•</span>
                                        <span class="text-slate-300 text-sm">${error.type.toUpperCase()}</span>
                                    </div>
                                    <p class="text-slate-200 text-sm">${error.message}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        return sections;
    },

    createStorageBackendSection(storageInfos) {
        if (!storageInfos || storageInfos.length === 0) return '';
        
        return `
            <div class="mb-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h3 class="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <span>💽</span> Storage Backend Information
                </h3>
                <div class="space-y-3">
                    ${storageInfos.map(info => `
                        <div class="bg-blue-900/10 rounded-lg p-3 border border-blue-500/20">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-blue-400 font-semibold text-sm">Backend:</span>
                                <span class="bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-full font-mono">
                                    ${this.getStorageBackendDisplayName(info.resource)}
                                </span>
                            </div>
                            <p class="text-slate-300 text-sm">${info.message}</p>
                            ${info.resource ? `
                            <div class="mt-2 text-xs text-slate-400">
                                <span>Resource: </span>
                                <span class="font-mono text-slate-300">${info.resource}</span>
                            </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    getStorageBackendDisplayName(resource) {
        if (!resource) return 'Unknown';
        
        // Extract meaningful name from resource identifier
        if (resource.includes('longhorn')) return 'Longhorn';
        if (resource.includes('ceph')) return 'Ceph';
        if (resource.includes('nfs')) return 'NFS';
        if (resource.includes('iscsi')) return 'iSCSI';
        
        // Return last part of resource path as fallback
        const parts = resource.split('/');
        return parts[parts.length - 1] || resource;
    },

    createAdditionalSections(vmData) {
        let sections = '';
        
        // Storage section with all storage-related info
        const hasStorageInfo = (vmData.attachmentTicketsRaw && Object.keys(vmData.attachmentTicketsRaw).length > 0) ||
                               (vmData.volumeName && vmData.replicaInfo && vmData.replicaInfo.length > 0);
        
        if (hasStorageInfo) {
            sections += `
                <div class="mt-6 space-y-4">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">💾</span>
                        <h2 class="text-lg font-semibold text-slate-200">Storage</h2>
                    </div>
                    
                    ${vmData.attachmentTicketsRaw ? this.createVolumeAttachmentSection(vmData.attachmentTicketsRaw) : ''}
                    ${vmData.volumeName && vmData.replicaInfo && vmData.replicaInfo.length > 0 ? this.createCompactReplicaSection(vmData.replicaInfo) : ''}
                </div>
            `;
        }
        
        return sections;
    },

    createVolumeAttachmentSection(rawTickets) {
        if (!rawTickets || typeof rawTickets !== 'object') return '';
        
        const tickets = Object.entries(rawTickets);
        if (tickets.length === 0) return '';
        
        return `
            <div class="p-4 bg-slate-800/30 rounded-lg">
                <h4 class="font-medium text-slate-200 mb-4 flex items-center gap-2">
                    <span>🔗</span> Volume Attachment Status
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${tickets.map(([ticketId, ticketData]) => this.createAttachmentTicketCard(ticketId, ticketData)).join('')}
                </div>
            </div>
        `;
    },

    createAttachmentTicketCard(ticketId, ticketData) {
        const satisfied = ticketData.satisfied || false;
        const conditions = ticketData.conditions || [];
        
        return `
            <div class="bg-slate-800/40 rounded-lg p-4 border ${satisfied ? 'border-green-500/30' : 'border-red-500/30'}">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <span class="${satisfied ? 'text-green-400' : 'text-red-400'}">${satisfied ? '✅' : '❌'}</span>
                        <span class="font-medium text-slate-200 text-sm">Attachment</span>
                    </div>
                    <span class="px-2 py-1 rounded text-xs font-medium ${satisfied ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                        ${satisfied ? 'SATISFIED' : 'PENDING'}
                    </span>
                </div>
                
                <div class="space-y-2">
                    <div>
                        <div class="text-slate-400 text-xs mb-2">Ticket ID</div>
                        <div class="bg-slate-900/50 rounded p-2 border border-slate-700/50">
                            <div class="flex items-center justify-between gap-2">
                                <div class="text-slate-200 font-mono text-xs break-all text-left" title="${ticketId}">
                                    ${ticketId}
                                </div>
                                <button class="flex-shrink-0 text-slate-400 hover:text-slate-200 p-1 rounded transition-colors" 
                                        onclick="DetailRenderer.copyToClipboard('${ticketId}', this)"
                                        title="Copy ticket ID">
                                    <span class="copy-icon">📋</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    ${conditions.length > 0 ? `
                    <div>
                        <div class="text-slate-400 text-xs mb-2">Conditions</div>
                        <div class="space-y-1">
                            ${conditions.map(condition => `
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-slate-300">${condition.type}</span>
                                    <div class="flex items-center gap-2">
                                        <span class="px-1 py-0.5 rounded text-xs ${condition.status === 'True' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                                            ${condition.status}
                                        </span>
                                        ${condition.lastTransitionTime ? `
                                        <span class="text-slate-500">${this.getTimeAgo(condition.lastTransitionTime)}</span>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${ticketData.node ? `
                    <div>
                        <div class="text-slate-400 text-xs mb-1">Node</div>
                        <div class="text-slate-200 text-sm">${ticketData.node}</div>
                    </div>
                    ` : ''}
                </div>
                
                ${!satisfied ? `
                <div class="mt-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs">
                    <span class="text-red-400">⚠️ Volume attachment pending - check node connectivity and storage backend</span>
                </div>
                ` : ''}
            </div>
        `;
    },

    getTimeAgo(timeString) {
        if (!timeString) return 'unknown';
        
        try {
            const date = new Date(timeString);
            const now = new Date();
            const seconds = Math.round(Math.abs(now - date) / 1000);
            const minutes = Math.round(seconds / 60);
            const hours = Math.round(minutes / 60);
            const days = Math.round(hours / 24);
            
            if (seconds < 60) return `${seconds}s ago`;
            if (minutes < 60) return `${minutes}m ago`;
            if (hours < 24) return `${hours}h ago`;
            return `${days}d ago`;
        } catch (e) {
            return 'unknown';
        }
    },

    createCompactReplicaSection(replicas) {
        if (!replicas || replicas.length === 0) return '';
        
        return `
            <div class="p-4 bg-slate-800/30 rounded-lg">
                <h4 class="font-medium text-slate-200 mb-4 flex items-center gap-2">
                    <span>💿</span> Storage Replicas (${replicas.length})
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${replicas.map(replica => this.createReplicaCard(replica)).join('')}
                </div>
            </div>
        `;
    },

    createReplicaCard(replica) {
        if (!replica) return '';
        
        const healthStatus = this.getReplicaHealthStatus(replica.currentState);
        const isHealthy = replica.currentState === 'running';
        
        return `
            <div class="bg-slate-800/40 rounded-lg p-4 border ${isHealthy ? 'border-green-500/30' : 'border-red-500/30'}">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <span class="${isHealthy ? 'text-green-400' : 'text-red-400'}">${isHealthy ? '✅' : '❌'}</span>
                        <span class="font-medium text-slate-200 text-sm">Replica</span>
                    </div>
                    <span class="px-2 py-1 rounded text-xs font-medium ${this.getReplicaStatusBadgeClass(replica.currentState)}">${replica.currentState || 'Unknown'}</span>
                </div>
                
                <div class="space-y-2 text-sm">
                    <div>
                        <div class="text-slate-400 text-xs mb-2">Name</div>
                        <div class="bg-slate-900/50 rounded p-2 border border-slate-700/50">
                            <div class="flex items-center justify-between gap-2">
                                <div class="text-slate-200 font-mono text-xs break-all text-left" title="${replica.name}">
                                    ${replica.name || 'N/A'}
                                </div>
                                ${replica.name ? `
                                <button class="flex-shrink-0 text-slate-400 hover:text-slate-200 p-1 rounded transition-colors" 
                                        onclick="DetailRenderer.copyToClipboard('${replica.name}', this)"
                                        title="Copy replica name">
                                    <span class="copy-icon">📋</span>
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <div class="text-slate-400 text-xs mb-1">Node</div>
                            <div class="text-slate-200 text-sm">${replica.nodeId || 'N/A'}</div>
                        </div>
                        <div>
                            <div class="text-slate-400 text-xs mb-1">Started</div>
                            <div class="text-sm font-medium ${replica.started ? 'text-green-400' : 'text-red-400'}">
                                ${replica.started ? 'Yes' : 'No'}
                            </div>
                        </div>
                    </div>
                    
                    ${replica.diskPath ? `
                    <div>
                        <div class="text-slate-400 text-xs mb-1">Disk Path</div>
                        <div class="text-slate-300 font-mono text-xs">${replica.diskPath}</div>
                    </div>
                    ` : ''}
                    
                    ${replica.dataPath ? `
                    <div>
                        <div class="text-slate-400 text-xs mb-1">Data Path</div>
                        <div class="text-slate-300 font-mono text-xs">${this.truncateText(replica.dataPath, 40)}</div>
                    </div>
                    ` : ''}
                    
                    ${replica.size ? `
                    <div>
                        <div class="text-slate-400 text-xs mb-1">Size</div>
                        <div class="text-slate-200 text-sm">${this.formatBytes(replica.size)}</div>
                    </div>
                    ` : ''}
                </div>
                
                ${!isHealthy && replica.currentState ? `
                <div class="mt-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs">
                    <span class="text-red-400">⚠️ Replica not running - check node health and storage availability</span>
                </div>
                ` : ''}
            </div>
        `;
    },

    getReplicaHealthStatus(state) {
        const healthyStates = ['running', 'healthy', 'ready'];
        return healthyStates.includes(state?.toLowerCase()) ? 'healthy' : 'unhealthy';
    },

    getReplicaStatusBadgeClass(state) {
        switch(state?.toLowerCase()) {
            case 'running':
            case 'healthy':
            case 'ready': 
                return 'bg-green-500/20 text-green-400';
            case 'stopped':
            case 'failed':
            case 'error': 
                return 'bg-red-500/20 text-red-400';
            case 'starting':
            case 'rebuilding': 
                return 'bg-yellow-500/20 text-yellow-400';
            default: 
                return 'bg-slate-500/20 text-slate-400';
        }
    },

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    getMigrationIcon(phase) {
        const iconMap = {
            'Running': '🔄',
            'Scheduling': '⏳',
            'Pending': '⏳',
            'Scheduled': '📋',
            'PreparingTarget': '🔧',
            'TargetReady': '✅',
            'Failed': '❌',
            'Succeeded': '🎉'
        };
        return iconMap[phase] || '📦';
    },

    getMigrationColorClass(phase) {
        const colorMap = {
            'Running': 'text-yellow-400',
            'Scheduling': 'text-blue-400',
            'Pending': 'text-blue-400',
            'Scheduled': 'text-blue-400',
            'PreparingTarget': 'text-purple-400',
            'TargetReady': 'text-green-400',
            'Failed': 'text-red-400',
            'Succeeded': 'text-green-400'
        };
        return colorMap[phase] || 'text-slate-400';
    },

    copyToClipboard(text, button) {
        if (!text) return;
        
        // Use the modern clipboard API if available
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                this.showCopyFeedback(button, true);
            }).catch(() => {
                this.fallbackCopyToClipboard(text, button);
            });
        } else {
            this.fallbackCopyToClipboard(text, button);
        }
    },

    fallbackCopyToClipboard(text, button) {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            this.showCopyFeedback(button, successful);
        } catch (err) {
            this.showCopyFeedback(button, false);
        }
        
        document.body.removeChild(textArea);
    },

    showCopyFeedback(button, success) {
        const icon = button.querySelector('.copy-icon');
        const originalIcon = icon.textContent;
        
        if (success) {
            icon.textContent = '✅';
            button.classList.add('text-green-400');
            button.classList.remove('text-slate-400');
        } else {
            icon.textContent = '❌';
            button.classList.add('text-red-400');
            button.classList.remove('text-slate-400');
        }
        
        // Reset after 2 seconds
        setTimeout(() => {
            icon.textContent = originalIcon;
            button.classList.remove('text-green-400', 'text-red-400');
            button.classList.add('text-slate-400');
        }, 2000);
    },

    getErrorIcon(severity) {
        const iconMap = {
            'error': '❌',
            'warning': '⚠️',
            'critical': '🚨'
        };
        return iconMap[severity] || '⚠️';
    },

    // Simplified node detail functions
    renderNodeDetail(nodeData, issues) { return ''; },
    analyzeNodeHealth(nodeData) { return { issues: [], warnings: [] }; },
    renderHealthBadges(healthSummary) { return ''; },
    renderResourceStats(nodeData) { return ''; },
    renderHealthStatus(nodeData, healthSummary) { return ''; },
    renderStorageOverview(longhornDisks) { return ''; },
    renderSystemDetails(nodeData) { return ''; },
    renderTroubleshootingActions(nodeData, healthSummary) { return ''; }
};
