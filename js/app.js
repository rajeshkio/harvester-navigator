// Main application initialization
class HarvesterDashboardApp {
    constructor() {
        // Store globally for access by other modules
        window.app = this;
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.subscribeToStateChanges();
        this.startDataFetching();
    }

    async startDataFetching() {
        try {
            ViewManager.updateUpgradeStatus('info', 'Connecting to server...'); 
            const response = await fetch('/data');
            
            // Check if the response is ok
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Server error: ${response.status} ${body.trim()}`);
            }
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response');
            }
            
            const data = await response.json();
            AppState.updateData(data);
    
            // Note: upgrade status will be updated by displayUpgradeInfo method
            
        } catch (error) {
            
            
            // Provide user-friendly error messages based on error type
            let userMessage = 'Unable to connect to server';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                userMessage = 'Server is not responding - please check if the backend is running';
            } else if (error.message.includes('500')) {
                userMessage = 'Cluster is unreachable';
            } else if (error.message.includes('404')) {
                userMessage = 'Data endpoint not found - check server configuration';  
            } else if (error.message.includes('JSON')) {
                userMessage = 'Server returned invalid data format'; 
            }
            
            ViewManager.updateUpgradeStatus('error', userMessage);
            
            // Show helpful guidance in the dashboard
            this.showConnectionError(userMessage);
        }
    }
    
    showConnectionError(message) {
        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            dashboard.innerHTML = `
                <div class="text-center py-12">
                    <div class="bg-red-900/20 border border-red-500/30 rounded-lg p-8 max-w-md mx-auto">
                        <div class="text-6xl mb-4">❌</div>
                        <h2 class="text-xl font-semibold text-red-400 mb-3">Connection Error</h2>
                        <p class="text-slate-300 mb-6">${message}</p>
                        
                        <div class="space-y-2 text-sm text-slate-400 mb-6">
                            <div>• Ensure the Harvester cluster is running, or the support bundle simulator is running via harvester-support-bundle-kit</div>
                            <div>• Ensure kubeconfig is present at ~/.sim/admin.kubeconfig</div>
                            <div>• Or set the KUBECONFIG environment variable to the correct path</div>
                        </div>
                        
                        <button id="retry-connection" 
                                class="bg-slate-700 hover:bg-slate-600 px-6 py-2 rounded-lg text-sm transition-colors">
                            <span>Retry Connection</span>
                        </button>
                    </div>
                </div>
            `;
            
            // Add retry functionality
            const retryButton = document.getElementById('retry-connection');
            if (retryButton) {
                retryButton.addEventListener('click', () => {
                    retryButton.innerHTML = '<span class="animate-spin">[...]</span> Connecting...';
                    retryButton.disabled = true;
                    
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                });
            }
        }
    }
    
    bindEvents() {
        const container = document.querySelector('.max-w-screen-2xl') || document.body;
        if (!container) return; // Safety check

        container.addEventListener('click', (event) => {
            // Handle copy button clicks first
            if (event.target.classList.contains('copy-command-btn') || event.target.closest('.copy-command-btn')) {
                event.preventDefault();
                event.stopPropagation();
                
                const button = event.target.classList.contains('copy-command-btn') ? event.target : event.target.closest('.copy-command-btn');
                const command = button.getAttribute('data-copy-text');
                
                if (command) {
                    Utils.copyToClipboard(command);
                }
                return;
            }

            // Find the closest button if a click happens on an element inside a button
            const button = event.target.closest('button');
            if (!button) return;

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
                case 'refresh-btn':
                    this.handleRefresh();
                    break;
            }
        });

        // Direct event listener for back button as backup
        const backButton = document.getElementById('back-button');
        if (backButton) {
            backButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                ViewManager.showDashboard();
            });
        }
    }

    async handleRefresh() {
        const refreshBtn = document.getElementById('refresh-btn');
        const refreshIcon = document.getElementById('refresh-icon');
        
        if (!refreshBtn || !refreshIcon) return;
        
        // Disable button and show spinning animation
        refreshBtn.disabled = true;
        refreshBtn.classList.add('opacity-75', 'cursor-not-allowed');
        refreshIcon.style.animation = 'spin 1s linear infinite';
        
        try {
            ViewManager.updateUpgradeStatus('info', 'Refreshing data...');
            
            const response = await fetch('/data');
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response');
            }
            
            const data = await response.json();
            AppState.updateData(data);
            
            // Success feedback
            refreshIcon.textContent = '✅';
            // Note: upgrade status will be updated by displayUpgradeInfo method
            
            setTimeout(() => {
                refreshIcon.textContent = '🔄';
                refreshIcon.style.animation = '';
            }, 1000);
            
        } catch (error) {
            
            // Error feedback
            refreshIcon.textContent = '❌';
            
            // Provide user-friendly error message
            let userMessage = 'Refresh failed';
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                userMessage = 'Server not responding';
            } else if (error.message.includes('500')) {
                userMessage = 'Server error occurred';
            } else if (error.message.includes('JSON')) {
                userMessage = 'Invalid server response';
            }
            
            ViewManager.updateUpgradeStatus('error', userMessage);
            
            setTimeout(() => {
                refreshIcon.textContent = '🔄';
                refreshIcon.style.animation = '';
            }, 2000);
            
        } finally {
            // Re-enable button
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
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
        const nodeStatuses = upgradeInfo.nodeStatuses || {};
        
        let timeDisplay = 'Unknown';
        if (upgradeTime !== 'Unknown') {
            timeDisplay = Utils.formatTimestamp(upgradeTime);
        }

        let stateColor = 'text-slate-300';
        let stateIcon = 'ℹ️';
        
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
                stateIcon = '⚙️';
                break;
        }

        // Calculate detailed node status breakdown
        let nodeStatusDetails = '';
        if (Object.keys(nodeStatuses).length > 0) {
            const statusGroups = {};
            
            // Group nodes by their status
            Object.entries(nodeStatuses).forEach(([nodeName, nodeInfo]) => {
                // Handle both string status and object with state property
                const status = typeof nodeInfo === 'string' ? nodeInfo : nodeInfo.state;
                if (!statusGroups[status]) {
                    statusGroups[status] = [];
                }
                statusGroups[status].push(nodeName);
            });
            
            const totalNodes = Object.keys(nodeStatuses).length;
            
            // Create detailed status breakdown with node cards (like original UI)
            const nodeStatusCards = [];
            
            // Order matters - show progression from success to stuck states
            const statusOrder = [
                { key: 'Succeeded', icon: '✅', color: 'text-green-400', bgColor: 'bg-green-900/20 border-green-600/30' },
                { key: 'Images preloaded', icon: '📦', color: 'text-blue-400', bgColor: 'bg-blue-900/20 border-blue-600/30' },
                { key: 'Pre-draining', icon: '🔄', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20 border-yellow-600/30' },
                { key: 'Draining', icon: '⏳', color: 'text-orange-400', bgColor: 'bg-orange-900/20 border-orange-600/30' },
                { key: 'Upgrading', icon: '⚙️', color: 'text-purple-400', bgColor: 'bg-purple-900/20 border-purple-600/30' },
                { key: 'Failed', icon: '❌', color: 'text-red-400', bgColor: 'bg-red-900/20 border-red-600/30' }
            ];
            
            statusOrder.forEach(({ key, icon, color, bgColor }) => {
                if (statusGroups[key] && statusGroups[key].length > 0) {
                    const count = statusGroups[key].length;
                    const nodeList = statusGroups[key];
                    
                    nodeStatusCards.push(`
                        <div class="mb-4">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="${color}">${icon}</span>
                                <span class="text-white font-medium">${key}</span>
                                <span class="text-slate-400">${count} node${count > 1 ? 's' : ''}</span>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                                ${nodeList.map(nodeName => `
                                    <div class="border ${bgColor} rounded-lg p-2 text-center">
                                        <div class="text-sm font-medium text-white">${nodeName}</div>
                                        <div class="text-xs ${color}">${key}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `);
                }
            });
            
