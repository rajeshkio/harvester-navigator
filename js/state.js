// Centralized state management with observer pattern
const AppState = {
    data: {
        nodes: [],
        vms: [],
        upgradeInfo: null
    },
    
    issues: [],
    observers: [],
    
    getAllRealIssues() {
        if (!this.data.vms) return [];
        
        let allIssues = [];
        this.data.vms.forEach(vm => {
            if (vm.errors && vm.errors.length > 0) {
                const realIssues = vm.errors.filter(error => 
                    error.severity !== 'info' && error.severity !== 'information'
                );
                realIssues.forEach(issue => {
                    allIssues.push({
                        ...issue,
                        vmName: vm.name,
                        namespace: vm.namespace
                    });
                });
            }
        });
        return allIssues;
    },
    
    countRealIssues(errors) {
        if (!errors || errors.length === 0) return 0;
        return errors.filter(error => 
            error.severity !== 'info' && error.severity !== 'information'
        ).length;
    },
    
    updateData(newData) {
        this.data = { ...this.data, ...newData };
        this.issues = IssueDetector.detectIssues(this.data);
        this.notifyStateChange();
    },
    
    subscribe(callback) {
        this.observers.push(callback);
    },
    
    notifyStateChange() {
        this.observers.forEach(callback => callback(this.data, this.issues));
    }
};
