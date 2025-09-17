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

        // Check for active migrations
        let migrationInfo = '';
        if (vm.vmimInfo && vm.vmimInfo.length > 0) {
            const activeMigration = vm.vmimInfo.find(vmim => 
                ['Running', 'Scheduling', 'Scheduled', 'PreparingTarget', 'TargetReady'].includes(vmim.phase)
            );
            
            if (activeMigration) {
                const migrationIcon = this.getMigrationIcon(activeMigration.phase);
                const phaseColor = this.getMigrationColor(activeMigration.phase);
                
                // Show target pod validation if it failed
                const podError = activeMigration.targetPod && !activeMigration.targetPodExists ? 
                    ' ⚠️' : '';
                
                migrationInfo = `<div class="text-xs ${phaseColor} mb-1 flex items-center gap-1">
                    <span>${migrationIcon}</span>
                    <span>Migration: ${activeMigration.phase}${podError}</span>
                </div>`;
            } else {
                // Check for recent failed migration
                const failedMigration = vm.vmimInfo.find(vmim => vmim.phase === 'Failed');
                if (failedMigration) {
                    migrationInfo = `<div class="text-xs text-red-400 mb-1 flex items-center gap-1">
                        <span>❌</span>
                        <span>Migration: Failed</span>
                    </div>`;
                }
            }
        }
        
        const card = document.createElement('div');
        card.className = `bg-slate-800/50 p-3 rounded-md cursor-pointer hover:bg-slate-700/50 transition-colors fade-in status-${status.toLowerCase()}`;
        card.innerHTML = `
            <h3 class="font-bold text-base text-slate-200 truncate mb-1">${vm.name}</h3>
            <div class="text-xs text-slate-400 mb-2">${vm.namespace}</div>
            ${storageInfo}
            ${migrationInfo}
            <div class="text-sm mb-2">
                <span class="text-slate-400">Status:</span> 
                <span class="${Utils.getStatusColorClass(status)} font-medium">${status}</span>
            </div>
            ${realIssueCount > 0 ? `<div class="text-xs text-red-400">⚠️ ${realIssueCount} issue${realIssueCount > 1 ? 's' : ''} detected</div>` : ''}
        `;
        card.onclick = () => ViewManager.showVMDetail(vm.name);
        
        return card;
    },

    getMigrationIcon(phase) {
        switch(phase) {
            case 'Running': return '🔄';
            case 'Scheduling': return '⏳';
            case 'Scheduled': return '📋';
            case 'PreparingTarget': return '🔧';
            case 'TargetReady': return '✅';
            case 'Failed': return '❌';
            case 'Succeeded': return '🎉';
            default: return '📦';
        }
    },

    getMigrationColor(phase) {
        switch(phase) {
            case 'Running': return 'text-yellow-400';
            case 'Scheduling': return 'text-blue-400';
            case 'Scheduled': return 'text-blue-400';
            case 'PreparingTarget': return 'text-purple-400';
            case 'TargetReady': return 'text-green-400';
            case 'Failed': return 'text-red-400';
            case 'Succeeded': return 'text-green-400';
            default: return 'text-slate-400';
        }
    }
};
