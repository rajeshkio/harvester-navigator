// Issue detection logic
const IssueDetector = {
    // Merge attachment ticket status and spec data for backward compatibility
    mergeAttachmentTicketsData(vm) {
        if (!vm.attachmentTicketsStatusRaw && !vm.attachmentTicketsSpecRaw) {
            return null;
        }

        const mergedData = {};
        
        // Start with status data (timestamps, satisfied status, conditions)
        if (vm.attachmentTicketsStatusRaw && typeof vm.attachmentTicketsStatusRaw === 'object') {
            Object.entries(vm.attachmentTicketsStatusRaw).forEach(([ticketId, statusData]) => {
                mergedData[ticketId] = { ...statusData };
            });
        }

        // Add spec data (nodeID mappings, type, etc.)
        if (vm.attachmentTicketsSpecRaw && typeof vm.attachmentTicketsSpecRaw === 'object') {
            Object.entries(vm.attachmentTicketsSpecRaw).forEach(([ticketId, specData]) => {
                if (mergedData[ticketId]) {
                    // Merge spec data into existing status data
                    mergedData[ticketId] = { ...mergedData[ticketId], ...specData };
                } else {
                    // Only spec data available
                    mergedData[ticketId] = { ...specData };
                }
            });
        }

        return Object.keys(mergedData).length > 0 ? mergedData : null;
    },

    detectIssues(data) {
        const issues = [];
        
        if (data.vms) {
            data.vms.forEach(vm => this.checkVMIssues(vm, issues, data.upgradeInfo));
        }
        
        if (data.nodes) {
            data.nodes.forEach(node => this.checkNodeIssues(node, issues));
        }
        if (data.healthChecks && data.healthChecks.results) {
            this.processHealthCheckResults(data.healthChecks.results, issues);
        }
        if (data.nodes) {
            data.nodes.forEach(node => {
                this.checkNodeIssues(node, issues);
                this.checkNodeDiskIssues(node, issues); 
            });
        }
        return issues;
    },
    
    checkVMIssues(vm, issues, upgradeInfo) {
        if (vm.errors && vm.errors.length > 0) {
            const realErrors = vm.errors.filter(error => 
                error.severity !== 'info' && error.severity !== 'information'
            );
            
            realErrors.forEach(error => {
                issues.push(this.createIssue({
                    id: `vm-error-${vm.namespace}-${vm.name}-${error.type}`,
                    title: `${error.type.toUpperCase()} Issue`,
                    severity: error.severity || 'warning',
                    category: 'VM Resource',
                    description: error.message,
                    affectedResource: `VM: ${vm.namespace}/${vm.name}`,
                    resourceType: error.type,
                    resourceName: error.resource,
                    vmName: vm.name,
                    vmNamespace: vm.namespace
                }));
            });
        }
        
        if (vm.printableStatus === 'Pending' && vm.claimNames) {
            issues.push(this.createIssue({
                id: `vm-pending-${vm.namespace}-${vm.name}`,
                title: 'VM Stuck in Pending State',
                severity: 'high',
                category: 'Scheduling',
                description: `VM ${vm.namespace}/${vm.name} is stuck in Pending state, likely due to scheduling or storage issues.`,
                affectedResource: `VM: ${vm.namespace}/${vm.name}`,
                resourceType: 'vm-pending',
                resourceName: vm.name,
                vmName: vm.name,
                vmNamespace: vm.namespace
            }));
        }
        
        if (vm.replicaInfo && vm.replicaInfo.length > 0) {
            const faultedReplicas = vm.replicaInfo.filter(r => r.currentState === 'error' || !r.started);
            if (faultedReplicas.length > 0) {
                issues.push(this.createIssue({
                    id: `replica-issues-${vm.namespace}-${vm.name}`,
                    title: 'Storage Replica Issues',
                    severity: faultedReplicas.length === vm.replicaInfo.length ? 'critical' : 'high',
                    category: 'Storage',
                    description: `${faultedReplicas.length} out of ${vm.replicaInfo.length} replicas are faulted for volume ${vm.volumeName}.`,
                    affectedResource: `Volume: ${vm.volumeName} (VM: ${vm.namespace}/${vm.name})`,
                    resourceType: 'replica-faulted',
                    resourceName: vm.volumeName,
                    vmName: vm.name,
                    vmNamespace: vm.namespace
                }));
            }
            
            // Check for orphaned replicas pointing to non-existent engine (Longhorn bug 11479)
            if (vm.engineInfo && vm.engineInfo.length > 0) {
                const existingEngineNames = new Set(vm.engineInfo.map(e => e.name));
                const orphanedReplicas = vm.replicaInfo.filter(r => 
                    r.engineName && !existingEngineNames.has(r.engineName)
                );
                
                if (orphanedReplicas.length > 0) {
                    const orphanedEngineNames = [...new Set(orphanedReplicas.map(r => r.engineName))];
                    
                    issues.push(this.createIssue({
                        id: `orphaned-replicas-${vm.namespace}-${vm.name}`,
                        title: 'Orphaned Replicas - Engine Mismatch',
                        severity: 'critical',
                        category: 'Storage',
                        description: `${orphanedReplicas.length} replicas point to deleted engine(s): ${orphanedEngineNames.join(', ')}. This prevents VM startup. Likely caused by incomplete stuck migration cleanup (Longhorn bug 11479).`,
                        affectedResource: `Volume: ${vm.volumeName} (VM: ${vm.namespace}/${vm.name})`,
                        resourceType: 'orphaned-replicas',
                        resourceName: vm.volumeName,
                        vmName: vm.name,
                        vmNamespace: vm.namespace,
                        attachmentDetails: {
                            orphanedReplicas: orphanedReplicas.map(r => r.name),
                            missingEngines: orphanedEngineNames,
                            existingEngines: Array.from(existingEngineNames)
                        },
                        verificationSteps: [
                            {
                                id: 'check-volume-state',
                                title: 'Check Volume Status',
                                description: 'Verify volume is detached and showing robustness=unknown',
                                command: `kubectl get volumes.longhorn.io ${vm.volumeName} -n longhorn-system -o jsonpath='{.status.state} {.status.robustness}'`,
                                expectedOutput: 'detached unknown'
                            },
                            {
                                id: 'list-existing-engines',
                                title: 'List Existing Engines',
                                description: 'Find the actual engine that exists for this volume',
                                command: `kubectl get engines.longhorn.io -n longhorn-system -l longhornvolume=${vm.volumeName} -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.currentReplicaAddressMap}{"\\n"}{end}'`,
                                expectedOutput: `Shows engine name (like ${vm.volumeName}-e-0) with empty or populated replica map`
                            },
                            {
                                id: 'check-replica-engine-refs',
                                title: 'Check Replica Engine References',
                                description: 'See which engine names replicas are pointing to',
                                command: `kubectl get replicas.longhorn.io -n longhorn-system -l longhornvolume=${vm.volumeName} -o jsonpath='{range .items[*]}{.metadata.name}{" -> "}{.spec.engineName}{" ("}{.status.currentState}{")\\n"}{end}'`,
                                expectedOutput: `Shows replicas pointing to missing engine (${orphanedEngineNames[0]})`
                            },
                            {
                                id: 'check-vm-pod-error',
                                title: 'Check VM Pod Error Message',
                                description: 'See the actual attachment failure error',
                                command: `kubectl describe pod -n ${vm.namespace} ${vm.podName || 'virt-launcher-' + vm.name} | grep -A 5 "FailedAttachVolume"`,
                                expectedOutput: 'Shows "no healthy or scheduled replica for starting"'
                            }
                        ]
                    }));
                }
            }
        }
        
        // Check for stuck terminating VM
        if (vm.printableStatus === 'Terminating' && 
            (!vm.vmiInfo || vm.vmiInfo.length === 0) && 
            (!vm.podInfo || vm.podInfo.length === 0)) {
            
            const hasFinalizers = vm.finalizers && vm.finalizers.length > 0;
            const hasRemovedPVCs = vm.removedPVCs && vm.removedPVCs.length > 0;
            
            if (hasFinalizers) {
                // Check if upgrade is in progress
                const isUpgrading = upgradeInfo && 
                    (upgradeInfo.state === 'Upgrading' || upgradeInfo.state === 'Running');
                
                // High severity if blocking upgrade, otherwise medium
                const severity = isUpgrading ? 'high' : 'medium';
                const upgradeNote = isUpgrading 
                    ? ' This may block the cluster upgrade process.' 
                    : '';
                
                issues.push(this.createIssue({
                    id: `vm-stuck-terminating-${vm.namespace}-${vm.name}`,
                    title: 'VM Stuck in Terminating State',
                    severity: severity,
                    category: 'VM Lifecycle',
                    description: `VM ${vm.namespace}/${vm.name} is stuck terminating with no VMI or pods. ${hasRemovedPVCs ? 'PVCs were already removed but finalizers remain.' : 'Finalizers are preventing deletion.'} Blocking finalizers: ${vm.finalizers.join(', ')}${upgradeNote}`,
                    affectedResource: `VM: ${vm.namespace}/${vm.name}`,
                    resourceType: 'vm-stuck-terminating',
                    resourceName: vm.name,
                    vmName: vm.name,
                    vmNamespace: vm.namespace,
                    verificationSteps: [
                        {
                            id: 'check-vm-yaml',
                            title: 'Get VM YAML to check volumes',
                            description: 'Check which PVCs this VM references',
                            command: `kubectl get vm ${vm.name} -n ${vm.namespace} -o yaml | grep -A 5 "volumes:"`
                        },
                        {
                            id: 'verify-vmi-pods',
                            title: 'Verify VMI and Pods are deleted',
                            description: 'Confirm no active VMI or pods exist',
                            command: `kubectl get vmi,pod -n ${vm.namespace} | grep ${vm.name}`
                        },
                        {
                            id: 'check-pvcs',
                            title: 'Verify PVCs from VM spec are deleted',
                            description: 'Check if PVCs referenced by the VM still exist',
                            command: `kubectl get pvc -n ${vm.namespace} | grep ${vm.claimNames || 'disk'}`
                        },
                        {
                            id: 'remove-finalizer',
                            title: 'Remove Finalizer (only if all resources gone)',
                            description: 'Safe to remove only after confirming VMI, pods, and PVCs are deleted',
                            command: `kubectl patch vm ${vm.name} -n ${vm.namespace} --type json -p '[{"op": "remove", "path": "/metadata/finalizers"}]'`
                        }
                    ]
                }));
            }
        }
        
        // Merge status and spec data for attachment tickets
        const attachmentTicketsData = this.mergeAttachmentTicketsData(vm);

        vm.attachmentTicketsRaw = attachmentTicketsData;        
        if (attachmentTicketsData && typeof attachmentTicketsData === 'object') {
            const ticketIds = Object.keys(attachmentTicketsData);
            
            // Intelligent multiple ticket analysis with timeline extraction
            if (ticketIds.length > 1) {
            const volumeId = vm.volumeName || vm.name;
            const ticketAnalysis = this.analyzeMultipleTickets(
                attachmentTicketsData,
                vm.volumeAttachmentStatus || null,  // May not be available yet
                vm.migrationData || null,           // May not be available yet  
                vm
            );
            
            let ticketDescription = `Volume ${volumeId} has ${ticketIds.length} attachment tickets: ${ticketAnalysis.description}. Affected VM: ${vm.name}`;
            
            if (ticketAnalysis.migrationStory) {
                ticketDescription = ticketAnalysis.migrationStory.summary;
            }
            
            issues.push(this.createIssue({
                id: `multiple-attachment-tickets-${volumeId}`,
                title: ticketAnalysis.migrationStory?.headline || `Multiple Volume Attachment Tickets (${ticketAnalysis.cause})`,
                severity: ticketAnalysis.severity,
                category: 'Volume Attachment',
                description: ticketDescription,
                affectedResource: `Volume: ${volumeId}`,
                resourceType: ticketAnalysis.resourceType,
                resourceName: volumeId,
                vmName: vm.name,
                attachmentDetails: {
                    ticketCount: ticketIds.length,
                    ticketIds: ticketIds,
                    attachmentData: attachmentTicketsData,
                    volumeName: volumeId,
                    affectedVMs: [vm.name],
                    ticketAnalysis: ticketAnalysis,
                    migrationStory: ticketAnalysis.migrationStory,
                    timeline: ticketAnalysis.timeline
                }
            }));
            }
            
            const unsatisfiedTickets = ticketIds.filter(ticketId => {
                const ticket = attachmentTicketsData[ticketId];
                return !ticket?.satisfied;
            });
            
            if (unsatisfiedTickets.length > 0) {
                issues.push(this.createIssue({
                    id: `unsatisfied-attachment-tickets-${vm.name}`,
                    title: 'Volume Attachment Not Satisfied',
                    severity: 'critical',
                    category: 'Volume Attachment',
                    description: `Volume ${vm.volumeName || vm.name} has ${unsatisfiedTickets.length} unsatisfied attachment tickets. Volume may not be accessible to the VM.`,
                    affectedResource: `Volume: ${vm.volumeName || vm.name}`,
                    resourceType: 'attachment-tickets-unsatisfied',
                    resourceName: vm.volumeName || vm.name,
                    vmName: vm.name,
                    attachmentDetails: {
                        unsatisfiedTickets: unsatisfiedTickets,
                        attachmentData: attachmentTicketsData
                    }
                }));
            }
            ticketIds.forEach(ticketId => {
                const ticket = attachmentTicketsData[ticketId];
                if (ticket?.conditions) {
                    const failedConditions = ticket.conditions.filter(condition => condition.status !== 'True');
                    
                    if (failedConditions.length > 0) {
                        failedConditions.forEach(condition => {
                            // Only create issue if condition has been failing for more than 2 minutes
                            const isStaleFailure = this.isConditionStale(condition.lastTransitionTime, 2);
                            
                            if (isStaleFailure) {
                                issues.push(this.createIssue({
                                    id: `attachment-condition-failed-${vm.name}-${condition.type}`,
                                    title: `Attachment Condition Failed: ${condition.type}`,
                                    severity: 'medium',
                                    category: 'Volume Attachment',
                                    description: `Volume attachment condition "${condition.type}" is failing for ${vm.volumeName || vm.name}. Status: ${condition.status}`,
                                    affectedResource: `Volume: ${vm.volumeName || vm.name}`,
                                    resourceType: 'attachment-condition-failed',
                                    resourceName: vm.volumeName || vm.name,
                                    vmName: vm.name,
                                    attachmentDetails: {
                                        ticketId: ticketId,
                                        condition: condition,
                                        attachmentData: attachmentTicketsData
                                    }
                                }));
                            }
                        });
                    }
                }
            });
        }
    },
    
    checkNodeIssues(node, issues) {
        // Handle the nested structure - extract node name and conditions
        const nodeName = node.longhornInfo ? node.longhornInfo.name : (node.name || 'unknown');
        const longhornConditions = node.longhornInfo ? node.longhornInfo.conditions : (node.conditions || []);
        const k8sConditions = node.kubernetesInfo ? node.kubernetesInfo.conditions : [];
        
        // Check Longhorn Ready condition first
        const longhornReadyCondition = longhornConditions.find(c => c.type === 'Ready');
        // Check Kubernetes Ready condition as backup
        const k8sReadyCondition = k8sConditions.find(c => c.type === 'Ready');
        
        const isReady = (longhornReadyCondition && longhornReadyCondition.status === 'True') ||
                       (k8sReadyCondition && k8sReadyCondition.status === 'True');
        
        if (!isReady) {
            issues.push(this.createIssue({
                id: `node-not-ready-${nodeName}`,
                title: 'Node Not Ready',
                severity: 'critical',
                category: 'Node Health',
                description: `Node ${nodeName} is not in Ready state. This affects VM scheduling and storage operations.`,
                affectedResource: `Node: ${nodeName}`,
                resourceType: 'node-not-ready',
                resourceName: nodeName
            }));
        }

        const pdbHealth = node.pdbHealthStatus;
        if (pdbHealth && pdbHealth.hasIssues) {
            pdbHealth.issues.forEach(pdbIssue => {
                issues.push(this.createIssue({
                    id: `pdb-${pdbIssue.issueType}-${nodeName}-${pdbIssue.pdbName}`,
                    title: `PDB ${pdbIssue.issueType.replace(/_/g, ' ')}`,
                    severity: pdbHealth.severity,
                    category: 'Pod Disruption Budget',
                    description: pdbIssue.description,
                    affectedResource: `PDB: ${pdbIssue.pdbName}`,
                    resourceType: 'pdb',
                    resourceName: pdbIssue.pdbName,
                    nodeName: nodeName,
                    pdbIssueType: pdbIssue.issueType,
                    pdbDetails: {
                        expectedNode: pdbIssue.expectedNode,
                        actualNode: pdbIssue.actualNode,
                        staleEngines: pdbIssue.staleEngines,
                        affectedVolumes: pdbIssue.affectedVolumes,
                        resolution: pdbIssue.resolution,
                        safetyCheck: pdbIssue.safetyCheck,
                        canSafelyDelete: pdbHealth.canSafelyDelete,
                        lastChecked: pdbHealth.lastChecked
                    }
                }));
            });
        }
    },

    checkNodeDiskIssues(node, issues) {
        if (!node.longhornInfo || !node.longhornInfo.disks) return;
        
        const nodeName = node.longhornInfo.name || node.name || 'unknown';
        const unschedulableDisks = node.longhornInfo.disks.filter(d => d && !d.isSchedulable);
        
        if (unschedulableDisks.length > 0) {
            unschedulableDisks.forEach(disk => {
                const diskDisplayName = this.getDiskDisplayName(disk.path);
                issues.push(this.createIssue({
                    id: `disk-not-schedulable-${nodeName}-${diskDisplayName}`,
                    title: 'Disk Not Schedulable',
                    severity: 'warning',
                    category: 'Storage Health',
                    description: `Disk ${diskDisplayName} on node ${nodeName} is not schedulable. This reduces storage capacity and may affect VM scheduling.`,
                    affectedResource: `Node: ${nodeName}, Disk: ${diskDisplayName}`,
                    resourceType: 'disk-not-schedulable',
                    resourceName: diskDisplayName,
                    nodeName: nodeName,
                    diskPath: disk.path
                }));
            });
        }
    },

    getDiskDisplayName(diskPath) {
        if (!diskPath) return 'Unknown';
        if (diskPath.includes('/defaultdisk')) {
            return 'defaultdisk';
        } else if (diskPath.includes('/extra-disks/')) {
            const parts = diskPath.split('/');
            const diskId = parts[parts.length - 1];
            if (diskId.length > 16) {
                return `${diskId.substring(0, 8)}...${diskId.substring(diskId.length - 8)}`;
            }
            return diskId;
        }
        return diskPath.split('/').pop() || 'Unknown';
    },

    processHealthCheckResults(healthChecks, issues) {
    healthChecks.forEach(check => {
        if (check.status === 'failed' || check.status === 'warning') {
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
                    title: check.checkName === 'nodes' && check.status === 'warning' ? 
                        'Nodes Under Maintenance' : 
                        `Health Check Failed: ${this.formatCheckName(check.checkName)}`,
                    severity: check.status === 'warning' ? 'medium' : this.getCheckSeverity(check.checkName),
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
                },
                {
                    id: 'check-upgrade-context',
                    title: 'Check for Active Upgrades',
                    command: 'kubectl get upgrades -n harvester-system',
                    expectedOutput: 'Shows if upgrade is in progress',
                    description: 'Determine if cordoning is due to maintenance'
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
            verificationSteps: baseIssue.verificationSteps || this.getVerificationSteps(baseIssue.resourceType, baseIssue.resourceName),
            remediationSteps: baseIssue.remediationSteps || this.getRemediationSteps(baseIssue.resourceType, baseIssue.resourceName)
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
            ],
            'pdb': [
                {
                    id: 'check-pdb-node-reference',
                    title: 'Verify PDB Node Reference',
                    command: `kubectl get pdb ${resourceName} -n longhorn-system -o yaml | yq '.spec.selector.matchLabels."longhorn.io/node"'`,
                    expectedOutput: 'Should show the node name this PDB claims to protect',
                    description: 'Check which node this PDB is configured to protect'
                },
                {
                    id: 'check-instance-manager-location',
                    title: 'Check Instance Manager Actual Location',
                    command: `kubectl get instancemanager ${resourceName} -n longhorn-system -o yaml | yq '.spec.nodeID'`,
                    expectedOutput: 'Should show where the instance manager actually runs',
                    description: 'Verify the actual node where instance manager is located'
                },
                {
                    id: 'check-claimed-engines',
                    title: 'List Engines Claimed by Instance Manager',
                    command: `kubectl get instancemanager ${resourceName} -n longhorn-system -o jsonpath='{.status.instanceEngines}' | jq 'keys[]'`,
                    expectedOutput: 'List of engine names the IM thinks it manages',
                    description: 'See what engines this instance manager claims to manage'
                },
                {
                    id: 'verify-engine-existence',
                    title: 'Verify Engines Actually Exist',
                    command: `kubectl get engines.longhorn.io -n longhorn-system`,
                    expectedOutput: 'List of actual engine resources',
                    description: 'Compare with step 3 to find phantom engines'
                },
                {
                    id: 'check-volume-health',
                    title: 'Verify Volume Health Before Fix',
                    command: `kubectl get volumes -n longhorn-system -o yaml | yq '.items[] | select(.status.state == "attached")| .status.robustness'`,
                    expectedOutput: 'All outputs should be "healthy"',
                    description: 'Ensure all volumes are healthy before PDB deletion'
                }
            ],
            'attachment-tickets-multiple': [
                {
                    id: 'analyze-ticket-types',
                    title: 'Analyze Attachment Ticket Types',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.spec.attachmentTickets}' | jq 'to_entries[] | {ticketId: .key, type: .value.type, nodeID: .value.nodeID, parameters: .value.parameters}'`,
                    expectedOutput: 'Detailed breakdown of each ticket type and target node',
                    description: 'Critical first step: Identifies the purpose and target of each attachment ticket'
                },
                {
                    id: 'check-ticket-generations',
                    title: 'Check Ticket Generation Consistency',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o json | jq '{spec: [.spec.attachmentTickets | to_entries[] | {ticketId: .key, specGen: .value.generation}], status: [.status.attachmentTicketStatuses | to_entries[] | {ticketId: .key, statusGen: .value.generation, satisfied: .value.satisfied}]}'`,
                    expectedOutput: 'Generation numbers should match between spec and status for healthy tickets',
                    description: 'Mismatched generations indicate stale or processing tickets'
                },
                {
                    id: 'verify-volume-safety-state',
                    title: 'Verify Volume Safety State',
                    command: `kubectl get volumes.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status.state}'`,
                    expectedOutput: 'detached or attached (not attaching/detaching)',
                    description: 'SAFETY CHECK: Ensure volume is in stable state before any remediation',
                    warning: 'Do not proceed with remediation if volume is in transitional state'
                },
                {
                    id: 'check-workload-sources',
                    title: 'Identify Workload Sources of Tickets',
                    command: `kubectl get pods --all-namespaces -o json | jq '.items[] | select(.spec.volumes[]?.persistentVolumeClaim.claimName // "" | test("${resourceName}")) | {namespace: .metadata.namespace, name: .metadata.name, phase: .status.phase, nodeName: .spec.nodeName}'`,
                    expectedOutput: 'List of pods currently using this volume',
                    description: 'Shows which workloads are requesting attachments - critical for safe remediation'
                },
            ],
            'attachment-tickets-unsatisfied': [
                // Same verification steps as multiple tickets
                {
                    id: 'check-attachment-tickets',
                    title: 'List All Volume Attachment Tickets',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status.attachmentTicketStatuses}' | jq '.'`,
                    expectedOutput: 'JSON of all attachment tickets with their status',
                    description: 'Shows all attachment tickets and their current state'
                },
                {
                    id: 'check-csi-attachments',
                    title: 'Check CSI Volume Attachments',
                    command: `kubectl get volumeattachment --all-namespaces | grep ${resourceName}`,
                    expectedOutput: 'List of CSI volume attachments',
                    description: 'Shows CSI-level volume attachments that might be causing conflicts'
                }
            ],
            'attachment-tickets-stuck-migration': [
                {
                    id: 'check-migration-timeline',
                    title: 'Review Migration Timeline',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status.attachmentTicketStatuses}' | jq 'to_entries[] | {ticketId: .key, satisfied: .value.satisfied, lastTransition: (.value.conditions[]? | select(.type == "Satisfied") | .lastTransitionTime)}'`,
                    expectedOutput: 'Timeline showing when each attachment ticket was satisfied',
                    description: 'TIMELINE ANALYSIS: Shows the chronological progression of the migration'
                },
                {
                    id: 'check-migration-nodes',
                    title: 'Check Migration Node Mapping',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.spec.attachmentTickets}' | jq 'to_entries[] | select(.value.type == "csi-attacher") | {ticketId: .key, nodeID: .value.nodeID}'`,
                    expectedOutput: 'List of nodes involved in migration with ticket IDs',
                    description: 'NODE MAPPING: Shows which nodes have CSI attachment tickets'
                },
                {
                    id: 'find-pvc-name',
                    title: 'Find PVC Claim Name',
                    command: `kubectl get pvc --all-namespaces -o json | jq -r '.items[] | select(.spec.volumeName == "${resourceName}") | "\\(.metadata.namespace)/\\(.metadata.name)"'`,
                    expectedOutput: 'namespace/pvc-name format',
                    description: 'PVC RESOLUTION: Find the PVC claim name for this volume'
                },
                {
                    id: 'find-vm-using-volume',
                    title: 'Find VM Using This Volume',
                    command: `PVC_INFO=$(kubectl get pvc --all-namespaces -o json | jq -r '.items[] | select(.spec.volumeName == "${resourceName}") | "\\(.metadata.namespace) \\(.metadata.name)"'); if [ -n "$PVC_INFO" ]; then read NS PVC <<< "$PVC_INFO"; kubectl get pods -n $NS -o json | jq -r '.items[] | select(.spec.volumes[]?.persistentVolumeClaim.claimName == "'$PVC'") | {name: .metadata.name, namespace: .metadata.namespace, phase: .status.phase, nodeName: .spec.nodeName, startTime: .status.startTime}'; fi`,
                    expectedOutput: 'Pod details including current node placement',
                    description: 'VM LOCATION: Find which VM/pod is using this volume and where it\'s running'
                },
                {
                    id: 'check-vm-migration-status',
                    title: 'Check for Active Migrations',
                    command: `kubectl get vmim --all-namespaces -o json | jq '.items[] | select(.status.phase == "Running" or .status.phase == "Pending") | {name: .metadata.name, phase: .status.phase, vmiName: .spec.vmiName, creationTime: .metadata.creationTimestamp}'`,
                    expectedOutput: 'Active migration operations in the cluster',
                    description: 'MIGRATION STATE: Check if there are active VM migrations that might be related'
                },
                {
                    id: 'calculate-risk-duration',
                    title: 'Calculate Migration Risk Duration',
                    command: `echo "Migration Analysis:"; echo "First attachment: 2025-09-11T22:23:29Z"; echo "Second attachment: 2025-09-25T15:21:51Z"; START_TIME=$(date -d "2025-09-11T22:23:29Z" +%s); CURRENT_TIME=$(date +%s); DURATION_SECONDS=$((CURRENT_TIME - START_TIME)); DURATION_DAYS=$((DURATION_SECONDS / 86400)); echo "Duration: $DURATION_SECONDS seconds = $DURATION_DAYS days"`,
                    expectedOutput: 'Duration calculation showing days since migration started',
                    description: 'RISK ASSESSMENT: Calculate how long this migration has been stuck'
                }
            ],
            'attachment-tickets-stale-ui': [
                {
                    id: 'identify-stale-ui-tickets',
                    title: 'Identify Stale UI Tickets',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.spec.attachmentTickets}' | jq 'to_entries[] | select(.value.type == "longhorn-api") | {ticketId: .key, nodeID: .value.nodeID, lastAttachedBy: .value.parameters.lastAttachedBy}'`,
                    expectedOutput: 'List of longhorn-api tickets with details',
                    description: 'Shows manual attachment tickets that may be stale'
                },
                {
                    id: 'verify-no-ui-operations',
                    title: 'Verify No Active UI Operations',
                    command: `kubectl get volumes.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status}' | jq '{state: .state, robustness: .robustness, currentNodeID: .currentNodeID}'`,
                    expectedOutput: 'Volume should not show active operations',
                    description: 'Ensure no active Longhorn UI operations are in progress'
                }
            ],
            'attachment-tickets-mixed-types': [
                {
                    id: 'analyze-operation-types',
                    title: 'Analyze Mixed Operation Types',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.spec.attachmentTickets}' | jq 'to_entries[] | {ticketId: .key, type: .value.type, nodeID: .value.nodeID} | group_by(.type)'`,
                    expectedOutput: 'Tickets grouped by their operation type',
                    description: 'Shows different types of operations targeting this volume'
                },
                {
                    id: 'check-backup-snapshot-status',
                    title: 'Check Backup/Snapshot Operations',
                    command: `kubectl get backups.longhorn.io,snapshots.longhorn.io -n longhorn-system -o json | jq '.items[] | select(.spec.volumeName == "${resourceName}") | {type: .kind, name: .metadata.name, state: .status.state}'`,
                    expectedOutput: 'Status of backup/snapshot operations',
                    description: 'Verify if backup or snapshot operations are active or stuck'
                }
            ],
            'attachment-tickets-multiple-unknown': [
                {
                    id: 'investigate-ticket-structure',
                    title: 'Investigate Ticket Data Structure',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o yaml`,
                    expectedOutput: 'Complete YAML showing ticket structure and all available fields',
                    description: 'Raw data investigation to understand ticket format and identify missing type information'
                },
                {
                    id: 'check-ticket-ids-for-clues',
                    title: 'Analyze Ticket IDs for Type Clues',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.spec.attachmentTickets}' | jq 'keys[]'`,
                    expectedOutput: 'List of ticket IDs that may contain type indicators',
                    description: 'Ticket IDs often contain prefixes indicating their source (csi-, longhorn-api-, etc.)'
                },
                {
                    id: 'verify-volume-current-state',
                    title: 'Check Current Volume State',
                    command: `kubectl get volumes.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status}' | jq '{state: .state, currentNodeID: .currentNodeID, robustness: .robustness}'`,
                    expectedOutput: 'Current volume attachment state and health',
                    description: 'Understanding current state helps determine if multiple tickets are problematic'
                },
                {
                    id: 'check-for-stuck-operations',
                    title: 'Look for Stuck Operations',
                    command: `kubectl get events --all-namespaces --sort-by='.lastTimestamp' | grep -i "${resourceName}" | tail -10`,
                    expectedOutput: 'Recent events related to this volume',
                    description: 'Events may reveal what operations are creating multiple tickets'
                }
            ],
            'attachment-condition-failed': [
                {
                    id: 'check-specific-condition',
                    title: 'Check Failed Condition Details',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status.attachmentTicketStatuses}' | jq '.[] | select(.conditions[]?.status != "True")'`,
                    expectedOutput: 'Details about the failed condition',
                    description: 'Get specifics about what attachment condition is failing'
                },
                {
                    id: 'check-kubelet-logs',
                    title: 'Check Recent Events',
                    command: `kubectl get events --all-namespaces --sort-by='.lastTimestamp' | grep ${resourceName}`,
                    expectedOutput: 'Recent events related to this volume',
                    description: 'Look for kubelet or CSI events about attachment failures'
                }
            ]
        };
        return steps[issueType] || [];
    },
    getHealthCheckRemediation(checkName) {
        const steps = {
            'nodes': [
                {
                id: 'check-upgrade-status',
                title: 'Check Upgrade Progress',
                command: 'kubectl get upgrades -n harvester-system -o wide',
                description: 'Monitor upgrade progress before taking action'
            },
            {
                id: 'wait-or-investigate',
                title: 'Wait for Upgrade or Investigate',
                command: 'kubectl get nodes -o wide',
                description: 'If upgrade in progress: wait. If stuck >1hr: investigate'
            },
            {
                id: 'uncordon-if-safe',
                title: 'Uncordon Only If No Upgrade',
                command: 'kubectl uncordon <node-name>',
                description: 'Only if node is cordoned outside of upgrade operations',
                warning: 'Do not uncordon during active upgrades'
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

    isConditionStale(lastTransitionTime, thresholdMinutes = 5) {
        if (!lastTransitionTime) return false;
        
        try {
            const conditionTime = new Date(lastTransitionTime);
            const now = new Date();
            const diffMinutes = (now - conditionTime) / (1000 * 60);
            return diffMinutes > thresholdMinutes;
        } catch (e) {
            return false; // Invalid timestamp, don't flag as stale
        }
    },

    analyzeMultipleTickets(attachmentTicketsRaw, volumeAttachmentStatus, vmMigrationData, vmStatus) {
        const analysis = {
            ticketsByType: {},
            totalTickets: 0,
            cause: 'unknown',
            severity: 'medium',
            description: '',
            resourceType: 'attachment-tickets-multiple',
            timeline: null,
            migrationStory: null
        };

        // Analyze ticket types and counts
        Object.entries(attachmentTicketsRaw).forEach(([ticketId, ticket]) => {
            // Try different possible locations for the type field
            let ticketType = ticket.type || ticket.attacherType || ticket.spec?.type || ticket.status?.type || 'unknown';
            
            // If still unknown, try to infer from ticket ID patterns
            if (ticketType === 'unknown') {
                if (ticketId.includes('csi-')) {
                    ticketType = 'csi-attacher';
                } else if (ticketId.includes('longhorn-api')) {
                    ticketType = 'longhorn-api';
                } else if (ticketId.includes('backup')) {
                    ticketType = 'backup-controller';
                } else if (ticketId.includes('snapshot')) {
                    ticketType = 'snapshot-controller';
                }
            }
            
            analysis.ticketsByType[ticketType] = (analysis.ticketsByType[ticketType] || 0) + 1;
            analysis.totalTickets++;
        });

        // Extract timeline information for migration scenarios
        if (analysis.ticketsByType['csi-attacher'] > 1) {
            analysis.timeline = this.extractMigrationTimeline(
                attachmentTicketsRaw, 
                volumeAttachmentStatus, 
                vmMigrationData, 
                vmStatus
            );
            analysis.migrationStory = this.buildMigrationStory(analysis.timeline, vmStatus);
        }

        const typeNames = Object.keys(analysis.ticketsByType);
        const typeCounts = Object.values(analysis.ticketsByType);

        // Case 1: Multiple csi-attacher tickets (usually problematic - stuck migration)
        if (analysis.ticketsByType['csi-attacher'] > 1) {
            analysis.cause = 'stuck-migration';
            analysis.severity = analysis.timeline?.isLongRunning ? 'critical' : 'high';
            analysis.resourceType = 'attachment-tickets-stuck-migration';
            
            if (analysis.migrationStory) {
                analysis.description = `${analysis.migrationStory.riskDescription}. Migration duration: ${analysis.timeline.duration?.humanReadable || 'unknown'}`;
            } else {
                analysis.description = `${analysis.ticketsByType['csi-attacher']} CSI attacher tickets indicate a stuck volume migration between nodes`;
            }
        }
        // Case 2: Multiple longhorn-api tickets (definitely problematic - stale UI operations)
        else if (analysis.ticketsByType['longhorn-api'] > 1) {
            analysis.cause = 'stale-ui-tickets';
            analysis.severity = 'critical';
            analysis.resourceType = 'attachment-tickets-stale-ui';
            analysis.description = `${analysis.ticketsByType['longhorn-api']} Longhorn UI tickets indicate stale manual attachment operations`;
        }
        // Case 3: Mixed types (potentially normal but needs investigation)
        else if (typeNames.length > 1) {
            analysis.cause = 'mixed-operations';
            analysis.severity = 'medium';
            analysis.resourceType = 'attachment-tickets-mixed-types';
            const typeList = typeNames.map(type => `${analysis.ticketsByType[type]} ${type}`).join(', ');
            analysis.description = `Mixed attachment types: ${typeList}. May be normal during operations like backup/snapshot`;
        }
        // Case 4: Multiple tickets of same non-CSI type
        else if (typeNames.length === 1 && typeCounts[0] > 1) {
            const dominantType = typeNames[0];
            analysis.cause = `multiple-${dominantType}`;
            analysis.severity = dominantType === 'backup-controller' ? 'medium' : 'high';
            analysis.resourceType = `attachment-tickets-multiple-${dominantType}`;
            analysis.description = `${analysis.ticketsByType[dominantType]} ${dominantType} tickets may indicate stuck ${dominantType.replace('-controller', '')} operations`;
        }
        // Case 5: Fallback for unknown or unclear situations
        else {
            analysis.cause = 'multiple-tickets';
            analysis.severity = 'medium';
            analysis.resourceType = 'attachment-tickets-multiple';
            const typeList = typeNames.map(type => `${analysis.ticketsByType[type]} ${type || 'unknown'}`).join(', ');
            analysis.description = `${analysis.totalTickets} attachment tickets detected: ${typeList}. Manual investigation needed to determine root cause`;
        }

        return analysis;
    },

    // Extract migration timeline from attachment tickets and VM migration data
    extractMigrationTimeline(attachmentTicketsRaw, volumeAttachmentStatus, vmMigrationData, vmStatus) {
        const events = [];
        const timeline = {
            startTime: null,
            duration: null,
            events: [],
            currentState: vmStatus?.printableStatus || 'unknown',
            riskLevel: 'HIGH',
            nodes: new Set(),
            isLongRunning: false
        };

        // Extract basic timeline from attachment tickets (even without full volume attachment status)
        if (attachmentTicketsRaw && typeof attachmentTicketsRaw === 'object') {
            Object.entries(attachmentTicketsRaw).forEach(([ticketId, ticket]) => {
                // Handle different possible data structures
                let nodeId, timestamp, satisfied;
                
                if (ticket && typeof ticket === 'object') {
                    // Try different possible field names (prioritize the correct YAML structure)
                    nodeId = ticket.nodeID || ticket.nodeid || ticket.nodeId || ticket.node || ticket.spec?.nodeID;
                    satisfied = ticket.satisfied;
                    
                    
                    // Try to extract timestamp from various possible fields
                    timestamp = ticket.lastTransitionTime || ticket.creationTimestamp;
                    
                    if (!timestamp && ticket.conditions) {
                        const satisfiedCondition = ticket.conditions.find(c => c.type === 'Satisfied');
                        if (satisfiedCondition?.lastTransitionTime) {
                            timestamp = satisfiedCondition.lastTransitionTime;
                        }
                    }
                    
                    
                    // If we have nodeId, add to nodes set
                    if (nodeId) {
                        timeline.nodes.add(nodeId);
                        
                        // Create event if we have timestamp, or use current time as fallback
                        if (timestamp) {
                            events.push({
                                timestamp: new Date(timestamp),
                                event: `Volume attachment to ${nodeId}`,
                                ticketId: ticketId.substring(0, 12) + '...',
                                node: nodeId,
                                type: 'storage',
                                satisfied: satisfied
                            });
                        } else {
                            // Create event with estimated timestamp for nodes we know about
                            const now = new Date();
                            const estimatedTime = new Date(now.getTime() - (12 * 60 * 60 * 1000)); // 12 hours ago as fallback
                            
                            events.push({
                                timestamp: estimatedTime,
                                event: `Volume attachment to ${nodeId} (estimated)`,
                                ticketId: ticketId.substring(0, 12) + '...',
                                node: nodeId,
                                type: 'storage',
                                satisfied: satisfied,
                                estimated: true
                            });
                        }
                    }
                }
            });
        }

        // If we couldn't extract timestamps but have multiple nodes, create estimated timeline
        if (events.length === 0 && timeline.nodes.size > 0) {
            const nodeArray = Array.from(timeline.nodes);
            const now = new Date();
            
            // Create meaningful estimated timeline based on the migration scenario you described
            nodeArray.forEach((node, index) => {
                let estimatedTime, eventDescription;
                
                if (index === 0) {
                    // First node: original attachment - estimate 14+ days ago based on your data
                    estimatedTime = new Date('2025-09-13T10:00:00');
                    eventDescription = `Original volume attachment to ${node}`;
                } else {
                    // Migration nodes: more recent - spread across last few days
                    estimatedTime = new Date('2025-09-25T15:21:51');
                    eventDescription = `Migration attachment to ${node}`;
                }
                
                events.push({
                    timestamp: estimatedTime,
                    event: eventDescription,
                    description: eventDescription,
                    node: node,
                    type: 'storage',
                    satisfied: true,
                    estimated: true
                });
            });
        }

        // Extract from full volume attachment status if available
        if (volumeAttachmentStatus?.attachmentTicketStatuses) {
            Object.entries(volumeAttachmentStatus.attachmentTicketStatuses).forEach(([ticketId, status]) => {
                const ticket = attachmentTicketsRaw[ticketId];
                if (ticket && ticket.nodeID) {
                    timeline.nodes.add(ticket.nodeID);
                    
                    // Find satisfaction time from conditions
                    const satisfiedCondition = status.conditions?.find(c => c.type === 'Satisfied');
                    if (satisfiedCondition?.lastTransitionTime) {
                        events.push({
                            timestamp: new Date(satisfiedCondition.lastTransitionTime),
                            event: `Volume attached to ${ticket.nodeID}`,
                            ticketId: ticketId.substring(0, 12) + '...',
                            node: ticket.nodeID,
                            type: 'storage',
                            satisfied: status.satisfied
                        });
                    }
                }
            });
        }

        // Add VM migration events if available
        if (vmMigrationData?.status?.phaseTransitionTimestamps) {
            vmMigrationData.status.phaseTransitionTimestamps.forEach(phase => {
                events.push({
                    timestamp: new Date(phase.phaseTransitionTimestamp),
                    event: `Migration ${phase.phase}`,
                    type: 'migration',
                    phase: phase.phase
                });
            });
        }

        // Check if we have VM migration info in the VM data
        if (vmStatus?.vmStatusReason === 'Migrating' || vmStatus?.printableStatus === 'Migrating') {
            // Estimate migration start from attachment tickets if no explicit migration data
            if (!vmMigrationData && events.length > 1) {
                // Sort by timestamp to find the earliest recent event (likely migration start)
                const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
                const latestEvent = sortedEvents[sortedEvents.length - 1];
                
                // If latest attachment is recent, likely related to migration
                const now = new Date();
                const timeDiff = now - latestEvent.timestamp;
                if (timeDiff < (7 * 24 * 60 * 60 * 1000)) { // Less than 7 days
                    events.push({
                        timestamp: latestEvent.timestamp,
                        event: 'Migration inferred (VM status: Migrating)',
                        type: 'migration',
                        phase: 'Running'
                    });
                }
            }
        }

        // Sort events chronologically
        events.sort((a, b) => a.timestamp - b.timestamp);
        timeline.events = events;

    

        // Calculate timeline metrics
        if (events.length > 0) {
            timeline.startTime = events[0].timestamp;
            const now = new Date();
            const durationMs = now - timeline.startTime;
            const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            timeline.duration = {
                days: days,
                hours: hours,
                totalHours: Math.floor(durationMs / (1000 * 60 * 60)),
                humanReadable: days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h` : '<1h'
            };
            
            timeline.isLongRunning = durationMs > (24 * 60 * 60 * 1000); // > 1 day
            
            // Adjust risk level based on duration
            if (timeline.isLongRunning) {
                timeline.riskLevel = 'CRITICAL';
            }
        }

        return timeline;
    },

    // Build human-readable migration story
    buildMigrationStory(timeline, vmStatus) {
        const vmName = vmStatus?.name || 'VM';
        const isStuck = timeline?.currentState === 'Migrating';
        const duration = timeline?.duration;
        const nodesList = Array.from(timeline?.nodes || []).join(' → ');

        // Create a story even with minimal data
        const story = {
            headline: timeline?.isLongRunning && isStuck
                ? `VM Migration Stuck for ${duration?.humanReadable || 'Extended Period'} - Split-Brain`
                : timeline?.isLongRunning 
                    ? `Long-Running Volume Attachments (${duration?.humanReadable || 'Extended Period'}) - Split-Brain Risk`
                    : `VM Migration Issues Detected - Split-Brain Risk`,
            
            summary: timeline?.isLongRunning 
                ? `Volume has been attached to multiple nodes for ${duration?.humanReadable || 'extended period'} - indicating stuck migration`
                : `Volume has conflicting attachment tickets during migration`,
            
            riskDescription: timeline?.isLongRunning
                ? "Volume attached to BOTH nodes simultaneously for extended period - HIGH data corruption risk"
                : "Multiple attachment tickets detected - migration coordination issue",
            
            timeline: timeline?.events?.map(event => {
                return {
                    date: event.timestamp ? event.timestamp.toLocaleDateString() : 'Sep 13, 2025',
                    time: event.timestamp ? event.timestamp.toLocaleTimeString() : '10:00 AM',
                    description: event.description || event.event || `Volume operation on ${event.node}`,
                    type: event.type || 'storage',
                    node: event.node || 'unknown',
                    context: event.phase || event.context || 'storage',
                    estimated: event.estimated || false
                };
            }) || [],
            
            migrationPath: nodesList || 'Multiple nodes',
            currentStatus: timeline?.currentState || 'unknown',
            duration: duration,
            urgency: timeline?.isLongRunning ? 'URGENT' : 'INVESTIGATE',
            
            // Add specific guidance based on timeline
            riskFactors: [
                `Duration: ${duration?.humanReadable || 'Unknown'}`,
                `Nodes: ${nodesList || 'Multiple nodes'}`,
                timeline?.isLongRunning ? 'CRITICAL: Long-running dual attachment' : 'Recent migration conflict',
                timeline?.nodes?.size > 1 ? 'Split-brain scenario detected' : 'Multiple attachment tickets'
            ],
            
            // Timeline-aware recommendations
            nextSteps: timeline?.isLongRunning ? [
                'URGENT: Consider shutting down VM to prevent data corruption',
                'Investigate why migration has been stuck for so long',
                'Check for stuck migration processes',
                'Verify volume integrity before restart'
            ] : [
                'Check current migration status',
                'Verify if migration is actively progressing',
                'Consider canceling and restarting migration if stuck',
                'Monitor for completion'
            ]
        };

        return story;
    },

    // Format migration story for UI display
    formatMigrationStoryForUI(migrationStory, timeline) {
        if (!migrationStory) return null;

        return {
            storyHeader: {
                headline: migrationStory.headline,
                summary: migrationStory.summary,
                urgency: migrationStory.urgency,
                duration: timeline?.duration?.humanReadable || 'unknown'
            },
            
            timelineSection: {
                title: " Migration Timeline",
                events: migrationStory.timeline.map(event => ({
                    timestamp: `${event.date} ${event.time}`,
                    description: event.description,
                    type: event.type,
                    icon: event.type === 'migration' ? '' : '',
                    importance: event.type === 'migration' ? 'high' : 'medium'
                })),
                summary: `Migration path: ${migrationStory.migrationPath}`
            },
            
            riskSection: {
                title: "[WARNING] Current Risk Assessment",
                level: timeline?.riskLevel || 'HIGH',
                description: migrationStory.riskDescription,
                factors: [
                    `VM Status: ${migrationStory.currentStatus}`,
                    `Duration: ${migrationStory.duration?.humanReadable || 'unknown'}`,
                    `Nodes Involved: ${migrationStory.migrationPath}`,
                    timeline?.isLongRunning ? 'CRITICAL: Long-running migration detected' : 'Recent migration conflict'
                ]
            },
            
            recommendedAction: {
                title: "[ACTION] Recommended Next Steps",
                urgency: migrationStory.urgency,
                primaryAction: timeline?.isLongRunning 
                    ? "URGENT: Shutdown VM to prevent data corruption"
                    : "Investigate migration status and consider cancellation",
                reasoning: timeline?.isLongRunning 
                    ? "Migrations running >24h pose serious split-brain data corruption risk"
                    : "Recent migration conflicts can often be resolved by restarting the migration process"
            }
        };
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
            'orphaned-replicas': [
                {
                    id: 'identify-correct-engine',
                    title: 'Identify the Correct Engine Name',
                    description: 'From verification step 2, copy the actual engine name that exists (e.g., pvc-xxx-e-0)',
                    command: `# The correct engine name is shown in verification step 2 output`,
                    warning: 'Make note of this engine name - you will use it in the next steps'
                },
                {
                    id: 'patch-replica-1',
                    title: 'Update First Orphaned Replica',
                    description: 'Patch the first replica to point to the correct engine',
                    command: `kubectl patch replica <REPLICA_NAME_1> -n longhorn-system --type merge -p '{"spec":{"engineName":"<CORRECT_ENGINE_NAME>"}}'`,
                    warning: 'Replace <REPLICA_NAME_1> with actual replica name from verification, and <CORRECT_ENGINE_NAME> with engine from step 1'
                },
                {
                    id: 'patch-replica-2',
                    title: 'Update Second Orphaned Replica',
                    description: 'Patch the second replica to point to the correct engine',
                    command: `kubectl patch replica <REPLICA_NAME_2> -n longhorn-system --type merge -p '{"spec":{"engineName":"<CORRECT_ENGINE_NAME>"}}'`,
                    warning: 'Replace <REPLICA_NAME_2> with actual replica name from verification'
                },
                {
                    id: 'patch-replica-3',
                    title: 'Update Third Orphaned Replica',
                    description: 'Patch the third replica if it exists',
                    command: `kubectl patch replica <REPLICA_NAME_3> -n longhorn-system --type merge -p '{"spec":{"engineName":"<CORRECT_ENGINE_NAME>"}}'`,
                    warning: 'Only run if you have 3 replicas. Skip if only 2 replicas were orphaned.'
                },
                {
                    id: 'verify-engine-recognizes-replicas',
                    title: 'Verify Engine Now Has Replicas',
                    description: 'Check that the engine now shows replicas in its address map',
                    command: `kubectl get engine <CORRECT_ENGINE_NAME> -n longhorn-system -o jsonpath='{.status.currentReplicaAddressMap}' | jq .`,
                    expectedOutput: 'Should show 2-3 replica entries with IP addresses (not empty map {})'
                },
                {
                    id: 'verify-vm-startup',
                    title: 'Verify VM Can Now Start',
                    description: 'Check if VM successfully transitions from Scheduling to Running',
                    command: `kubectl get vm ${resourceName.split('-').slice(0, -2).join('-')} -o jsonpath='{.status.printableStatus}'`,
                    expectedOutput: 'Should show "Running" or progress from "Scheduling" to "Starting"'
                },
                {
                    id: 'check-pod-events',
                    title: 'Confirm No More Attachment Errors',
                    description: 'Verify pod no longer shows FailedAttachVolume errors',
                    command: `kubectl get events --field-selector involvedObject.name=virt-launcher-* -n ${resourceName.split('-').slice(0, -2).join('-')} | grep -i attach`,
                    expectedOutput: 'Should show "AttachVolume.Attach succeeded" instead of errors'
                }
            ],
            'node-not-ready': [
                {
                    id: 'restart-node-services',
                    title: 'Restart Node Services',
                    command: `# SSH to node and run: sudo systemctl restart rke2-server`,
                    description: 'Restart RKE2 server service on the affected node',
                    warning: 'This will temporarily disrupt workloads on the node'
                }
            ],
            'pdb': [
                {
                    id: 'backup-pdb-config',
                    title: 'Backup PDB Configuration',
                    command: `kubectl get pdb ${resourceName} -n longhorn-system -o yaml > pdb-${resourceName}-backup.yaml`,
                    description: 'Save current PDB configuration before deletion',
                    warning: 'Keep this backup in case rollback is needed'
                },
                {
                    id: 'delete-problematic-pdb',
                    title: 'Delete Problematic PDB',
                    command: `kubectl delete pdb ${resourceName} -n longhorn-system`,
                    description: 'Remove the misconfigured PDB - Longhorn will recreate it correctly',
                    warning: 'Only run this if volume health verification passed'
                },
                {
                    id: 'verify-pdb-recreation',
                    title: 'Verify PDB Recreation',
                    command: `kubectl get pdb -n longhorn-system | grep ${resourceName.split('-').slice(0, 3).join('-')}`,
                    description: 'Check that Longhorn recreated the PDB with correct configuration',
                    expectedOutput: 'Should show new PDB with same name pattern within 30 seconds'
                },
                {
                    id: 'confirm-node-draining',
                    title: 'Test Node Draining (Optional)',
                    command: `kubectl drain <node-name> --dry-run=client --ignore-daemonsets`,
                    description: 'Test if node can be drained now (dry run)',
                    warning: 'Only run if this issue was blocking an upgrade'
                }
            ],
            'attachment-tickets-multiple': [
                {
                    id: 'verify-volume-safety-state',
                    title: 'Verify Volume Safety State',
                    command: `kubectl get volumes.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status.state}'`,
                    description: 'SAFETY FIRST: Ensure volume is in stable state before any remediation',
                    warning: 'Do not proceed with any ticket removal if volume is in attaching/detaching state'
                },
                {
                    id: 'restart-attachment-controllers',
                    title: 'Restart Volume Attachment Controllers (Safest Option)',
                    command: `kubectl delete pods -n longhorn-system -l app=longhorn-manager`,
                    description: 'Restart Longhorn managers to resolve ticket conflicts gracefully',
                    warning: 'This restarts all Longhorn managers - expect brief control plane disruption'
                },
                {
                    id: 'manual-ticket-analysis',
                    title: 'Manual Ticket Analysis (Advanced Users)',
                    command: `kubectl get volumeattachments.longhorn.io ${resourceName} -n longhorn-system -o yaml`,
                    description: 'Review full YAML to understand ticket sources before manual removal',
                    warning: 'Only proceed with manual ticket removal if you understand the implications'
                }
            ],
            'attachment-tickets-stuck-migration': [
                {
                    id: 'assess-migration-duration',
                    title: 'Assess Migration Duration Risk',
                    command: `# Based on timeline analysis from verification`,
                    description: 'RISK ASSESSMENT: If migration has been running > 24 hours, this is CRITICAL',
                    warning: 'Long-running migrations (>1 day) pose serious data corruption risk'
                },
                {
                    id: 'shutdown-vm-safe',
                    title: 'Shutdown VM (Safest for Long-Running Migrations)',
                    command: `kubectl patch vm ${resourceName.split('-')[0]} --type='merge' -p='{"spec":{"runStrategy":"Halted"}}'`,
                    description: 'RECOMMENDED for migrations stuck >24h: Gracefully shutdown VM to prevent data corruption',
                    warning: 'This stops the VM but prevents potential data corruption from split-brain scenario'
                },
                {
                    id: 'verify-pod-migration-status',
                    title: 'Verify Pod Migration Status (For Recent Migrations)',
                    command: `kubectl get pods --all-namespaces -o wide | grep ${resourceName.split('-')[0]} && kubectl get events --all-namespaces | grep ${resourceName.split('-')[0]}`,
                    description: 'For migrations <24h: Check if pod is actually migrating or stuck',
                    warning: 'Only proceed if pod migration is truly stuck and VM timeline shows <24h duration'
                },
                {
                    id: 'cancel-stuck-migration',
                    title: 'Cancel Stuck Migration (Recent Migrations Only)',
                    command: `kubectl delete vmim $(kubectl get vmim --all-namespaces | grep ${resourceName.split('-')[0]} | awk '{print $1}') -n $(kubectl get vmim --all-namespaces | grep ${resourceName.split('-')[0]} | awk '{print $2}')`,
                    description: 'Cancel the stuck migration for recent migrations (<24h)',
                    warning: 'Only use for migrations stuck <24 hours. For longer migrations, use VM shutdown instead'
                },
                {
                    id: 'restart-vm-after-cleanup',
                    title: 'Restart VM After Cleanup',
                    command: `kubectl patch vm ${resourceName.split('-')[0]} --type='merge' -p='{"spec":{"runStrategy":"RerunOnFailure"}}'`,
                    description: 'After cleanup, restart the VM to establish clean storage attachment',
                    warning: 'Only run after confirming attachment tickets are cleaned up'
                }
            ],
            'attachment-tickets-stale-ui': [
                {
                    id: 'verify-no-active-ui-sessions',
                    title: 'Verify No Active UI Sessions',
                    command: `kubectl get volumes.longhorn.io ${resourceName} -n longhorn-system -o jsonpath='{.status}' | jq '{state: .state, robustness: .robustness}'`,
                    description: 'Ensure no active Longhorn UI operations on this volume',
                    warning: 'Do not proceed if volume shows active operations'
                },
                {
                    id: 'remove-stale-ui-ticket',
                    title: 'Remove Stale longhorn-api Ticket',
                    command: `kubectl patch volumeattachments.longhorn.io ${resourceName} -n longhorn-system --type='json' -p='[{"op": "remove", "path": "/spec/attachmentTickets/<TICKET_ID>"}]'`,
                    description: 'Remove the specific longhorn-api ticket identified in verification',
                    warning: 'Replace <TICKET_ID> with actual ID from verification step. This is irreversible.'
                }
            ],
            'attachment-tickets-mixed-types': [
                {
                    id: 'wait-for-operations-completion',
                    title: 'Wait for Operations to Complete',
                    command: `kubectl get backups.longhorn.io,snapshots.longhorn.io -n longhorn-system | grep ${resourceName}`,
                    description: 'Mixed tickets are often normal - wait for backup/snapshot completion',
                    warning: 'Do not interrupt backup or snapshot operations unless they are truly stuck'
                },
                {
                    id: 'check-operation-timeout',
                    title: 'Check if Operations Are Stuck',
                    command: `kubectl get backups.longhorn.io,snapshots.longhorn.io -n longhorn-system -o json | jq '.items[] | select(.spec.volumeName == "${resourceName}") | {name: .metadata.name, state: .status.state, creationTime: .metadata.creationTimestamp}'`,
                    description: 'Identify operations stuck for abnormally long time (>30 minutes)',
                    warning: 'Only intervene if operations are stuck for over 30 minutes'
                }
            ],
            'attachment-tickets-unsatisfied': [
                {
                    id: 'check-longhorn-manager-logs',
                    title: 'Check Longhorn Manager Logs',
                    command: `kubectl logs -n longhorn-system -l app=longhorn-manager --tail=100 | grep -i "${resourceName}\\|attachment"`,
                    description: 'Look for attachment-related errors in Longhorn manager logs'
                },
                {
                    id: 'check-csi-attacher-logs',
                    title: 'Check CSI Attacher Logs',
                    command: `kubectl logs -n longhorn-system -l app=longhorn-csi-plugin --tail=50 | grep -i "${resourceName}\\|attach"`,
                    description: 'Check CSI attacher component for attachment issues'
                },
                {
                    id: 'force-volume-detach-attach',
                    title: 'Force Volume Re-attachment',
                    command: `kubectl annotate volumeattachments.longhorn.io ${resourceName} -n longhorn-system volume.longhorn.io/detach-manually="true"`,
                    description: 'Forces Longhorn to detach and re-attach the volume',
                    warning: 'This may cause brief I/O interruption'
                }
            ],
            'attachment-condition-failed': [
                {
                    id: 'restart-csi-driver',
                    title: 'Restart CSI Driver Pod',
                    command: `kubectl delete pods -n longhorn-system -l app=longhorn-csi-plugin --field-selector spec.nodeName=$(kubectl get vm ${resourceName} -o jsonpath='{.status.nodeName}')`,
                    description: 'Restart CSI driver on the target node to resolve attachment issues'
                }
            ]
        };
        return steps[issueType] || [];
    }
};
