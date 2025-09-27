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
                    Detected Issues
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
                    Detected Issues
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
        
        if (issue.resourceType === 'attachment-tickets-stuck-migration' && issue.attachmentDetails?.migrationStory) {
            const story = issue.attachmentDetails.migrationStory;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${severityIcon}</span>
                        <div>
                            <h4 class="font-semibold text-slate-200 text-sm">${story.headline || issue.title}</h4>
                            <p class="text-slate-300 text-xs mt-1">${story.summary}</p>
                        </div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded ${Utils.getSeverityBadgeClass(issue.severity)}">${issue.severity.toUpperCase()}</span>
                </div>
                
                <div class="mt-2 pt-2 border-t border-slate-600/30">
                    <div class="flex items-center gap-2 text-xs">
                        <span class="text-slate-400">Affected VM:</span>
                        <span class="text-orange-300 font-medium">${issue.vmName}</span>
                    </div>
                    ${story.duration ? `
                        <div class="flex items-center gap-2 text-xs mt-1">
                            <span class="text-slate-400">Duration:</span>
                            <span class="text-red-300 font-medium">${story.duration.humanReadable}</span>
                        </div>
                    ` : ''}
                    <div class="flex items-center gap-2 text-xs mt-1">
                        <span class="text-slate-400">Migration Path:</span>
                        <span class="text-blue-300 font-mono text-xs">${story.migrationPath}</span>
                    </div>
                </div>
            `;
        }
        else if (issue.resourceType?.includes('attachment-tickets') && issue.attachmentDetails) {
            const details = issue.attachmentDetails;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${severityIcon}</span>
                        <div>
                            <h4 class="font-semibold text-slate-200 text-sm">${issue.title}</h4>
                            <p class="text-slate-300 text-xs mt-1">
                                <span class="text-orange-300 font-medium">VM ${issue.vmName}</span> has 
                                <span class="text-red-300 font-medium">${details.ticketCount} attachment tickets</span>
                            </p>
                        </div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded ${Utils.getSeverityBadgeClass(issue.severity)}">${issue.severity.toUpperCase()}</span>
                </div>
                
                <div class="mt-2 pt-2 border-t border-slate-600/30">
                    <div class="text-xs text-slate-400 mb-1">Issue Type:</div>
                    <div class="text-xs text-slate-300">${issue.description}</div>
                </div>
            `;
        }
        // Default display for other issues
        else {

            
        if (issue.resourceType === 'attachment-tickets-stuck-migration' && issue.attachmentDetails?.migrationStory) {
            const story = issue.attachmentDetails.migrationStory;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${severityIcon}</span>
                        <div>
                            <h4 class="font-semibold text-slate-200 text-sm">${story.headline || issue.title}</h4>
                            <p class="text-slate-300 text-xs mt-1">${story.summary}</p>
                        </div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded ${Utils.getSeverityBadgeClass(issue.severity)}">${issue.severity.toUpperCase()}</span>
                </div>
                
                <div class="mt-2 pt-2 border-t border-slate-600/30">
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">Affected VM:</span>
                        <span class="text-orange-300 font-medium">${issue.vmName}</span>
                    </div>
                    ${story.duration ? `
                        <div class="flex items-center justify-between text-xs mt-1">
                            <span class="text-slate-400">Duration:</span>
                            <span class="text-red-300 font-medium">${story.duration.humanReadable}</span>
                        </div>
                    ` : ''}
                    <div class="flex items-center justify-between text-xs mt-1">
                        <span class="text-slate-400">Migration Path:</span>
                        <span class="text-blue-300 font-mono text-xs">${story.migrationPath}</span>
                    </div>
                </div>
            `;
        }
        else if (issue.resourceType?.includes('attachment-tickets') && issue.attachmentDetails) {
            const details = issue.attachmentDetails;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${severityIcon}</span>
                        <div>
                            <h4 class="font-semibold text-slate-200 text-sm">${issue.title}</h4>
                            <p class="text-slate-300 text-xs mt-1">
                                <span class="text-orange-300 font-medium">VM ${issue.vmName}</span> has 
                                <span class="text-red-300 font-medium">${details.ticketCount} attachment tickets</span>
                            </p>
                        </div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded ${Utils.getSeverityBadgeClass(issue.severity)}">${issue.severity.toUpperCase()}</span>
                </div>
     
                <div class="mt-2 pt-2 border-t border-slate-600/30">
                    <div class="text-xs text-slate-400 mb-1">Issue Type:</div>
                    <div class="text-xs text-slate-300">${issue.description}</div>
                </div>
            `;
        }
        // Default display for other issues
        else {
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
        }
        }
        
        card.onclick = () => ViewManager.showIssueDetail(issue.id);
        return card;
    },

    renderMigrationIssueDetail(issue) {
        const attachmentDetails = issue.attachmentDetails;
        const migrationStory = attachmentDetails?.migrationStory;
        const timeline = attachmentDetails?.timeline;
        
        if (!migrationStory) {
            return this.renderGenericIssueDetail(issue);
        }
        
        return `
            <div class="space-y-6">
                <!-- Migration Story Header -->
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xl font-bold text-white">${migrationStory.headline}</h3>
                        <span class="px-3 py-1 text-sm rounded ${Utils.getSeverityBadgeClass(issue.severity)}">
                            ${issue.severity.toUpperCase()}
                        </span>
                    </div>
                    
                    <div class="bg-slate-700/50 rounded-lg p-4 mb-4">
                        <p class="text-slate-200 text-lg">${migrationStory.summary}</p>
                    </div>
                    
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Affected VM</div>
                            <div class="text-orange-300 font-semibold mt-1">${issue.vmName}</div>
                        </div>
                        ${timeline?.duration ? `
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Duration</div>
                            <div class="text-red-300 font-semibold mt-1">${timeline.duration.humanReadable}</div>
                        </div>
                        ` : ''}
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Migration Path</div>
                            <div class="text-blue-300 font-mono mt-1">${migrationStory.migrationPath}</div>
                        </div>
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Risk Level</div>
                            <div class="text-red-400 font-semibold mt-1">${timeline?.riskLevel || 'HIGH'}</div>
                        </div>
                    </div>
                </div>

                <!-- Risk Assessment -->
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                        Risk Assessment
                    </h4>
                    
                    <div class="bg-red-900/20 border border-red-600/30 rounded p-4 mb-4">
                        <div class="text-red-300 font-medium">${migrationStory.riskDescription}</div>
                    </div>
                    
                    ${migrationStory.riskFactors ? `
                    <div class="space-y-2">
                        <div class="text-sm text-slate-400">Risk Factors:</div>
                        <ul class="space-y-1">
                            ${migrationStory.riskFactors.map(factor => `
                                <li class="text-sm text-slate-300 flex items-center gap-2">
                                    <span class="w-1 h-1 bg-slate-500 rounded-full"></span>
                                    ${factor}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    ` : ''}
                </div>

                <!-- Timeline -->
                ${timeline?.events?.length ? `
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                        Migration Timeline
                    </h4>
                    
                    <div class="space-y-3">
                        ${migrationStory.timeline.map((event, index) => `
                            <div class="flex items-start gap-3">
                                <div class="flex flex-col items-center">
                                    <div class="w-3 h-3 rounded-full ${event.type === 'migration' ? 'bg-blue-500' : 'bg-orange-500'}"></div>
                                    ${index < timeline.events.length - 1 ? '<div class="w-px h-4 bg-slate-600 mt-1"></div>' : ''}
                                </div>
                                <div class="flex-1 pb-3">
                                    <div class="text-sm text-slate-200">${event.description || 'Volume operation'}</div>
                                    <div class="text-xs text-slate-400 mt-1">
                                        ${event.date || 'Sep 13, 2025'} ${event.time || '10:00:00 AM'}
                                        ${event.node ? ` • Node: ${event.node}` : ''}
                                        ${event.estimated ? ' (estimated)' : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : timeline?.nodes?.size > 0 ? `
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                        Migration Timeline
                    </h4>
                    
                    <div class="bg-slate-700/30 rounded p-3">
                        <div class="text-sm text-slate-300 mb-2">Migration detected between nodes:</div>
                        <div class="text-sm text-blue-300 font-mono">${Array.from(timeline.nodes).join(' → ')}</div>
                        <div class="text-xs text-slate-400 mt-2">Timeline data not available - this indicates a long-running migration</div>
                    </div>
                </div>
                ` : ''}

                <!-- Immediate Actions -->
                ${migrationStory.nextSteps ? `
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                        Immediate Actions Required
                    </h4>
                    
                    <div class="space-y-2">
                        ${migrationStory.nextSteps.map((step, index) => `
                            <div class="flex items-start gap-3 p-3 bg-slate-700/30 rounded">
                                <span class="text-sm font-medium text-slate-400">${index + 1}.</span>
                                <span class="text-sm text-slate-200">${step}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Verification & Resolution Steps - Side by Side -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Verification Steps -->
                    <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                        <h4 class="text-lg font-medium text-white mb-4">Investigation Steps</h4>
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
                                            <button data-copy-text="${step.command.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">
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
                        <h4 class="text-lg font-medium text-white mb-4">Resolution Steps</h4>
                        <div class="space-y-3">
                            ${issue.remediationSteps.map((step, index) => `
                                <div class="border border-slate-600 rounded p-3">
                                    <h5 class="font-medium text-white mb-2">${index + 1}. ${step.title}</h5>
                                    <div class="text-sm text-slate-300 mb-3">${step.description}</div>
                                    
                                    <div class="bg-slate-900/60 rounded p-2">
                                        <div class="flex justify-between items-center mb-1">
                                            <span class="text-xs text-slate-400">Command:</span>
                                            <button data-copy-text="${step.command.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">
                                                Copy
                                            </button>
                                        </div>
                                        <code class="text-xs text-green-300 font-mono block">${step.command}</code>
                                    </div>
                                    
                                    ${step.warning ? `
                                        <div class="mt-2 text-xs text-yellow-300 flex items-center gap-1">
                                            WARNING: ${step.warning}
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
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
                                    <button data-copy-text="${step.command.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">
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
                            '[PASS] All verification checks passed. Safe to apply fix.' : 
                            '[WARNING] Verification required. Ensure all volumes are healthy before proceeding.'}
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
                                    <button data-copy-text="${step.command.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">
                                        Copy
                                    </button>
                                </div>
                                <code class="text-xs text-green-300 font-mono block">${step.command}</code>
                            </div>
                            
                            ${step.warning ? `
                                <div class="mt-2 text-xs text-yellow-300 flex items-center gap-1">
                                    WARNING: ${step.warning}
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
    },

    // Generic issue detail renderer for non-migration issues
    renderGenericIssueDetail(issue) {
        return `
            <div class="space-y-6">
                <!-- Issue Summary Card -->
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-medium text-white">${issue.title}</h3>
                        <span class="px-3 py-1 text-sm rounded ${Utils.getSeverityBadgeClass(issue.severity)}">
                            ${issue.severity.toUpperCase()}
                        </span>
                    </div>
                    
                    <div class="p-3 bg-slate-700/50 rounded">
                        <div class="text-sm text-slate-300">${issue.description}</div>
                    </div>
                </div>

                <!-- Verification Steps -->
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-4">Verification Steps</h4>
                    <div class="space-y-4">
                        ${issue.verificationSteps.map((step, index) => `
                            <div class="border border-slate-600 rounded p-3">
                                <h5 class="font-medium text-white">${index + 1}. ${step.title}</h5>
                                <div class="text-sm text-slate-300 mb-3">${step.description}</div>
                                
                                <div class="bg-slate-900/60 rounded p-2 mb-2">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-xs text-slate-400">Command:</span>
                                        <button data-copy-text="${step.command.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">
                                            Copy
                                        </button>
                                    </div>
                                    <code class="text-xs text-green-300 font-mono block">${step.command}</code>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    // Main render method that chooses the appropriate renderer
    renderIssueDetail(issue) {
        // Use specific renderer for migration issues
        if (issue.resourceType === 'attachment-tickets-stuck-migration' && issue.attachmentDetails?.migrationStory) {
            return this.renderMigrationIssueDetail(issue);
        }
        // Use existing PDB renderer
        else if (issue.resourceType === 'pdb' && issue.pdbDetails) {
            return this.renderPDBIssueDetail(issue);
        }
        // Use generic renderer for everything else
        else {
            return this.renderGenericIssueDetail(issue);
        }
    }
};
