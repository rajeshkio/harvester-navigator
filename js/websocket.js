// WebSocket connection management
const WebSocketManager = {
    socket: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    
    connect() {
        const wsUrl = `${CONFIG.WEBSOCKET.PROTOCOL}//${window.location.hostname}:${CONFIG.WEBSOCKET.PORT}/ws`;
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            console.log('Connected to backend');
            this.reconnectAttempts = 0;
            ViewManager.updateUpgradeStatus('info', 'Loading upgrade information...');
        };
        
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.error) {
                    ViewManager.updateUpgradeStatus('error', `Error: ${data.error}`);
                    return;
                }
                
                AppState.updateData(data);
            } catch (e) {
                console.error('Error parsing data:', e);
                ViewManager.updateUpgradeStatus('error', 'Error parsing data from backend');
            }
        };
        
        this.socket.onclose = () => {
            console.log('WebSocket connection closed');
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                setTimeout(() => this.reconnect(), CONFIG.WEBSOCKET.RECONNECT_DELAY);
            }
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            ViewManager.updateUpgradeStatus('error', 'Connection failed. Retrying...');
            this.socket.close();
        };
    },
    
    reconnect() {
        this.reconnectAttempts++;
        console.log(`Reconnect attempt ${this.reconnectAttempts}`);
        this.connect();
    }
};
