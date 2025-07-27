// Issue detection logic
const IssueDetector = {
    detectIssues(data) {
        const issues = [];
        
        if (data.vms) {
            data.vms.forEach(vm => this.checkVMIssues(vm, issues));
        }
        
        if (data.nodes) {
            data.nodes.forEach(node => this.checkNodeIssues(node, issues));
        }
        if (data.healthChecks && data.healthChecks.results) {
            this.processHealthCheckResults(data.healthChecks.results, issues);
        }
        
        return issues;
    },
    
    checkVMIssues(vm, issues) {
        if (vm.errors && vm.errors.length > 0) {
            const realErrors = vm.errors.filter(error => 
                error.severity !== 'info' && error.severity !== 'information'
            );
            
            realErrors.forEach(error => {
                issues.push(this.createIssue({
                    id: `vm-error-${vm.name}-${error.type}`,
                    title: `${error.type.toUpperCase()} Issue`,
                    severity: error.severity || 'warning',
                    category: 'VM Resource',
                    description: error.message,
                    affectedResource: `VM: ${vm.name}`,
                    resourceType: error.type,
                    resourceName: error.resource,
                    vmName: vm.name
                }));
            });
        }
        
        if (vm.printableStatus === 'Pending' && vm.claimNames) {
            issues.push(this.createIssue({
                id: `vm-pending-${vm.name}`,
                title: 'VM Stuck in Pending State',
                severity: 'high',
                category: 'Scheduling',
                description: `VM ${vm.name} is stuck in Pending state, likely due to scheduling or storage issues.`,
                affectedResource: `VM: ${vm.name}`,
                resourceType: 'vm-pending',
                resourceName: vm.name,
                vmName: vm.name
            }));
        }
        
        if (vm.replicaInfo && vm.replicaInfo.length > 0) {
            const faultedReplicas = vm.replicaInfo.filter(r => r.currentState === 'error' || !r.started);
            if (faultedReplicas.length > 0) {
                issues.push(this.createIssue({
                    id: `replica-issues-${vm.name}`,
                    title: 'Storage Replica Issues',
                    severity: faultedReplicas.length === vm.replicaInfo.length ? 'critical' : 'high',
                    category: 'Storage',
                    description: `${faultedReplicas.length} out of ${vm.replicaInfo.length} replicas are faulted for volume ${vm.volumeName}.`,
                    affectedResource: `Volume: ${vm.volumeName}`,
                    resourceType: 'replica-faulted',
                    resourceName: vm.volumeName,
                    vmName: vm.name
                }));
            }
        }
    },
    
    checkNodeIssues(node, issues) {
        const readyCondition = (node.conditions || []).find(c => c.type === 'Ready');
        if (!readyCondition || readyCondition.status !== 'True') {
            issues.push(this.createIssue({
                id: `node-not-ready-${node.name}`,
                title: 'Node Not Ready',
                severity: 'critical',
                category: 'Node Health',
                description: `Node ${node.name} is not in Ready state. This affects VM scheduling and storage operations.`,
                affectedResource: `Node: ${node.name}`,
                resourceType: 'node-not-ready',
                resourceName: node.name
            }));
        }
    },
    processHealthCheckResults(healthChecks, issues) {
    healthChecks.forEach(check => {
        if (check.status === 'failed') {
            issues.push({
                id: `health-${check.checkName}`,
                title: `Health Check Failed: ${this.formatCheckName(check.checkName)}`,
                severity: this.getCheckSeverity(check.checkName),
                category: 'Cluster Health',
                description: check.error || check.message,
                affectedResource: `Health Check: ${check.checkName}`,
                resourceType: 'health-check',
                resourceName: check.checkName,
                detectionTime: check.timestamp,
                verificationSteps: this.getHealthCheckSteps(check.checkName),
                remediationSteps: this.getHealthCheckRemediation(check.checkName)
            });
        }
    });
},

    formatCheckName(name) {
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    },

    getCheckSeverity(checkName) {
        const severityMap = {
            'nodes': 'critical',
            'error_pods': 'high',
            'volumes': 'high',
            'bundles': 'medium',
            'cluster': 'critical',
            'machines': 'medium',
            'free_space': 'medium'
        };
        return severityMap[checkName] || 'medium';
    },

    getHealthCheckSteps(checkName) {
        const steps = {
            'nodes': [
                {
                    id: 'check-node-status',
                    title: 'Check Node Status',
                    command: 'kubectl get nodes -o wide',
                    expectedOutput: 'All nodes should be Ready',
                    description: 'Verify node readiness and scheduling status'
                }
            ],
            'error_pods': [
                {
                    id: 'check-pod-status',
                    title: 'Check Pod Status',
                    command: 'kubectl get pods --all-namespaces | grep -v Running | grep -v Completed',
                    expectedOutput: 'No error pods should be listed',
                    description: 'Find pods that are not running or completed'
                }
            ]
        };
        return steps[checkName] || [];
    },

 

    createIssue(baseIssue) {
        return {
            ...baseIssue,
            detectionTime: new Date().toISOString(),
            verificationSteps: this.getVerificationSteps(baseIssue.resourceType, baseIssue.resourceName),
            remediationSteps: this.getRemediationSteps(baseIssue.resourceType, baseIssue.resourceName)
        };
    },
    
    getVerificationSteps(issueType, resourceName) {
        const steps = {
            'vm-pending': [
                {
                    id: 'check-vm-status',
                    title: 'Check VM Status',
                    command: `kubectl get vm ${resourceName} -n harvester-system -o yaml`,
                    expectedOutput: 'VM should show current status and conditions',
                    description: 'Check the VM status and any error conditions'
                }
            ],
            'replica-faulted': [
                {
                    id: 'check-volume-status',
                    title: 'Check Longhorn Volume Status',
                    command: `kubectl get volumes.longhorn.io ${resourceName} -n longhorn-system -o yaml`,
                    expectedOutput: 'Volume should show current state and replica information',
                    description: 'Check the Longhorn volume state and replica count'
                }
            ],
            'node-not-ready': [
                {
                    id: 'check-node-status',
                    title: 'Check Node Status',
                    command: `kubectl get node ${resourceName} -o wide`,
                    expectedOutput: 'Node should show Ready status',
                    description: 'Check basic node status and availability'
                }
            ]
        };
        return steps[issueType] || [];
    },
    getHealthCheckRemediation(checkName) {
    const steps = {
        'nodes': [
            {
                id: 'uncordon-nodes',
                title: 'Uncordon Nodes',
                command: 'kubectl uncordon <node-name>',
                description: 'Make nodes schedulable again'
            }
        ],
        'error_pods': [
            {
                id: 'restart-pods',
                title: 'Restart Failed Pods',
                command: 'kubectl delete pod <pod-name> -n <namespace>',
                description: 'Restart failed pods to recover'
            }
        ]
    };
    return steps[checkName] || [];
},
    
    getRemediationSteps(issueType, resourceName) {
        const steps = {
            'vm-pending': [
                {
                    id: 'free-resources',
                    title: 'Free Up Resources',
                    command: `kubectl delete vm <unused-vm-name> -n harvester-system`,
                    description: 'Delete unused VMs to free up resources',
                    warning: 'Ensure VM is not needed before deletion'
                }
            ],
            'replica-faulted': [
                {
                    id: 'salvage-replicas',
                    title: 'Attempt Replica Salvage',
                    command: '# Use Longhorn UI to salvage failed replicas',
                    description: 'Try to recover data from faulted replicas using Longhorn UI',
                    warning: 'This may result in data loss'
                }
            ],
            'node-not-ready': [
                {
                    id: 'restart-kubelet',
                    title: 'Restart Node Services',
                    command: `# SSH to node and run: sudo systemctl restart kubelet`,
                    description: 'Restart kubelet service on the affected node',
                    warning: 'This will temporarily disrupt workloads on the node'
                }
            ]
        };
        return steps[issueType] || [];
    }
};
