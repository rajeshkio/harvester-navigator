// View navigation and transitions
const ViewManager = {
    currentView: 'dashboard',
    
    showDashboard() {
        this.hideAllViews();
        document.getElementById('dashboard').classList.remove('hidden');
        this.currentView = 'dashboard';
    },
    
    showNodeDetail(nodeName) {
        const nodeData = AppState.data.nodes.find(n => n.name === nodeName);
        if (!nodeData) return;
        
        const detailHTML = DetailRenderer.renderNodeDetail(nodeData, AppState.issues);
        document.getElementById('detail-view').innerHTML = detailHTML;
        
        this.hideAllViews();
        document.getElementById('detail-view-container').classList.remove('hidden');
        this.currentView = 'node-detail';
    },
    
    showVMDetail(vmName) {
        const vmData = AppState.data.vms.find(vm => vm.name === vmName);
        if (!vmData) return;
        
        const detailHTML = DetailRenderer.renderVMDetail(vmData);
        document.getElementById('detail-view').innerHTML = detailHTML;
        
        this.hideAllViews();
        document.getElementById('detail-view-container').classList.remove('hidden');
        this.currentView = 'vm-detail';
    },
    
    showAllIssuesView() {
        const allRealIssues = AppState.getAllRealIssues();
        
        if (allRealIssues.length === 0) {
            return;
        }
        
        const issuesHTML = allRealIssues.map(issue => {
            let severityColor = 'text-slate-400';
            let severityIcon = '⚠️';
            
            switch (issue.severity) {
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
                <div class="bg-slate-800/50 p-4 rounded-md mb-3 cursor-pointer hover:bg-slate-700/50 transition-colors" onclick="ViewManager.showVMDetail('${issue.vmName}')">
                    <div class="flex items-start gap-3">
                        <span class="text-lg">${severityIcon}</span>
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-slate-200 font-semibold">${issue.vmName}</span>
                                <span class="text-slate-400 text-sm">in ${issue.namespace}</span>
                                <span class="${severityColor} font-semibold text-xs uppercase px-2 py-1 bg-slate-700/50 rounded">${issue.severity}</span>
                            </div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-slate-300 text-sm font-medium">${issue.type.toUpperCase()}</span>
                                <span class="text-slate-400 text-sm">•</span>
                                <span class="text-slate-400 text-xs font-mono">${issue.resource}</span>
                            </div>
                            <p class="text-slate-300 text-sm">${issue.message}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        const allIssuesHTML = `
            <div class="card p-4 fade-in">
                <h3 class="font-bold text-xl mb-4 text-slate-100 flex items-center gap-2">
                    <span class="text-red-400">🚨</span>
                    All Detected Issues (${allRealIssues.length})
                </h3>
                <p class="text-slate-400 text-sm mb-4">Click on any issue to view the VM details</p>
                ${issuesHTML}
            </div>
        `;
        
        document.getElementById('detail-view').innerHTML = allIssuesHTML;
        this.hideAllViews();
        document.getElementById('detail-view-container').classList.remove('hidden');
        this.currentView = 'all-issues';
    },
    
    showIssueDetail(issueId) {
        const issue = AppState.issues.find(i => i.id === issueId);
        if (!issue) return;

        const detailHTML = `
            <div class="card p-6 fade-in">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <div class="flex items-center gap-3 mb-3">
                            <span class="text-3xl">${Utils.getSeverityIcon(issue.severity)}</span>
                            <div>
                                <h3 class="text-2xl font-bold text-slate-100">${issue.title}</h3>
                                <span class="text-xs px-2 py-1 rounded ${Utils.getSeverityBadgeClass(issue.severity)}">${issue.severity.toUpperCase()}</span>
                            </div>
                        </div>
                        <p class="text-slate-300 max-w-3xl">${issue.description}</p>
                    </div>
                    <div class="text-right text-sm text-slate-400">
                        <div>Detected: ${Utils.formatTimestamp(issue.detectionTime)}</div>
                        <div class="font-mono text-xs mt-1">ID: ${issue.id}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        <h4 class="text-xl font-bold text-white mb-4 flex items-center gap-2">🔍 Verification Steps</h4>
                        <div class="space-y-4">
                            ${issue.verificationSteps.map((step, index) => `
                                <div class="verification-step border-l-4 border-slate-600 bg-slate-850 p-4 rounded-r-lg">
                                    <h5 class="font-semibold text-slate-200 mb-2">${index + 1}. ${step.title}</h5>
                                    <p class="text-sm text-slate-400 mb-3">${step.description}</p>
                                    <div class="bg-slate-950 p-3 rounded font-mono text-sm text-green-300 mb-2 relative group">
                                        <span class="text-cyan-400">$</span> ${step.command}
                                        <button onclick="Utils.copyToClipboard('${step.command}')" class="absolute top-2 right-2 bg-slate-700 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                            📋
                                        </button>
                                    </div>
                                    <div class="text-xs text-slate-500">Expected: ${step.expectedOutput}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div>
                        <h4 class="text-xl font-bold text-white mb-4 flex items-center gap-2">🛠️ Remediation Steps</h4>
                        <div class="space-y-4">
                            ${issue.remediationSteps.map((step, index) => `
                                <div class="verification-step border-l-4 border-slate-600 bg-slate-850 p-4 rounded-r-lg">
                                    <div class="flex justify-between items-center mb-2">
                                        <h5 class="font-semibold text-slate-200">${index + 1}. ${step.title}</h5>
                                        <button onclick="Utils.copyToClipboard('${step.command}')" class="bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">
                                            📋 Copy
                                        </button>
                                    </div>
                                    <p class="text-sm text-slate-400 mb-3">${step.description}</p>
                                    ${step.command.startsWith('#') ? 
                                        `<div class="bg-slate-950 p-3 rounded font-mono text-sm text-slate-500 italic">${step.command}</div>` : 
                                        `<div class="bg-slate-950 p-3 rounded font-mono text-sm text-green-300">
                                            <span class="text-cyan-400">$</span> ${step.command}
                                        </div>`
                                    }
                                    ${step.warning ? `<div class="mt-2 text-xs text-yellow-400 bg-yellow-500/10 p-2 rounded flex items-center gap-2">⚠️ ${step.warning}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="mt-6 bg-slate-800/30 p-4 rounded-lg">
                    <h4 class="font-bold text-slate-200 mb-2">Affected Resources</h4>
                    <div class="flex gap-2 flex-wrap">
                        <span class="bg-slate-700 px-2 py-1 rounded text-xs">${issue.affectedResource}</span>
                        <span class="bg-slate-700 px-2 py-1 rounded text-xs">Category: ${issue.category}</span>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('issue-detail-view').innerHTML = detailHTML;
        this.hideAllViews();
        document.getElementById('issue-detail-container').classList.remove('hidden');
        this.currentView = 'issue-detail';
    },
    
    hideAllViews() {
        ['dashboard', 'detail-view-container', 'all-issues-container', 'issue-detail-container'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
    },
    
    updateUpgradeStatus(type, message) {
        const colorMap = { 
            info: 'text-slate-300', 
            error: 'text-red-400', 
            success: 'text-green-400' 
        };
        const iconMap = { 
            info: '📋', 
            error: '❌', 
            success: '✅' 
        };
        
        document.getElementById('upgrade-status').innerHTML = 
            `<span class="${colorMap[type]}">${iconMap[type]} ${message}</span>`;
    }
};
