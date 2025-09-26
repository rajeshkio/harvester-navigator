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
        if (!this.issues || this.issues.length === 0) {
            return [];
        }

        return this.issues.filter(issue => 
            issue.severity !== 'info' && issue.severity !== 'information'
        );
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
    },

    setIssues(detectedIssues) {
        this.issues = detectedIssues;
    },
};
