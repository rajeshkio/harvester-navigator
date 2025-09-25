// Issue UI rendering
const IssueRenderer = {
    renderOverview(issues) {
        const realIssuesCount = issues.filter(issue => 
            issue.severity !== 'info' && issue.severity !== 'information'
        ).length;
        
        const overviewContainer = document.getElementById('issues-overview');
        
        // Always show the overview container
        overviewContainer.classList.remove('hidden');
        
        if (realIssuesCount === 0) {
            // Show "no known issues" state
            this.renderNoIssuesState(overviewContainer);
        } else {
            // Show actual issues
            this.renderIssuesState(overviewContainer, issues, realIssuesCount);
        }
    },
    
    renderNoIssuesState(container) {
        container.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-slate-200 flex items-center gap-2">
                    🚨 Detected Issues
                    <span class="bg-slate-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">0</span>
                </h2>
            </div>
            <div class="bg-slate-800/30 p-4 rounded-md border border-slate-600/30">
                <p class="text-slate-300 text-center">No known issues found</p>
            </div>
        `;
    },
    
    renderIssuesState(container, issues, realIssuesCount) {
        container.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-slate-200 flex items-center gap-2">
                    🚨 Detected Issues
                    <span id="issue-count" class="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">${realIssuesCount}</span>
                </h2>
                <button id="view-all-issues-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm">
                    View All Issues
                </button>
            </div>
            <div id="critical-issues-preview" class="space-y-2"></div>
        `;
        
        const criticalIssues = issues.filter(issue => 
            (issue.severity === 'critical' || issue.severity === 'high') &&
            issue.severity !== 'info' && issue.severity !== 'information'
        );
        
        const previewContainer = document.getElementById('critical-issues-preview');
        
        criticalIssues.slice(0, 3).forEach(issue => {
            const issueCard = this.createIssuePreviewCard(issue);
            previewContainer.appendChild(issueCard);
        });

        if (criticalIssues.length > 3) {
            const moreCard = document.createElement('div');
            moreCard.className = 'text-sm text-slate-400 p-2 text-center';
            moreCard.innerHTML = `+${criticalIssues.length - 3} more critical issues...`;
            previewContainer.appendChild(moreCard);
        }
    },
    
    createIssuePreviewCard(issue) {
        const card = document.createElement('div');
        const severityClass = `issue-${issue.severity}`;
        const severityIcon = Utils.getSeverityIcon(issue.severity);
        
        card.className = `${severityClass} bg-slate-800/30 p-3 rounded-lg cursor-pointer hover:bg-slate-700/30 transition-colors`;
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <span class="text-lg">${severityIcon}</span>
                    <div>
                        <h4 class="font-semibold text-slate-200 text-sm">${issue.title}</h4>
                        <p class="text-slate-400 text-xs">${issue.affectedResource}</p>
                    </div>
                </div>
                <span class="text-xs px-2 py-1 rounded ${Utils.getSeverityBadgeClass(issue.severity)}">${issue.severity.toUpperCase()}</span>
            </div>
        `;
        
        card.onclick = () => ViewManager.showIssueDetail(issue.id);
        return card;
    },
    renderPDBIssueDetail(issue) {
    const pdbDetails = issue.pdbDetails;
    
    return `
        <div class="space-y-6">
            <!-- Issue Summary Card -->
            <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-medium text-white">PDB Issue Details</h3>
                    <span class="px-3 py-1 text-sm rounded ${Utils.getSeverityBadgeClass(issue.severity)}">
                        ${issue.severity.toUpperCase()}
                    </span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                        <span class="text-slate-400">Resource:</span>
                        <span class="text-white ml-2">${issue.resourceName}</span>
                    </div>
                    <div>
                        <span class="text-slate-400">Node:</span>
                        <span class="text-white ml-2">${issue.nodeName}</span>
                    </div>
                    <div>
                        <span class="text-slate-400">Issue Type:</span>
                        <span class="text-white ml-2">${issue.pdbIssueType.replace(/_/g, ' ')}</span>
                    </div>
                    <div>
                        <span class="text-slate-400">Safety Status:</span>
                        <span class="${pdbDetails.canSafelyDelete ? 'text-green-400' : 'text-yellow-400'} ml-2">
                            ${pdbDetails.canSafelyDelete ? 'Safe to fix' : 'Exercise caution'}
                        </span>
                    </div>
                </div>
                
                <div class="p-3 bg-slate-700/50 rounded">
                    <div class="text-sm text-slate-300">${issue.description}</div>
                </div>
                
                ${pdbDetails.staleEngines && pdbDetails.staleEngines.length > 0 ? `
                <div class="mt-3 text-sm">
                    <div class="text-slate-400 mb-1">Phantom Engines:</div>
                    <div class="text-red-300 font-mono text-xs">
                        ${pdbDetails.staleEngines.slice(0, 3).join(', ')}
                        ${pdbDetails.staleEngines.length > 3 ? ` (+${pdbDetails.staleEngines.length - 3} more)` : ''}
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Verification Steps -->
            <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                <h4 class="text-lg font-medium text-white mb-4">Verification Steps</h4>
                <div class="space-y-4">
                    ${issue.verificationSteps.map((step, index) => `
                        <div class="border border-slate-600 rounded p-3">
                            <div class="flex justify-between items-start mb-2">
                                <h5 class="font-medium text-white">${index + 1}. ${step.title}</h5>
                            </div>
                            <div class="text-sm text-slate-300 mb-3">${step.description}</div>
                            
                            <div class="bg-slate-900/60 rounded p-2 mb-2">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs text-slate-400">Command:</span>
                                    onclick="Utils.copyToClipboard('${step.command.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" 
                                            class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs">
                                        Copy
                                    </button>
                                </div>
                                <code class="text-xs text-green-300 font-mono block">${step.command}</code>
                            </div>
                            
                            ${step.expectedOutput ? `
                                <div class="text-xs text-slate-400">
                                    Expected: ${step.expectedOutput}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Resolution Steps -->
            <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                <h4 class="text-lg font-medium text-white mb-4">Resolution</h4>
                
                <div class="mb-4 p-3 ${pdbDetails.canSafelyDelete ? 'bg-green-900/20 border border-green-600/30' : 'bg-yellow-900/20 border border-yellow-600/30'} rounded">
                    <div class="text-sm ${pdbDetails.canSafelyDelete ? 'text-green-300' : 'text-yellow-300'}">
                        ${pdbDetails.canSafelyDelete ? 
                            '✅ All verification checks passed. Safe to apply fix.' : 
                            '⚠️ Verification required. Ensure all volumes are healthy before proceeding.'}
                    </div>
                </div>
                
                <div class="space-y-3">
                    ${issue.remediationSteps.map((step, index) => `
                        <div class="border border-slate-600 rounded p-3">
                            <h5 class="font-medium text-white mb-2">${index + 1}. ${step.title}</h5>
                            <div class="text-sm text-slate-300 mb-3">${step.description}</div>
                            
                            <div class="bg-slate-900/60 rounded p-2">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs text-slate-400">Command:</span>
                                    <button onclick="Utils.copyToClipboard('${step.command.replace(/'/g, "\\'")}')" 
                                            class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">
                                        Copy
                                    </button>
                                </div>
                                <code class="text-xs text-green-300 font-mono block">${step.command}</code>
                            </div>
                            
                            ${step.warning ? `
                                <div class="mt-2 text-xs text-yellow-300 flex items-center gap-1">
                                    ⚠️ ${step.warning}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Last Checked -->
            <div class="text-xs text-slate-400 text-center">
                Last checked: ${Utils.formatTimestamp(pdbDetails.lastChecked)}
            </div>
        </div>
    `;
}
};
