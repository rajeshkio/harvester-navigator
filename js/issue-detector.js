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
            if (check.checkName === 'error_pods' && check.podErrors && check.podErrors.length > 0) {
                // Filter out less critical restart issues - only show serious problems
                const seriousPodErrors = check.podErrors.filter(pod => {
                    // Always include non-running phases
                    if (pod.phase !== 'Running') {
                        return true;
                    }
                    
                    // Only include very high restart counts or actual crashes
                    if (pod.errorState) {
                        if (pod.errorState.includes('CrashLoopBackOff') || 
                            pod.errorState.includes('ImagePull') || 
                            pod.errorState.includes('CreateContainer')) {
                            return true;
                        }
                        
                        // Only very high restart counts (50+)
                        if (pod.errorState.startsWith('HighRestarts')) {
                            const match = pod.errorState.match(/HighRestarts\((\d+)\)/);
                            if (match && parseInt(match[1]) >= 50) {
                                return true;
                            }
                        }
                    }
                    
                    return false;
                });
                
                // Create individual issues for serious problems
                seriousPodErrors.forEach(pod => {
                    const severity = this.getPodSeverity(pod);
                    const description = this.buildPodDescription(pod);
                    
                    issues.push({
                        id: `pod-error-${pod.namespace}-${pod.name}`,
                        title: `Pod Issue: ${pod.name}`,
                        severity: severity,
                        category: 'Pod Health',
                        description: description,
                        affectedResource: `Pod: ${pod.namespace}/${pod.name}`,
                        resourceType: 'pod-error',
                        resourceName: pod.name,
                        namespace: pod.namespace,
                        detectionTime: check.timestamp,
                        podDetails: pod,
                        verificationSteps: this.getPodVerificationSteps(pod),
                        remediationSteps: this.getPodRemediationSteps(pod)
                    });
                });
                
                // If there are many restart issues, create a summary issue
                const restartIssues = check.podErrors.filter(pod => 
                    pod.errorState && pod.errorState.startsWith('HighRestarts') && 
                    !seriousPodErrors.includes(pod)
                );
                
                if (restartIssues.length > 5) {
                    issues.push({
                        id: `pod-restarts-summary`,
                        title: `Multiple Pods with High Restart Counts`,
                        severity: 'low',
                        category: 'Pod Health',
                        description: `${restartIssues.length} pods have elevated restart counts. This may indicate temporary instability but pods are currently running.`,
                        affectedResource: `${restartIssues.length} pods across multiple namespaces`,
                        resourceType: 'pod-restart-summary',
                        resourceName: 'multiple',
                        detectionTime: check.timestamp,
                        verificationSteps: [
                            {
                                id: 'check-restart-pods',
                                title: 'Check Pods with High Restarts',
                                command: 'kubectl get pods --all-namespaces --field-selector=status.phase=Running',
                                expectedOutput: 'List of running pods',
                                description: 'Review pods that have restarted frequently'
                            }
                        ],
                        remediationSteps: [
                            {
                                id: 'monitor-restarts',
                                title: 'Monitor for Patterns',
                                command: 'kubectl get events --all-namespaces --sort-by=.lastTimestamp',
                                description: 'Check recent events to understand restart patterns'
                            }
                        ]
                    });
                }
            } else {
                // Handle other health check failures
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
        }
    });
},

    groupPodErrors(podErrors) {
        const groups = {
            'CrashLoopBackOff': [],
            'ImagePullBackOff': [],
            'Pending': [],
            'Failed': [],
            'HighRestarts': [],
            'Other': []
        };
        
        podErrors.forEach(pod => {
            if (pod.errorState && pod.errorState.startsWith('HighRestarts')) {
                groups['HighRestarts'].push(pod);
            } else if (pod.errorState) {
                groups[pod.errorState] = groups[pod.errorState] || [];
                groups[pod.errorState].push(pod);
            } else if (pod.phase) {
                groups[pod.phase] = groups[pod.phase] || [];
                groups[pod.phase].push(pod);
            } else {
                groups['Other'].push(pod);
            }
        });
        
        // Remove empty groups
        Object.keys(groups).forEach(key => {
            if (groups[key].length === 0) {
                delete groups[key];
            }
        });
        
        return groups;
    },

    getPodVerificationSteps(pod) {
        const steps = [
            {
                id: 'check-pod-status',
                title: 'Check Pod Status',
                command: `kubectl get pod ${pod.name} -n ${pod.namespace} -o wide`,
                expectedOutput: 'Pod current status and placement',
                description: 'Get basic pod status and node placement'
            },
            {
                id: 'describe-pod',
                title: 'Get Pod Events',
                command: `kubectl describe pod ${pod.name} -n ${pod.namespace}`,
                expectedOutput: 'Pod events and error details',
                description: 'See detailed events and conditions'
            }
        ];

        // Add specific steps based on error type
        if (pod.errorState) {
            if (pod.errorState === 'CrashLoopBackOff') {
                steps.push({
                    id: 'check-crash-logs',
                    title: 'Check Crash Logs',
                    command: `kubectl logs ${pod.name} -n ${pod.namespace} --previous`,
                    expectedOutput: 'Previous container logs',
                    description: 'Check why the container crashed'
                });
            } else if (pod.errorState.includes('ImagePull')) {
                steps.push({
                    id: 'check-image-details',
                    title: 'Check Image Configuration',
                    command: `kubectl get pod ${pod.name} -n ${pod.namespace} -o jsonpath='{.spec.containers[*].image}'`,
                    expectedOutput: 'Container image names',
                    description: 'Verify image names and registry access'
                });
            } else {
                // General log check for other issues
                steps.push({
                    id: 'check-logs',
                    title: 'Check Container Logs',
                    command: `kubectl logs ${pod.name} -n ${pod.namespace} --tail=20`,
                    expectedOutput: 'Recent container logs',
                    description: 'Check recent logs for error messages'
                });
            }
        }

        return steps;
    },

    getPodRemediationSteps(pod) {
        const steps = [];

        if (pod.namespace === 'cattle-fleet-system' && 
            pod.name.includes('fleet-agent') && 
            pod.errorState === 'PodInitializing') {
            
            return [
                {
                    id: 'get-fleet-history',
                    title: 'Get Fleet Helm History',
                    command: 'helm history -n cattle-fleet-system fleet',
                    description: 'Find the last successfully deployed revision (status: deployed)',
                    warning: 'Look for the highest revision with "deployed" status, not "pending-upgrade"'
                },
                {
                    id: 'rollback-fleet',
                    title: 'Rollback Fleet to Working Revision',
                    command: 'helm rollback fleet -n cattle-fleet-system <last-deployed-revision>',
                    description: 'Replace <last-deployed-revision> with the revision number from the previous step. This fixes the known Fleet upgrade race condition.',
                    warning: 'This resolves the Fleet initialization issue during Harvester upgrades'
                },
                {
                    id: 'verify-fleet-pods',
                    title: 'Verify Fleet Pods Recovery',
                    command: 'kubectl get pods -n cattle-fleet-system',
                    description: 'Ensure Fleet agent pods are no longer stuck in PodInitializing'
                },
                {
                    id: 'check-upgrade-progress',
                    title: 'Check Upgrade Progress',
                    command: 'kubectl logs -n harvester-system -l harvesterhci.io/upgradeComponent=manifest -f',
                    description: 'Monitor that the upgrade continues after Fleet recovery'
                },
                {
                    id: 'reference-docs',
                    title: 'Reference Documentation',
                    command: '# See: https://docs.harvesterhci.io/v1.4/upgrade/v1-3-2-to-v1-4-0/#3-upgrade-stuck-on-waiting-for-fleet',
                    description: 'Official documentation for this known Fleet upgrade issue'
                }
            ];
        }
        // Specific fixes based on error type
        if (pod.errorState) {
            switch (pod.errorState) {
                case 'ImagePullBackOff':
                case 'ErrImagePull':
                    steps.push({
                        id: 'fix-image-access',
                        title: 'Check Image Registry Access',
                        command: `kubectl get events -n ${pod.namespace} --field-selector involvedObject.name=${pod.name}`,
                        description: 'Check events for image pull errors and verify registry access'
                    });
                    break;
                case 'CrashLoopBackOff':
                    steps.push({
                        id: 'investigate-crash',
                        title: 'Investigate Container Crash',
                        command: `kubectl logs ${pod.name} -n ${pod.namespace} --previous --tail=50`,
                        description: 'Check previous logs to understand why container crashed'
                    });
                    break;
                case 'CreateContainerConfigError':
                    steps.push({
                        id: 'check-config',
                        title: 'Check Container Configuration',
                        command: `kubectl get pod ${pod.name} -n ${pod.namespace} -o yaml`,
                        description: 'Review pod configuration for errors in env vars, volumes, etc.'
                    });
                    break;
                default:
                    if (pod.errorState.startsWith('HighRestarts')) {
                        steps.push({
                            id: 'investigate-restarts',
                            title: 'Investigate High Restart Count',
                            command: `kubectl logs ${pod.name} -n ${pod.namespace} --tail=50`,
                            description: 'Check logs to understand why container keeps restarting'
                        });
                    }
                    break;
            }
        }

        // General restart option
        if (pod.namespace !== 'cattle-fleet-system' || !pod.name.includes('fleet-agent')) {
        steps.push({
            id: 'restart-pod',
            title: 'Restart Pod',
            command: `kubectl delete pod ${pod.name} -n ${pod.namespace}`,
            description: 'Delete pod to trigger restart/recreation',
            warning: 'This will cause temporary service interruption'
        });
    }

        return steps;
    },

    getPodSeverity(pod) {
    if (pod.phase === 'Failed') {
        return 'critical';
    }
    
    // High: Container crashes and image pull failures
    if (pod.errorState) {
        switch (pod.errorState) {
            case 'CrashLoopBackOff':
            case 'ImagePullBackOff':
            case 'ErrImagePull':
            case 'CreateContainerError':
                return 'high';
            case 'CreateContainerConfigError':
            case 'InvalidImageName':
                return 'high';
            default:
                // High restart counts
                if (pod.errorState.startsWith('HighRestarts')) {
                    return 'high';
                }
                // Init container issues
                if (pod.errorState.startsWith('Init:')) {
                    return 'medium';
                }
                break;
        }
    }
    
    // Medium: Unknown state or long-pending
    if (pod.phase === 'Unknown' || pod.phase === 'Pending') {
        return 'medium';
    }
    
    return 'low';
},

    buildPodDescription(pod) {
    let description = `Pod ${pod.name} in namespace ${pod.namespace}`;
    
    if (pod.errorState && pod.errorState !== pod.phase) {
        description += ` is experiencing ${pod.errorState}`;
    } else {
        description += ` is in ${pod.phase} state`;
    }
    
    if (pod.nodeName) {
        description += ` on node ${pod.nodeName}`;
    }
    
    if (pod.reason && pod.reason !== pod.errorState) {
        description += `. Reason: ${pod.reason}`;
    }
    
    // Add helpful context based on error state
    if (pod.errorState) {
        switch (pod.errorState) {
            case 'CrashLoopBackOff':
                description += '. The container is repeatedly crashing and restarting.';
                break;
            case 'ImagePullBackOff':
            case 'ErrImagePull':
                description += '. Cannot pull the container image from registry.';
                break;
            case 'CreateContainerConfigError':
                description += '. Container configuration is invalid.';
                break;
            default:
                if (pod.errorState.startsWith('HighRestarts')) {
                    description += '. Container has restarted many times.';
                } else if (pod.errorState.startsWith('Init:')) {
                    description += '. Init container is failing to complete.';
                }
                break;
        }
    }
    
    return description;
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
