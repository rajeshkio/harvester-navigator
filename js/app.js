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
        document.getElementById('back-button').onclick = () => ViewManager.showDashboard();
        document.getElementById('back-from-issue').onclick = () => {
            if (AppState.issues.length > 0) {
                ViewManager.showAllIssuesView();
            } else {
                ViewManager.showDashboard();
            }
        };
        document.getElementById('back-from-all-issues').onclick = () => ViewManager.showDashboard();
        document.getElementById('view-all-issues-btn').onclick = () => ViewManager.showAllIssuesView();

        document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'view-all-issues-global') {
            ViewManager.showAllIssuesView();
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
                stateColor = 'text-yellow-400';
                stateIcon = '🔄';
                break;
        }

        const upgradeHtml = `
            <div class="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm">
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
                    <span class="text-slate-400">•</span>
                    <span class="text-slate-400">Status:</span>
                    <span class="${stateColor} font-medium">${state}</span>
                </div>
            </div>
        `;
        
        document.getElementById('upgrade-status').innerHTML = upgradeHtml;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new HarvesterDashboardApp();
});
