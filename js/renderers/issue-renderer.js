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
        const vm = AppState.data?.vms?.find(v =>
            v.name === issue.vmName && v.namespace === issue.vmNamespace
        );

        const replicaHealthCard = (issue.resourceType === 'replica-faulted' && vm)
            ? this.renderReplicaHealthCard(vm, issue)
            : '';

        return `
            <div class="space-y-6">
                <!-- Issue Summary -->
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

                ${replicaHealthCard}

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

    renderReplicaHealthCard(vm, issue) {
        const replicas = vm.replicaInfo || [];
        const volumeName = vm.volumeName || issue.resourceName || 'unknown';
        const totalExpected = vm.volumeNumberOfReplicas || replicas.length;

        const faulted = replicas.filter(r => r.currentState !== 'running' || !r.started);
        const healthy = replicas.filter(r => r.currentState === 'running' && r.started);

        // Root cause summary — disk pressure is the most actionable finding
        const diskPressureReplicas = faulted.filter(r => r.diskPressure);
        const maxRetriesReplicas  = faulted.filter(r => r.rebuildRetryCount >= 5);

        const rootCauseBanner = diskPressureReplicas.length > 0 ? `
            <div class="flex items-start gap-3 p-3 bg-red-900/40 border border-red-600 rounded-lg mb-4">
                <span class="text-red-400 text-lg mt-0.5">⚠</span>
                <div>
                    <div class="text-sm font-semibold text-red-300">Root Cause: Disk Pressure</div>
                    <div class="text-xs text-red-200 mt-1">
                        ${diskPressureReplicas.length} replica${diskPressureReplicas.length > 1 ? 's are' : ' is'} on a disk marked
                        <span class="font-mono bg-red-900/60 px-1 rounded">Schedulable: False</span>
                        due to disk pressure. Longhorn cannot start the replica process.
                        ${maxRetriesReplicas.length > 0 ? `Rebuild has been attempted and exhausted (${maxRetriesReplicas[0].rebuildRetryCount} retries).` : ''}
                    </div>
                </div>
            </div>` : '';

        const replicaRows = replicas.map(r => {
            const isHealthy = r.currentState === 'running' && r.started;
            const hasDiskPressure = r.diskPressure;
            const retriesExhausted = r.rebuildRetryCount >= 5;

            const stateColor = isHealthy ? 'text-green-400' : 'text-red-400';
            const stateDot   = isHealthy ? 'bg-green-400' : 'bg-red-400';
            const stateLabel = isHealthy ? 'running' : r.currentState || 'stopped';

            // Reason column — most specific explanation available
            let reason = '';
            if (!isHealthy) {
                if (hasDiskPressure) {
                    reason = `<span class="text-red-300">Disk pressure</span>
                              ${retriesExhausted ? '<span class="text-slate-400 ml-1">(retries exhausted)</span>' : ''}`;
                } else if (retriesExhausted) {
                    reason = `<span class="text-orange-300">Max retries reached (${r.rebuildRetryCount})</span>`;
                } else if (r.desireState === 'running') {
                    reason = `<span class="text-yellow-300">Desired running, not yet started</span>`;
                } else {
                    reason = `<span class="text-slate-400">Unknown</span>`;
                }
            }

            const rawMsg = r.diskPressureMsg || '';
            const trimmedMsg = rawMsg.trim();
            const diskPressureDetail = hasDiskPressure && trimmedMsg ? `
                <div class="mt-2 ml-4 p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-200 font-mono whitespace-pre-wrap break-all">${trimmedMsg}</div>` : '';

            return `
                <div class="border border-slate-600 rounded-lg p-3 ${isHealthy ? '' : 'border-red-700/50 bg-red-900/10'}">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="w-2 h-2 rounded-full ${stateDot} flex-shrink-0"></span>
                        <span class="text-sm font-mono text-white truncate flex-1">${r.name}</span>
                        <span class="text-xs px-2 py-0.5 rounded font-mono ${stateColor} bg-slate-800">${stateLabel}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs ml-4">
                        <div class="text-slate-400">Node</div>
                        <div class="text-slate-200 font-mono">${r.nodeId || '—'}</div>
                        <div class="text-slate-400">Disk</div>
                        <div class="text-slate-200 font-mono truncate" title="${r.diskPath || r.diskId || '—'}">${r.diskPath || r.diskId || '—'}</div>
                        <div class="text-slate-400">Disk schedulable</div>
                        <div class="${r.diskSchedulable ? 'text-green-400' : 'text-red-400'}">${r.diskSchedulable ? 'Yes' : 'No'}</div>
                        ${!isHealthy ? `<div class="text-slate-400">Rebuild retries</div>
                        <div class="${retriesExhausted ? 'text-red-400' : 'text-slate-200'}">${r.rebuildRetryCount ?? '—'} / 5</div>
                        <div class="text-slate-400">Reason</div>
                        <div>${reason}</div>` : ''}
                    </div>
                    ${diskPressureDetail}
                </div>`;
        }).join('');

        return `
            <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="text-base font-medium text-white">Replica Health</h4>
                    <div class="flex gap-3 text-xs">
                        <span class="text-green-400">${healthy.length} healthy</span>
                        <span class="text-red-400">${faulted.length} faulted</span>
                        <span class="text-slate-400">of ${totalExpected} expected</span>
                    </div>
                </div>

                <div class="text-xs text-slate-400 font-mono mb-3 truncate" title="${volumeName}">
                    Volume: ${volumeName}
                </div>

                ${rootCauseBanner}

                <div class="space-y-3">
                    ${replicaRows}
                </div>
            </div>
        `;
    },

    // Main render method that chooses the appropriate renderer
    testLogAnalysis(issueId, issueType, vmName) {
        const issue = AppState.issues.find(i => i.id === issueId);
        if (!issue) {
            console.error('Issue not found:', issueId);
            return;
        }
        
        const vm = AppState.data?.vms?.find(v => 
            v.name === issue.vmName && v.namespace === issue.vmNamespace
        );
        
        const resultDiv = document.getElementById(`test-log-result-${issueId}`);
        resultDiv.innerHTML = '<div class="text-yellow-300 flex items-center gap-2"><span class="animate-pulse">●</span> Analyzing logs...</div>';
        
        const requestBody = {
            issue_id: issue.id,
            issue_type: issue.resourceType,
            vm_name: issue.vmName || '',
            namespace: issue.vmNamespace || '',
            volume_name: vm?.volumeName || '',
            volume_robustness: vm?.volumeRobustness || '',
            volume_state: vm?.volumeState || '',
            replica_count: vm?.replicaInfo?.length || 0,
            faulted_count: vm?.replicaInfo?.filter(r => r.currentState === 'error' || !r.started).length || 0,
            source_node: issue.sourceNode || '',
            target_node: issue.targetNode || '',
            time_window: '1h',
            provider: document.getElementById(`ai-provider-select-${issueId}`)?.value || 'pattern-engine'
        };
        
        fetch('/api/analyze-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        })
        .then(res => {
            if (!res.ok) {
                return res.text().then(text => { throw new Error(text); });
            }
            return res.json();
        })
        .then(data => {
            const isPatternEngine = data.provider === 'pattern-engine';
            const confidenceColor = data.confidence === 'high' ? 'text-green-300' : data.confidence === 'medium' ? 'text-yellow-300' : 'text-slate-300';
            const providerBadge = isPatternEngine
                ? '<span class="px-2 py-0.5 text-xs rounded bg-blue-700/60 text-blue-200">offline / no API cost</span>'
                : `<span class="px-2 py-0.5 text-xs rounded bg-purple-700/60 text-purple-200">LLM</span>`;

            const errorLinesHtml = data.error_lines && data.error_lines.length > 0
                ? `<div class="mt-3 pt-3 border-t border-slate-600">
                    <div class="text-xs text-slate-400 mb-1">Evidence from logs:</div>
                    <div class="space-y-1 max-h-64 overflow-y-auto">
                        ${data.error_lines.slice(0, 10).map(line =>
                            `<code class="text-xs text-orange-300 font-mono block whitespace-pre-wrap break-all">${line}</code>`
                        ).join('')}
                    </div>
                   </div>`
                : '';

            resultDiv.innerHTML = `
                <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 space-y-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-green-400 font-medium">Analysis Complete</span>
                            ${providerBadge}
                        </div>
                        <span class="${confidenceColor} text-xs font-medium uppercase">${data.confidence} confidence</span>
                    </div>
                    <div class="text-xs text-slate-400">Provider: <span class="text-slate-200">${data.provider}</span></div>
                    <div>
                        <span class="text-xs text-slate-400">Root Cause:</span>
                        <div class="text-sm text-white mt-0.5">${data.root_cause}</div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <span class="text-slate-400">Component:</span>
                            <span class="text-orange-300 ml-1">${data.failing_component}</span>
                        </div>
                        ${data.estimated_cost > 0 ? `<div><span class="text-slate-400">Cost:</span> <span class="text-slate-200 ml-1">$${data.estimated_cost.toFixed(5)}</span></div>` : ''}
                    </div>
                    <div>
                        <span class="text-xs text-slate-400">Recommended Action:</span>
                        <div class="text-sm text-blue-200 mt-0.5">${data.recommended_action}</div>
                    </div>
                    ${errorLinesHtml}
                </div>
            `;
        })
        .catch(err => {
            resultDiv.innerHTML = `<div class="text-red-300 text-xs p-3 bg-red-900/20 rounded border border-red-600/30">Error: ${err.message}</div>`;
        });
    },
    renderUpgradeBlockedMigrationDetail(issue) {
        const ud = issue.upgradeDetails || {};
        const stuckNodes = ud.stuckPreDrainNodes || [];
        const migrations = ud.pendingMigrations || [];

        return `
            <div class="space-y-6">
                <!-- Upgrade Blocked Header -->
                <div class="bg-slate-800/60 border border-red-600/50 rounded-lg p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xl font-bold text-white">VM Migration Blocked - Upgrade Stuck</h3>
                        <span class="px-3 py-1 text-sm rounded ${Utils.getSeverityBadgeClass(issue.severity)}">
                            ${issue.severity.toUpperCase()}
                        </span>
                    </div>

                    <div class="bg-red-900/20 border border-red-600/30 rounded-lg p-4 mb-4">
                        <p class="text-slate-200">${issue.description}</p>
                    </div>

                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Upgrade Path</div>
                            <div class="text-blue-300 font-semibold mt-1">${ud.previousVersion || 'Unknown'} &rarr; ${ud.version || 'Unknown'}</div>
                        </div>
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Upgrade State</div>
                            <div class="text-orange-300 font-semibold mt-1">${ud.state || 'Unknown'}</div>
                        </div>
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Affected VM</div>
                            <div class="text-orange-300 font-semibold mt-1">${issue.vmNamespace}/${issue.vmName}</div>
                        </div>
                        <div class="bg-slate-700/30 rounded p-3">
                            <div class="text-slate-400 text-xs uppercase tracking-wide">Blocked VMs (cluster)</div>
                            <div class="text-red-300 font-semibold mt-1">${ud.stuckPreDrainVMCount || 'N/A'}</div>
                        </div>
                    </div>
                </div>

                <!-- Stuck Nodes -->
                ${stuckNodes.length > 0 ? `
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-3">Nodes Stuck in Pre-draining</h4>
                    <div class="space-y-2">
                        ${stuckNodes.map(node => `
                            <div class="flex items-center gap-2 p-2 bg-slate-700/30 rounded">
                                <span class="w-2 h-2 bg-red-500 rounded-full"></span>
                                <span class="text-slate-200 font-mono text-sm">${node}</span>
                                <span class="text-xs text-red-300 ml-auto">Pre-draining</span>
                            </div>
                        `).join('')}
                    </div>
                    <p class="text-xs text-slate-400 mt-3">These nodes cannot complete draining because VM migrations are blocked by CPU feature label mismatch.</p>
                </div>
                ` : ''}

                <!-- Pending Migrations -->
                ${migrations.length > 0 ? `
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-3">Stuck Migrations</h4>
                    <div class="space-y-2">
                        ${migrations.map(m => `
                            <div class="p-3 bg-slate-700/30 rounded border border-slate-600/50">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-slate-200 font-mono text-sm">${m.name || 'unknown'}</span>
                                    <span class="text-xs px-2 py-0.5 rounded bg-yellow-600/30 text-yellow-300">${m.phase}</span>
                                </div>
                                <div class="grid grid-cols-2 gap-2 text-xs mt-2">
                                    <div><span class="text-slate-400">Source:</span> <span class="text-slate-300">${m.sourceNode || 'N/A'}</span></div>
                                    <div><span class="text-slate-400">Target Pod:</span> <span class="text-red-300">${m.targetPodStatus || 'N/A'}</span></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Root Cause -->
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-3">Root Cause</h4>
                    <div class="bg-amber-900/20 border border-amber-600/30 rounded p-4">
                        <p class="text-slate-200 text-sm">During KubeVirt upgrades (v1.4 &rarr; v1.5+), the CPU feature label
                            <code class="bg-slate-700 px-1 rounded text-orange-300">cpu-feature.node.kubevirt.io/ipred-ctrl</code>
                            may be present on some nodes but not others. The virt-launcher target pods require this label
                            for scheduling, causing a mismatch that makes migration targets Unschedulable.</p>
                        <p class="text-slate-300 text-sm mt-2">This creates a parallelism deadlock: node drain waits for migrations,
                            migrations wait for schedulable targets, but all targets are blocked by the label mismatch.</p>
                    </div>
                </div>

                <!-- Verification & Remediation Steps Side by Side -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                        <h4 class="text-lg font-medium text-white mb-4">Investigation Steps</h4>
                        <div class="space-y-4">
                            ${issue.verificationSteps.map((step, index) => `
                                <div class="border border-slate-600 rounded p-3">
                                    <h5 class="font-medium text-white mb-1">${index + 1}. ${step.title}</h5>
                                    <div class="text-sm text-slate-300 mb-3">${step.description}</div>
                                    <div class="bg-slate-900/60 rounded p-2 mb-2">
                                        <div class="flex justify-between items-center mb-1">
                                            <span class="text-xs text-slate-400">Command:</span>
                                            <button data-copy-text="${step.command.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">Copy</button>
                                        </div>
                                        <code class="text-xs text-green-300 font-mono block">${step.command}</code>
                                    </div>
                                    ${step.expectedOutput ? `<div class="text-xs text-slate-400">Expected: ${step.expectedOutput}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                        <h4 class="text-lg font-medium text-white mb-4">Remediation Steps</h4>
                        <div class="space-y-3">
                            ${issue.remediationSteps.map((step, index) => {
                                const hasMultipleCommands = step.commands && Array.isArray(step.commands);
                                const commandsArray = hasMultipleCommands ? step.commands : [step.command];
                                const copyText = commandsArray.join('\n');
                                
                                return `
                                <div class="border border-slate-600 rounded p-3">
                                    <h5 class="font-medium text-white mb-1">${index + 1}. ${step.title}</h5>
                                    <div class="text-sm text-slate-300 mb-3">${step.description}</div>
                                    <div class="bg-slate-900/60 rounded p-2">
                                        <div class="flex justify-between items-center mb-1">
                                            <span class="text-xs text-slate-400">Command${hasMultipleCommands ? 's' : ''}:</span>
                                            <button data-copy-text="${copyText.replace(/"/g, '&quot;')}" class="copy-command-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700 transition-colors">Copy All</button>
                                        </div>
                                        ${commandsArray.map(cmd => `<code class="text-xs text-green-300 font-mono block mb-1">${cmd}</code>`).join('')}
                                    </div>
                                    ${step.warning ? `<div class="mt-2 text-xs text-yellow-300 flex items-center gap-1">⚠️ ${step.warning}</div>` : ''}
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>

                <!-- AI Log Analysis -->
                <div class="bg-slate-800/60 border border-slate-600 rounded-lg p-4">
                    <h4 class="text-lg font-medium text-white mb-4">AI Log Analysis</h4>
                    <div class="flex items-center gap-3 flex-wrap">
                        <select id="ai-provider-select-${issue.id}" class="bg-slate-700 text-white text-sm px-3 py-2 rounded-md border border-slate-500">
                            <option value="pattern-engine" selected>Pattern Engine (offline, free)</option>
                            <option value="openwebui">OpenWebUI (qwen3)</option>
                            <option value="ollama">Ollama (local)</option>
                            <option value="gemini">Gemini</option>
                        </select>
                        <button class="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors text-sm"
                            onclick="IssueRenderer.testLogAnalysis('${issue.id}', '${issue.resourceType}', '${issue.vmName || ''}')">
                            Analyze
                        </button>
                    </div>
                    <div id="test-log-result-${issue.id}" class="mt-3 text-sm text-slate-300"></div>
                </div>
            </div>
        `;
    },

    renderIssueDetail(issue) {
        // Decide which renderer to use based on issue type
        if (issue.resourceType === 'upgrade-blocked-migration') {
            return this.renderUpgradeBlockedMigrationDetail(issue);
        }
        if (issue.resourceType === 'volume-attachment-conflict' && issue.attachmentDetails?.migrationStory) {
            return this.renderMigrationIssueDetail(issue);
        }
        return this.renderGenericIssueDetail(issue);
    },
};
