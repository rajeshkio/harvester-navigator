// Node UI rendering
const NodeRenderer = {
    render(nodes, issues) {
        const container = document.getElementById('node-dashboard');
        container.innerHTML = '';
        
        if (!nodes || nodes.length === 0) {
            container.innerHTML = '<p class="text-slate-400 col-span-full text-center py-4">No Longhorn node information found.</p>';
            return;
        }
        
        nodes.forEach(node => {
            const nodeCard = this.createNodeCard(node, issues);
            container.appendChild(nodeCard);
        });
    },
    
    createNodeCard(node, issues) {
        // Extract node name from the nested structure
        const nodeName = node.longhornInfo ? node.longhornInfo.name : (node.name || 'Unknown');
        
        const nodeIssues = issues.filter(issue => 
            issue.resourceType === 'node-not-ready' && issue.resourceName === nodeName
        );
        
        // Check both Longhorn conditions and Kubernetes conditions
        const longhornConditions = node.longhornInfo ? node.longhornInfo.conditions : (node.conditions || []);
        const longhornReadyCondition = longhornConditions.find(c => c.type === 'Ready');
        const k8sReadyCondition = node.kubernetesInfo ? 
            (node.kubernetesInfo.conditions || []).find(c => c.type === 'Ready') : null;
        
        const isReady = (longhornReadyCondition && longhornReadyCondition.status === 'True') ||
                       (k8sReadyCondition && k8sReadyCondition.status === 'True');
        
        const card = document.createElement('div');
        card.className = `bg-slate-800/50 p-3 rounded-md cursor-pointer hover:bg-slate-700/50 transition-colors fade-in ${
            nodeIssues.length > 0 ? 'border-l-4 border-red-500' : ''
        }`;
        
        card.innerHTML = this.getNodeCardHTML(node, nodeIssues, isReady, nodeName);
        
        // Add click event with debugging
        card.addEventListener('click', (e) => {
            console.log('Node card clicked:', nodeName);
            console.log('Node data:', node);
            ViewManager.showNodeDetail(nodeName);
        });
        
        // Ensure the card is clickable
        card.style.cursor = 'pointer';
        
        return card;
    },
    
    getNodeCardHTML(node, nodeIssues, isReady, nodeName) {
        // Extract node roles and IP from Kubernetes data if available
        const roles = node.kubernetesInfo && node.kubernetesInfo.roles ? 
            node.kubernetesInfo.roles.join(', ') : 'worker';
        const ip = node.kubernetesInfo && node.kubernetesInfo.internalIP ? 
            node.kubernetesInfo.internalIP : '';
        
        return `
            <div class="flex justify-between items-center mb-1">
                <h3 class="font-bold text-base text-slate-200">${nodeName}</h3>
                ${nodeIssues.length > 0 ? `<span class="text-red-400 text-xs font-semibold">⚠️ ${nodeIssues.length} issue${nodeIssues.length !== 1 ? 's' : ''}</span>` : ''}
            </div>
            <div class="text-sm space-y-1">
                <div>
                    <span class="text-slate-400">Status:</span> 
                    <span class="${isReady ? 'text-green-400' : 'text-red-400'} font-medium">${isReady ? 'Ready' : 'Not Ready'}</span>
                </div>
                <div>
                    <span class="text-slate-400">Role:</span> 
                    <span class="text-blue-300 font-medium">${roles}</span>
                </div>
                ${ip ? `<div>
                    <span class="text-slate-400">IP:</span> 
                    <span class="text-slate-300 font-mono text-xs">${ip}</span>
                </div>` : ''}
            </div>
        `;
    }
};