            // Add any unknown statuses
            Object.entries(statusGroups).forEach(([status, nodes]) => {
                if (!statusOrder.find(s => s.key === status)) {
                    nodeStatusCards.push(`
                        <div class="mb-4">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-slate-300">❓</span>
                                <span class="text-white font-medium">${status}</span>
                                <span class="text-slate-400">${nodes.length} node${nodes.length > 1 ? 's' : ''}</span>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                                ${nodes.map(nodeName => `
                                    <div class="border bg-slate-700/50 border-slate-600/50 rounded-lg p-2 text-center">
                                        <div class="text-sm font-medium text-white">${nodeName}</div>
                                        <div class="text-xs text-slate-300">${status}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `);
                }
            });
            
            nodeStatusDetails = `
                <div id="node-status-details" class="mt-4 pt-4 border-t border-slate-600" style="display: none;">
                    <div class="text-sm mb-3">
                        <span class="text-slate-200 font-medium">Node Upgrade Status (${totalNodes} total):</span>
                    </div>
                    ${nodeStatusCards.join('')}
                </div>
            `;
        }
        const upgradeHtml = `
            <div class="bg-slate-700 p-3 rounded border border-yellow-400">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="${stateColor} text-lg">${stateIcon}</span>
                    <span class="text-slate-200 font-medium">Version:</span>
                    <span class="font-mono text-blue-300 bg-slate-800 px-2 py-1 rounded">${previousVersion}</span>
                    <span class="text-yellow-400 font-bold">→</span>
                    <span class="font-mono text-green-300 font-semibold bg-slate-800 px-2 py-1 rounded">${currentVersion}</span>
                    <span class="text-slate-400">•</span>
                    <span class="text-slate-200 font-medium">Upgraded:</span>
                    <span class="text-slate-200 bg-slate-800 px-2 py-1 rounded">${timeDisplay}</span>
                    <button onclick="window.app.toggleNodeDetails()" class="text-blue-400 hover:text-blue-300 text-sm ml-2">
                        <span id="node-details-toggle">Show Node Details</span>
                    </button>
                </div>
                ${nodeStatusDetails}
            </div>
        `;
        
        const statusElement = document.getElementById('upgrade-status');
        if (statusElement) {
            statusElement.innerHTML = upgradeHtml;
            
            const upgradeContainer = document.getElementById('upgrade-info');
            if (upgradeContainer) {
                upgradeContainer.style.backgroundColor = '#1e293b';
                upgradeContainer.style.border = '2px solid #3b82f6';
                upgradeContainer.style.padding = '8px';
                upgradeContainer.style.borderRadius = '8px';
                upgradeContainer.style.minHeight = '80px';
                upgradeContainer.style.maxWidth = '100%';
            }
        }
    }

    toggleNodeDetails() {
        const details = document.getElementById('node-status-details');
        const toggle = document.getElementById('node-details-toggle');
        
        if (details && toggle) {
            const isHidden = details.style.display === 'none';
            details.style.display = isHidden ? 'block' : 'none';
            toggle.textContent = isHidden ? 'Hide Node Details' : 'Show Node Details';
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new HarvesterDashboardApp();
});