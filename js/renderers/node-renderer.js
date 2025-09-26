// Refined Node Renderer - Perfect Alignment and Consistency
const NodeRenderer = {
    render(nodes, issues) {
        const container = document.getElementById('node-dashboard');
        container.innerHTML = '';
        
        // Update node count
        const nodeCountElement = document.getElementById('node-count');
        if (nodeCountElement) {
            nodeCountElement.textContent = nodes ? nodes.length : 0;
        }
        
        if (!nodes || nodes.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400">No nodes found</div>';
            return;
        }
        
        // Sort nodes: control-plane first, then workers
        const sortedNodes = [...nodes].sort((a, b) => {
            const getRoles = (node) => {
                if (node.kubernetesInfo && node.kubernetesInfo.roles) {
                    return node.kubernetesInfo.roles;
                }
                return [];
            };
            
            const aRoles = getRoles(a);
            const bRoles = getRoles(b);
            
            const aIsControlPlane = aRoles.includes('control-plane');
            const bIsControlPlane = bRoles.includes('control-plane');
            
            // Control-plane nodes come first
            if (aIsControlPlane && !bIsControlPlane) return -1;
            if (!aIsControlPlane && bIsControlPlane) return 1;
            
            // Within the same type, sort alphabetically by name
            const aName = a.longhornInfo ? a.longhornInfo.name : (a.name || '');
            const bName = b.longhornInfo ? b.longhornInfo.name : (b.name || '');
            return aName.localeCompare(bName);
        });
        
        sortedNodes.forEach(node => {
            const nodeCard = this.createNodeCard(node, issues);
            container.appendChild(nodeCard);
        });
    },
    
    createNodeCard(node, issues) {
        const nodeName = node.longhornInfo ? node.longhornInfo.name : (node.name || 'Unknown');
        const nodeIssues = issues.filter(issue => 
            issue.resourceType === 'node-not-ready' && issue.resourceName === nodeName
        );
        
        const longhornConditions = node.longhornInfo ? node.longhornInfo.conditions : (node.conditions || []);
        const longhornReadyCondition = longhornConditions.find(c => c.type === 'Ready');
        const k8sReadyCondition = node.kubernetesInfo ? 
            (node.kubernetesInfo.conditions || []).find(c => c.type === 'Ready') : null;
        
        const isReady = (longhornReadyCondition && longhornReadyCondition.status === 'True') ||
                       (k8sReadyCondition && k8sReadyCondition.status === 'True');

        const nodeMetrics = this.getNodeMetrics(node);
        
        const card = document.createElement('div');
        card.className = `bg-slate-700/50 border border-slate-600 rounded-lg p-4 cursor-pointer hover:bg-slate-600/50 transition-all ${
            nodeIssues.length > 0 ? 'border-l-4 border-l-red-500' : ''
        }`;
        
        card.innerHTML = `
            <!-- Top line: Node name and status badge -->
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-semibold text-white text-base">${nodeName}</h3>
                <span class="px-2 py-1 text-sm font-medium rounded ${isReady ? 'bg-green-700/80 text-green-200' : 'bg-red-700/80 text-red-200'}">
                    ${isReady ? 'Ready' : 'Not Ready'}
                </span>
            </div>

            <!-- Perfectly aligned metrics using two-column grid -->
            <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm mb-3">
                <span class="text-slate-400 text-right">CPU:</span>
                <span class="text-white font-medium">${nodeMetrics.cpu} cores</span>
                
                <span class="text-slate-400 text-right">Memory:</span>
                <span class="text-white font-medium">${nodeMetrics.memory}</span>
                
                <span class="text-slate-400 text-right">Disks:</span>
                <span class="text-white font-medium">${nodeMetrics.disks}</span>
                
                <span class="text-slate-400 text-right">Pods:</span>
                <span class="text-white font-medium">${node.runningPods || 0}</span>
                
                ${node.kubernetesInfo?.internalIP ? `
                    <span class="text-slate-400 text-right">IP:</span>
                    <span class="text-white font-mono text-sm">${node.kubernetesInfo.internalIP}</span>
                ` : ''}
            </div>

            <!-- Issues indicator if any -->
            ${nodeIssues.length > 0 ? `
                <div class="pt-3 border-t border-slate-600">
                    <div class="text-red-400 text-sm font-medium">[ISSUES] ${nodeIssues.length} issue${nodeIssues.length > 1 ? 's' : ''}</div>
                </div>
            ` : ''}

            <!-- Role tags - Styled as pills for better hierarchy -->
            <div class="pt-2 border-t border-slate-600 mt-3">
                <div class="flex flex-wrap gap-1">
                    ${this.formatRoleTags(node.kubernetesInfo?.roles || ['worker'])}
                </div>
            </div>
        `;
        const pdbHealth = node.pdbHealthStatus;
        let pdbIndicator = '';
        if (pdbHealth && pdbHealth.hasIssues) {
        const severityClass = pdbHealth.severity === 'critical' ? 'text-red-400' : 
                         pdbHealth.severity === 'high' ? 'text-orange-400' : 
                         pdbHealth.severity === 'medium' ? 'text-yellow-400' : 'text-blue-400';
    
        pdbIndicator = `
            <div class="pt-2 border-t border-slate-600 mt-3">
                <div class="${severityClass} text-sm font-medium flex items-center gap-1">
                    <span>[WARNING]</span>
                    PDB: ${pdbHealth.issueCount} issue${pdbHealth.issueCount > 1 ? 's' : ''}
                    <span class="text-xs px-1 py-0.5 rounded ${this.getSeverityBadge(pdbHealth.severity)}">${pdbHealth.severity.toUpperCase()}</span>
                </div>
            </div>
        `;
    }
        card.addEventListener('click', () => ViewManager.showNodeDetail(nodeName));
        return card;
    },

    getNodeMetrics(node) {
        const k8sInfo = node.kubernetesInfo;
        const cpu = k8sInfo?.capacity?.cpu || '0';
        
        let memory = 'N/A';
        if (k8sInfo?.capacity?.memory) {
            const memoryKi = parseInt(k8sInfo.capacity.memory.replace('Ki', ''));
            const memoryGB = (memoryKi / 1024 / 1024).toFixed(1);
            memory = `${memoryGB}GB`;
        }

        const longhornInfo = node.longhornInfo;
        let disks = '0';
        
        if (longhornInfo && longhornInfo.disks) {
            const totalDisks = longhornInfo.disks.length;
            const schedulableDisks = longhornInfo.disks.filter(d => d.isSchedulable).length;
            disks = `${schedulableDisks}/${totalDisks}`;
        }

        return { cpu, memory, disks };
    },

    // Keep these methods for compatibility
    analyzeNodeHealth(node, longhornConditions, k8sCondition) {
        return { healthyDisks: 0, totalDisks: 0, issues: [], warnings: [] };
    },

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const base = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(base));
        return `${parseFloat((bytes / Math.pow(base, i)).toFixed(1))} ${units[i]}`;
    },

    formatRoleTags(roles) {
        if (!roles || roles.length === 0) {
            return '<span class="px-2 py-1 text-xs font-medium rounded-full bg-slate-600/60 text-slate-300">worker</span>';
        }
        
        return roles.map(role => {
            const isControlPlane = role === 'control-plane';
            const bgClass = isControlPlane ? 'bg-blue-600/60 text-blue-200' : 'bg-slate-600/60 text-slate-300';
            return `<span class="px-2 py-1 text-xs font-medium rounded-full ${bgClass}">${role}</span>`;
        }).join('');
    },
    getSeverityBadge(severity) {
        const badges = {
            'critical': 'bg-red-700/80 text-red-200',
            'high': 'bg-orange-700/80 text-orange-200', 
            'medium': 'bg-yellow-700/80 text-yellow-200',
            'low': 'bg-blue-700/80 text-blue-200'
        };
        return badges[severity] || 'bg-slate-700/80 text-slate-200';
    }
};