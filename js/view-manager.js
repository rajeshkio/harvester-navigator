// View navigation and transitions
const ViewManager = {
    currentView: 'dashboard',
    
    issueFilters: {
        searchText: '',
        severity: 'all'
    },
    issueSort: 'time-desc',
    showDashboard() {
        this.hideAllViews();
        document.getElementById('dashboard').classList.remove('hidden');
        this.currentView = 'dashboard';
    },
    
    showNodeDetail(nodeName) {
        // Find the node data using the nested structure
        const nodeData = AppState.data.nodes.find(n => {
            const name = n.longhornInfo ? n.longhornInfo.name : (n.name || '');
            return name === nodeName;
        });
        
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
        
        // Scroll to top when showing VM detail
        window.scrollTo(0, 0);
    },
    
    showAllIssuesView() {
    this.hideAllViews();
        document.getElementById('all-issues-container').classList.remove('hidden');
        const searchInput = document.getElementById('issue-search-input');
        const severityFilter = document.getElementById('issue-severity-filter');
        const sortFilter = document.getElementById('issue-sort-filter');

        // Set controls to match current state
        searchInput.value = this.issueFilters.searchText;
        severityFilter.value = this.issueFilters.severity;
        sortFilter.value = this.issueSort;
        
        searchInput.oninput = (e) => {
            this.issueFilters.searchText = e.target.value;
            this.renderAllIssuesList();
        };
        severityFilter.onchange = (e) => {
            this.issueFilters.severity = e.target.value;
            this.renderAllIssuesList();
        };
        sortFilter.onchange = (e) => {
            this.issueSort = e.target.value;
            this.renderAllIssuesList();
        };

        this.renderAllIssuesList(); // Initial render
    },
    
    renderAllIssuesList() {
        let issues = AppState.getAllRealIssues();

        // 1. Apply Filters
        if (this.issueFilters.severity !== 'all') {
            issues = issues.filter(issue => issue.severity === this.issueFilters.severity);
        }
        if (this.issueFilters.searchText) {
            const searchLower = this.issueFilters.searchText.toLowerCase();
            issues = issues.filter(issue => 
                issue.title.toLowerCase().includes(searchLower) ||
                issue.description.toLowerCase().includes(searchLower) ||
                issue.affectedResource.toLowerCase().includes(searchLower)
            );
        }

        // 2. Apply Sorting
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        issues.sort((a, b) => {
            switch (this.issueSort) {
                case 'time-asc':
                    return new Date(a.detectionTime) - new Date(b.detectionTime);
                case 'severity-desc':
                    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
                case 'time-desc':
                default:
                    return new Date(b.detectionTime) - new Date(a.detectionTime);
            }
        });
        
        // Update header count
        const headerTitle = document.querySelector('#all-issues-container h2');
        if (headerTitle) {
            headerTitle.textContent = `All Detected Issues (${issues.length})`;
        }
        
        // 3. Group by Severity and Render
        const groupedIssues = issues.reduce((acc, issue) => {
            const severity = issue.severity;
            if (!acc[severity]) {
                acc[severity] = [];
            }
            acc[severity].push(issue);
            return acc;
        }, {});

        const issuesListContainer = document.getElementById('all-issues-list');
        issuesListContainer.innerHTML = ''; // Clear previous list

        if (issues.length === 0) {
            issuesListContainer.innerHTML = `<p class="text-slate-400 text-center py-8">No issues match the current filters.</p>`;
            return;
        }

        const sortedSeverities = ['critical', 'high', 'medium', 'low'];
        
        sortedSeverities.forEach(severity => {
            if (groupedIssues[severity] && groupedIssues[severity].length > 0) {
                const groupContainer = document.createElement('div');
                
                const groupHeader = `
                    <h3 class="text-base font-bold text-white uppercase tracking-wider mt-4 mb-3 pb-2 border-b-2 border-slate-700">
                        ${severity} Issues (${groupedIssues[severity].length})
                    </h3>
                `;
                
                const issuesHTML = groupedIssues[severity].map(issue => {
                    return this.createDetailedIssueCard(issue);
                }).join('');

                groupContainer.innerHTML = groupHeader + issuesHTML;
                issuesListContainer.appendChild(groupContainer);
            }
        });
    },
    
    createDetailedIssueCard(issue) {
        // This function generates the HTML for a single issue card.
        // It's the same logic you had before for rendering a single issue.
        const severityIcon = Utils.getSeverityIcon(issue.severity);
        return `
            <div class="bg-slate-800/50 p-4 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors mb-3" onclick="ViewManager.showIssueDetail('${issue.id}')">
                 <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${severityIcon}</span>
                        <div>
                            <h3 class="font-bold text-lg text-slate-200">${issue.title}</h3>
                            <p class="text-slate-400 text-sm">${issue.affectedResource} • ${issue.category}</p>
                        </div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded ${Utils.getSeverityBadgeClass(issue.severity)}">${issue.severity.toUpperCase()}</span>
                </div>
                <p class="text-slate-300 text-sm mb-3">${issue.description}</p>
                <div class="flex justify-between items-center text-xs text-slate-500">
                    <span>Detected: ${Utils.formatTimestamp(issue.detectionTime)}</span>
                    <span>Click to troubleshoot →</span>
                </div>
            </div>
        `;
    },
    showIssueDetail(issueId) {
        const issue = AppState.issues.find(i => i.id === issueId);
        if (!issue) return;

        const detailHTML = `
            <div class="card p-6 fade-in">
                ${IssueRenderer.renderIssueDetail(issue)}
            </div>
        `;

        document.getElementById('issue-detail-view').innerHTML = detailHTML;
        this.hideAllViews();
        document.getElementById('issue-detail-container').classList.remove('hidden');
        this.currentView = 'issue-detail';
    },
    renderRemediationCommand(step) {
    // Check if this is a documentation reference step
        if (step.id === 'reference-docs' || step.id === 'documentation' || step.command.startsWith('#')) {
            // Extract URL from the command or description
            const urlMatch = step.command.match(/https?:\/\/[^\s)]+/) || step.description.match(/https?:\/\/[^\s)]+/);
            const url = urlMatch ? urlMatch[0] : null;
            
            if (url) {
                return `
                    <div class="bg-slate-950 p-3 rounded mb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-blue-400">[LINK]</span>
                            <a href="${url}" target="_blank" rel="noopener noreferrer" 
                            class="text-blue-400 hover:text-blue-300 underline">
                                ${url}
                            </a>
                            <button onclick="Utils.copyToClipboard('${url}')" 
                                    class="bg-slate-700 text-white px-2 py-1 rounded text-xs hover:bg-slate-600 transition-colors">
                                Copy
                            </button>
                        </div>
                    </div>
                `;
            }
        }
        
        // Regular command display
        if (step.command.startsWith('#')) {
            return `<div class="bg-slate-950 p-3 rounded font-mono text-sm text-slate-500 italic">${step.command}</div>`;
        } else {
            return `
                <div class="bg-slate-950 p-3 rounded font-mono text-sm text-green-300">
                    <span class="text-cyan-400">$</span> ${step.command}
                </div>
            `;
        }
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
            success: 'text-green-400',
            warning: 'text-yellow-400'
        };
        const iconMap = { 
            info: '[INFO]', 
            error: '[ERROR]', 
            success: '[SUCCESS]',
            warning: '[WARNING]'
        };
        
        const statusElement = document.getElementById('upgrade-status');
        if (statusElement) {
            statusElement.innerHTML = 
                `<span class="${colorMap[type] || 'text-slate-300'}">${iconMap[type] || '[INFO]'} ${message}</span>`;
        }
    }
};
