// VM UI rendering
const VMRenderer = {
    render(vms, issues) {
        const container = document.getElementById('vm-list');
        container.innerHTML = '';
        
        if (!vms || vms.length === 0) {
            container.innerHTML = '<p class="text-slate-400 col-span-full text-center py-4">No virtual machines found.</p>';
            return;
        }
        
        // Update global issues counter
        const allRealIssues = AppState.getAllRealIssues();
      //  this.updateGlobalIssuesCounter(allRealIssues.length);
        
        vms.forEach(vm => {
            const vmCard = this.createVMCard(vm);
            container.appendChild(vmCard);
        });
    },
    
    createVMCard(vm) {
        const status = vm.printableStatus || 'Unknown';
        const realIssueCount = AppState.countRealIssues(vm.errors);
        
        let storageInfo = '';
        if (vm.errors && vm.errors.length > 0) {
            const storageBackend = vm.errors.find(error => 
                error.severity === 'info' && error.type === 'info'
            );
            if (storageBackend && storageBackend.resource !== 'driver.longhorn.io') {
                storageInfo = `<div class="text-xs text-blue-300 mb-1">📦 ${Utils.getStorageBackendDisplayName(storageBackend.resource)}</div>`;
            }
        }
        
        const card = document.createElement('div');
        card.className = `bg-slate-800/50 p-3 rounded-md cursor-pointer hover:bg-slate-700/50 transition-colors fade-in status-${status.toLowerCase()}`;
        card.innerHTML = `
            <h3 class="font-bold text-base text-slate-200 truncate mb-1">${vm.name}</h3>
            <div class="text-xs text-slate-400 mb-2">${vm.namespace}</div>
            ${storageInfo}
            <div class="text-sm mb-2">
                <span class="text-slate-400">Status:</span> 
                <span class="${Utils.getStatusColorClass(status)} font-medium">${status}</span>
            </div>
            ${realIssueCount > 0 ? `<div class="text-xs text-red-400">⚠️ ${realIssueCount} issue${realIssueCount > 1 ? 's' : ''} detected</div>` : ''}
        `;
        card.onclick = () => ViewManager.showVMDetail(vm.name);
        
        return card;
    },
    
    // updateGlobalIssuesCounter(count) {
    //     let issuesSection = document.getElementById('global-issues-section');
    //     if (!issuesSection) {
    //         const header = document.querySelector('header');
    //         issuesSection = document.createElement('div');
    //         issuesSection.id = 'global-issues-section';
    //         issuesSection.className = 'mt-4';
    //         header.appendChild(issuesSection);
    //     }
        
    //     if (count > 0) {
    //         issuesSection.innerHTML = `
    //             <div class="bg-red-900/20 border border-red-500/30 rounded-lg p-3 max-w-md mx-auto">
    //                 <div class="flex items-center justify-between">
    //                     <div class="flex items-center gap-2">
    //                         <span class="text-red-400 text-lg">🚨</span>
    //                         <span class="text-red-400 font-semibold">Detected Issues</span>
    //                         <span class="bg-red-500 text-white text-xs px-2 py-1 rounded-full">${count}</span>
    //                     </div>
    //                     <button id="view-all-issues-global" class="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700 transition-colors">
    //                         View All Issues
    //                     </button>
    //                 </div>
    //             </div>
    //         `;
            
    //         document.getElementById('view-all-issues-global').onclick = () => ViewManager.showAllIssuesView();
    //     } else {
    //         issuesSection.innerHTML = '';
    //     }
    // }
};
