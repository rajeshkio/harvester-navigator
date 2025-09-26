// Application configuration and constants
const CONFIG = {
    API: {
        ENDPOINT: '/data',
        REFRESH_INTERVAL: 30000, // 30 seconds
        RETRY_DELAY: 5000, // 5 seconds
        MAX_RETRIES: 5
    },
    
    STORAGE_BACKENDS: {
        'csi.trident.netapp.io': 'NetApp Trident',
        'driver.longhorn.io': 'Longhorn',
        'kubernetes.io/aws-ebs': 'AWS EBS',
        'kubernetes.io/gce-pd': 'Google Persistent Disk',
        'kubernetes.io/azure-disk': 'Azure Disk',
        'csi.vsphere.vmware.com': 'vSphere CSI'
    },
    
    SEVERITY_CONFIG: {
        critical: { color: 'text-red-500', icon: '•', badge: 'bg-red-900/80 text-red-200 border border-red-600/50' },
        high: { color: 'text-red-400', icon: '•', badge: 'bg-orange-900/80 text-orange-200 border border-orange-600/50' },
        medium: { color: 'text-yellow-400', icon: '•', badge: 'bg-yellow-900/80 text-yellow-200 border border-yellow-600/50' },
        low: { color: 'text-blue-400', icon: '•', badge: 'bg-blue-900/80 text-blue-200 border border-blue-600/50' },
        error: { color: 'text-red-400', icon: '•' },
        warning: { color: 'text-yellow-400', icon: '•' }
    },
    
    STATUS_COLORS: {
        'running': 'text-green-400',
        'bound': 'text-green-400',
        'pending': 'text-amber-400',
        'containercreating': 'text-amber-400',
        'degraded': 'text-amber-400',
        'rebuilding': 'text-amber-400',
        'default': 'text-red-400'
    }
};
