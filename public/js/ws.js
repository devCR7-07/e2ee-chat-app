/**
 * WebSocket Manager for E2EE Real-Time Communications
 */

export class WSManager {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.username = null;
    this.eventListeners = new Map();
    this.reconnectTimer = null;
    this.httpKeepAliveInterval = null;

    // Wake-up listener when user unlocks phone or switches back to tab after 30+ mins
    const handleWakeup = () => {
      if (this.username && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        console.log('⚡ Tab woke up / gained focus. Reconnecting WebSocket...');
        this.connect(this.username);
      }
    };

    window.addEventListener('focus', handleWakeup);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleWakeup();
    });
  }

  connect(username) {
    this.username = username;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = this.url || `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('🔗 Connected to E2EE WebSocket Relay Server');
      this.send({
        type: 'AUTHENTICATE',
        username: this.username
      });
      this.emit('connection_status', { connected: true });

      clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.send({ type: 'PING' });
        }
      }, 25000);

      // HTTP keep-alive fetch every 4 mins to prevent Render free-tier from idling out
      clearInterval(this.httpKeepAliveInterval);
      this.httpKeepAliveInterval = setInterval(() => {
        fetch('/api/ping').catch(() => {});
      }, 4 * 60 * 1000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'PONG') return;
        this.emit(data.type, data);
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('⚠️ WebSocket connection closed. Retrying in 3s...');
      clearInterval(this.pingInterval);
      this.emit('connection_status', { connected: false });
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.username) this.connect(this.username);
      }, 3000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('Cannot send message: WebSocket is not open.');
    }
  }

  on(eventType, listener) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType).push(listener);
  }

  emit(eventType, payload) {
    if (this.eventListeners.has(eventType)) {
      this.eventListeners.get(eventType).forEach(cb => cb(payload));
    }
  }
}
