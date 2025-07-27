// Pure utility functions - no side effects
const Utils = {
    getStorageBackendDisplayName(driver) {
        return CONFIG.STORAGE_BACKENDS[driver] || driver;
    },
    
    getStatusColorClass(status) {
        if (!status) return 'text-slate-400';
        return CONFIG.STATUS_COLORS[status.toLowerCase()] || CONFIG.STATUS_COLORS.default;
    },
    
    getHealthColorClass(status) {
        if (!status) return 'text-slate-400';
        switch(status.toLowerCase()) {
            case 'running': return 'text-green-400';
            case 'degraded': 
            case 'rebuilding': return 'text-amber-400';
            default: return 'text-red-400';
        }
    },
    
    getSeverityIcon(severity) {
        return CONFIG.SEVERITY_CONFIG[severity]?.icon || '❓';
    },
    
    getSeverityBadgeClass(severity) {
        return CONFIG.SEVERITY_CONFIG[severity]?.badge || 'bg-slate-700 text-slate-300';
    },
    
    copyToClipboard(text) {
        return navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Command copied to clipboard!', 'success');
        });
    },
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 ${
            type === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
        }`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 2000);
    },
    
    formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (e) {
            return timestamp;
        }
    }
};
