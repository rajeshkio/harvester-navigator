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
        const nodeIssues = issues.filter(issue => 
            issue.resourceType === 'node-not-ready' && issue.resourceName === node.name
        );
        
        const readyCondition = (node.conditions || []).find(c => c.type === 'Ready');
        const isReady = readyCondition && readyCondition.status === 'True';
        
        const card = document.createElement('div');
        card.className = `bg-slate-800/50 p-3 rounded-md cursor-pointer hover:bg-slate-700/50 transition-colors fade-in ${
            nodeIssues.length > 0 ? 'border-l-4 border-red-500' : ''
        }`;
        
        card.innerHTML = this.getNodeCardHTML(node, nodeIssues, isReady);
        card.addEventListener('click', () => ViewManager.showNodeDetail(node.name));
        
        return card;
    },
    
    getNodeCardHTML(node, nodeIssues, isReady) {
        return `
            <div class="flex justify-between items-center mb-1">
                <h3 class="font-bold text-base text-slate-200">${node.name}</h3>
                ${nodeIssues.length > 0 ? `<span class="text-red-400 text-xs font-semibold">⚠️ ${nodeIssues.length} issue${nodeIssues.length !== 1 ? 's' : ''}</span>` : ''}
            </div>
            <div class="text-sm">
                <span class="text-slate-400">Status:</span> 
                <span class="${isReady ? 'text-green-400' : 'text-red-400'} font-medium">${isReady ? 'Ready' : 'Not Ready'}</span>
            </div>
        `;
    }
};
