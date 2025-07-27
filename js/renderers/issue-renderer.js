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
    }
};
