// Main application initialization
class HarvesterDashboardApp {
    constructor() {
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.subscribeToStateChanges();
        WebSocketManager.connect();
    }
    
    bindEvents() {
        const container = document.querySelector('.container.mx-auto');
        if (!container) return; // Safety check

        container.addEventListener('click', (event) => {
            // Find the closest button if a click happens on an element inside a button
            const button = event.target.closest('button');
            if (!button) return; // Exit if the click wasn't on or inside a button

            switch (button.id) {
                case 'back-button':
                    ViewManager.showDashboard();
                    break;
                case 'back-from-all-issues':
                    ViewManager.showDashboard();
                    break;
                case 'view-all-issues-btn':
                    ViewManager.showAllIssuesView();
                    break;
                case 'back-from-issue':
                    if (AppState.getAllRealIssues().length > 0) {
                        ViewManager.showAllIssuesView();
                    } else {
                        ViewManager.showDashboard();
                    }
                    break;
            }
        });
    }
    
    subscribeToStateChanges() {
        AppState.subscribe((data, issues) => {
            NodeRenderer.render(data.nodes || [], issues);
            VMRenderer.render(data.vms || [], issues);
            IssueRenderer.renderOverview(issues);
            
            if (data.upgradeInfo) {
                this.displayUpgradeInfo(data.upgradeInfo);
            } else {
                ViewManager.updateUpgradeStatus('info', 'No upgrade information available');
            }
        });
    }
    
