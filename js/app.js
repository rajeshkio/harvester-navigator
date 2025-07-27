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
