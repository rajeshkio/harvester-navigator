// Universal search functionality for VMs, PVCs, and Volumes
class UniversalSearch {
    constructor() {
        this.searchInput = null;
        this.searchResults = null;
        this.searchStatus = null;
        this.clearButton = null;
        this.currentQuery = '';
        this.searchTimeout = null;
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.searchInput = document.getElementById('universal-search');
        this.searchResults = document.getElementById('search-results');
        this.searchStatus = document.getElementById('search-status');
        this.clearButton = document.getElementById('clear-search');

        if (!this.searchInput) {
            return;
        }

        this.bindEvents();
    }

    bindEvents() {
        // Search input events
        this.searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
        });

        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleEnterKey();
            } else if (e.key === 'Escape') {
                this.clearSearch();
            }
        });

        // Clear button
        this.clearButton.addEventListener('click', () => {
            this.clearSearch();
        });

        // Click outside to close results
        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target) && !this.searchResults.contains(e.target)) {
                this.hideResults();
            }
        });
    }

    handleSearchInput(query) {
        this.currentQuery = query.trim();
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Show/hide clear button
        if (this.currentQuery.length > 0) {
            this.clearButton.classList.remove('hidden');
        } else {
            this.clearButton.classList.add('hidden');
            this.hideResults();
            this.hideStatus();
            return;
        }

        // Debounce search
        this.searchTimeout = setTimeout(() => {
            this.performSearch(this.currentQuery);
        }, 300);
    }

    performSearch(query) {
        if (query.length < 2) {
            this.hideResults();
            this.hideStatus();
            return;
        }

        // Wait for data to be loaded
        const vms = AppState.data.vms;
        
        if (!vms || vms.length === 0) {
            this.showStatus('Loading data...', 'text-yellow-400');
            this.hideResults();
            return;
        }

        const results = this.searchInVMs(query);
        this.displayResults(results, query);
    }

    searchInVMs(query) {
        const vms = AppState.data.vms || [];
        const lowerQuery = query.toLowerCase();
        const matches = [];

        vms.forEach(vm => {
            const matchTypes = [];
            let score = 0;

            // Check VM name
            if (vm.name && vm.name.toLowerCase().includes(lowerQuery)) {
                matchTypes.push('VM Name');
                score += vm.name.toLowerCase() === lowerQuery ? 100 : 50;
            }

            // Check PVC name
            if (vm.claimNames && vm.claimNames.toLowerCase().includes(lowerQuery)) {
                matchTypes.push('PVC Name');
                score += vm.claimNames.toLowerCase() === lowerQuery ? 100 : 40;
            }

            // Check Volume handle
            if (vm.volumeName && vm.volumeName.toLowerCase().includes(lowerQuery)) {
                matchTypes.push('Volume Handle');
                score += vm.volumeName.toLowerCase() === lowerQuery ? 100 : 30;
            }

            // Check Replica names
            if (vm.replicaInfo && vm.replicaInfo.length > 0) {
                vm.replicaInfo.forEach(replica => {
                    if (replica.name && replica.name.toLowerCase().includes(lowerQuery)) {
                        matchTypes.push('Replica');
                        score += 20;
                    }
                });
            }

            // Check Pod name
            if (vm.podName && vm.podName.toLowerCase().includes(lowerQuery)) {
                matchTypes.push('Pod Name');
                score += 25;
            }

            if (matchTypes.length > 0) {
                matches.push({
                    vm: vm,
                    matchTypes: matchTypes,
                    score: score
                });
            }
        });

        // Sort by score (highest first)
        return matches.sort((a, b) => b.score - a.score);
    }

    displayResults(results, query) {
        if (results.length === 0) {
            this.showStatus(`No matches found for "${query}"`, 'text-yellow-400');
            this.hideResults();
            return;
        }

        this.showStatus(`Found ${results.length} match${results.length === 1 ? '' : 'es'}`, 'text-green-400');

        const html = results.map(result => {
            const vm = result.vm;
            const matchBadges = result.matchTypes.map(type => 
                `<span class="bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-full">${type}</span>`
            ).join(' ');

            const statusColor = Utils.getStatusColorClass(vm.printableStatus || 'Unknown');
            
            return `
                <div class="search-result-item p-3 hover:bg-slate-700/50 cursor-pointer border-b border-slate-600 last:border-b-0" 
                     data-vm-name="${vm.name}"
                     data-vm-namespace="${vm.namespace}">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="text-slate-200 font-medium truncate flex-1">${vm.name}</h4>
                        <span class="${statusColor} text-xs font-medium ml-2">${vm.printableStatus || 'Unknown'}</span>
                    </div>
                    <div class="text-xs text-slate-400 mb-2">
                        <div>Namespace: ${vm.namespace || 'N/A'}</div>
                        <div>PVC: ${vm.claimNames || 'N/A'}</div>
                        <div>Volume: ${vm.volumeName ? vm.volumeName.substring(0, 40) + '...' : 'N/A'}</div>
                    </div>
                    <div class="flex flex-wrap gap-1">
                        ${matchBadges}
                    </div>
                </div>
            `;
        }).join('');

        this.searchResults.innerHTML = html;
        this.showResults();

        // Add click handlers to results
        this.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const vmName = item.getAttribute('data-vm-name');
                const vmNamespace = item.getAttribute('data-vm-namespace');
                this.selectVM(vmName, vmNamespace);
            });
        });
    }

    selectVM(vmName, vmNamespace) {
        this.hideResults();
        this.showStatus(`Opening details for ${vmNamespace}/${vmName}...`, 'text-blue-400');
        
        // Navigate to VM detail
        ViewManager.showVMDetail(vmName, vmNamespace);
        
        // Clear search after a short delay
        setTimeout(() => {
            this.clearSearch();
        }, 1000);
    }

    handleEnterKey() {
        // If there are results, select the first one
        const firstResult = this.searchResults.querySelector('.search-result-item');
        if (firstResult) {
            const vmName = firstResult.getAttribute('data-vm-name');
            const vmNamespace = firstResult.getAttribute('data-vm-namespace');
            this.selectVM(vmName, vmNamespace);
        }
    }

    clearSearch() {
        this.searchInput.value = '';
        this.currentQuery = '';
        this.hideResults();
        this.hideStatus();
        this.clearButton.classList.add('hidden');
    }

    showResults() {
        this.searchResults.classList.remove('hidden');
    }

    hideResults() {
        this.searchResults.classList.add('hidden');
    }

    showStatus(message, colorClass = 'text-slate-400') {
        this.searchStatus.textContent = message;
        this.searchStatus.className = `mt-2 text-sm ${colorClass}`;
        this.searchStatus.classList.remove('hidden');
    }

    hideStatus() {
        this.searchStatus.classList.add('hidden');
    }
}

// Initialize search when the script loads
window.universalSearch = new UniversalSearch();