    displayUpgradeInfo(upgradeInfo) {
    const currentVersion = upgradeInfo.version || 'Unknown';
    const previousVersion = upgradeInfo.previousVersion || 'Unknown';
    const upgradeTime = upgradeInfo.upgradeTime || 'Unknown';
    const state = upgradeInfo.state || 'Unknown';
    
    let timeDisplay = 'Unknown';
    if (upgradeTime !== 'Unknown') {
        timeDisplay = Utils.formatTimestamp(upgradeTime);
    }

    let stateColor = 'text-slate-300';
    let stateIcon = '📋';
    
    switch (state.toLowerCase()) {
        case 'succeeded':
            stateColor = 'text-green-400';
            stateIcon = '✅';
            break;
        case 'failed':
            stateColor = 'text-red-400';
            stateIcon = '❌';
            break;
        case 'upgrading':
        case 'upgradingsystemservices':
        case 'upgradingnodes':
            stateColor = 'text-yellow-400';
            stateIcon = '🔄';
            break;
    }

    // Process node statuses from existing data
    const nodeStatuses = upgradeInfo.nodeStatuses || {};
    const nodeCount = Object.keys(nodeStatuses).length;
    let nodeStatusHtml = '';
    
    if (nodeCount > 0) {
        // Count nodes by status
        const statusCounts = {};
        Object.values(nodeStatuses).forEach(status => {
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        // Generate badges for each status type
        const badges = Object.entries(statusCounts).map(([status, count]) => {
            let icon = '❓';
            let color = 'text-slate-400';
            
            // Map your node status strings to icons and colors
            if (status.toLowerCase().includes('preloaded')) {
                icon = '📦';
                color = 'text-blue-400';
            } else if (status.toLowerCase().includes('upgraded') || status.toLowerCase().includes('complete')) {
                icon = '✅';
                color = 'text-green-400';
            } else if (status.toLowerCase().includes('upgrading') || status.toLowerCase().includes('rebooting')) {
                icon = '🔄';
                color = 'text-yellow-400';
            } else if (status.toLowerCase().includes('failed') || status.toLowerCase().includes('error')) {
                icon = '❌';
                color = 'text-red-400';
            } else if (status.toLowerCase().includes('preparing')) {
                icon = '⏳';
                color = 'text-yellow-400';
            }
            
            return `<span class="inline-flex items-center gap-1 px-2 py-1 bg-slate-800/50 rounded-full text-xs">
                      <span class="${color}">${icon}</span>
                      <span class="text-slate-300">${count}</span>
                    </span>`;
        }).join('');
        
        nodeStatusHtml = `
            <span class="text-slate-400">•</span>
            <span class="text-slate-400">Nodes:</span>
            <div class="flex items-center gap-1">${badges}</div>
        `;
    }

    const upgradeHtml = `
        <div class="flex flex-col items-center justify-center gap-3 text-sm">
            <div class="flex flex-col sm:flex-row items-center justify-center gap-2">
                <div class="flex items-center gap-2">
                    <span class="${stateColor}">${stateIcon}</span>
                    <span class="text-slate-400">Version:</span>
                    <span class="font-mono text-blue-300">${previousVersion}</span>
                    <span class="text-slate-400">→</span>
                    <span class="font-mono text-green-300 font-semibold">${currentVersion}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-400">•</span>
                    <span class="text-slate-400">Upgraded:</span>
                    <span class="text-slate-300">${timeDisplay}</span>
                </div>
            </div>
            <div class="flex flex-col sm:flex-row items-center justify-center gap-2">
                <div class="flex items-center gap-2">
                    <span class="text-slate-400">Status:</span>
                    <span class="${stateColor} font-medium">${state}</span>
                </div>
                ${nodeStatusHtml}
            </div>
            ${nodeCount > 0 ? `
                <button 
                    id="toggle-node-details" 
                    class="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer"
                    onclick="this.nextElementSibling.classList.toggle('hidden'); this.textContent = this.textContent.includes('Show') ? 'Hide Node Details' : 'Show Node Details'"
                >
                    Show Node Details
                </button>
                <div id="node-upgrade-details" class="hidden w-full max-w-4xl">
                    ${this.generateNodeDetailsGrid(nodeStatuses)}
                </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('upgrade-status').innerHTML = upgradeHtml;
}

// Helper function to generate detailed node view
generateNodeDetailsGrid(nodeStatuses) {
    const nodeEntries = Object.entries(nodeStatuses);
    
    if (nodeEntries.length === 0) {
        return '<p class="text-slate-400 text-center py-4">No node status information available</p>';
    }

    // Group nodes by status for better organization
    const statusGroups = {};
    nodeEntries.forEach(([nodeName, status]) => {
        if (!statusGroups[status]) {
            statusGroups[status] = [];
        }
        statusGroups[status].push(nodeName);
    });

    const groupsHtml = Object.entries(statusGroups)
        .sort((a, b) => b[1].length - a[1].length) // Sort by count
        .map(([status, nodes]) => {
            let icon = '❓';
            let color = 'text-slate-400';
            let bgClass = 'bg-slate-800/30';
            let borderClass = 'border-slate-700/50';
            
            // Map your status strings to visual styling
            if (status.toLowerCase().includes('preloaded')) {
                icon = '📦'; color = 'text-blue-400'; 
                bgClass = 'bg-blue-500/10'; borderClass = 'border-blue-500/30';
            } else if (status.toLowerCase().includes('upgraded') || status.toLowerCase().includes('complete')) {
                icon = '✅'; color = 'text-green-400';
                bgClass = 'bg-green-500/10'; borderClass = 'border-green-500/30';
            } else if (status.toLowerCase().includes('upgrading') || status.toLowerCase().includes('rebooting')) {
                icon = '🔄'; color = 'text-yellow-400';
                bgClass = 'bg-yellow-500/10'; borderClass = 'border-yellow-500/30';
            } else if (status.toLowerCase().includes('failed') || status.toLowerCase().includes('error')) {
                icon = '❌'; color = 'text-red-400';
                bgClass = 'bg-red-500/10'; borderClass = 'border-red-500/30';
            }
            
            const nodesHtml = nodes.map(nodeName => `
                <div class="${bgClass} border ${borderClass} px-3 py-2 rounded">
                    <div class="font-mono text-sm text-slate-200">${nodeName}</div>
                    <div class="text-xs text-slate-400">${status}</div>
                </div>
            `).join('');

            return `
                <div class="mb-4">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700/50">
                        <span class="${color} text-lg">${icon}</span>
                        <span class="font-semibold text-slate-200">${status}</span>
                        <span class="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded-full">${nodes.length} node${nodes.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        ${nodesHtml}
                    </div>
                </div>
            `;
        }).join('');

    return `
        <div class="bg-slate-800/20 border border-slate-700/30 rounded-lg p-4 mt-2">
            <h4 class="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <span>🖥️</span>
                Node Upgrade Status (${nodeEntries.length} total)
            </h4>
            ${groupsHtml}
        </div>
    `;
}

}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new HarvesterDashboardApp();
});