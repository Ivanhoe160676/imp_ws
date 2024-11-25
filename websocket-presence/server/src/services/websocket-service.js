class WebSocketService {
  constructor(config) {
    this.config = config;
    this.heartbeatIntervals = new Map();
  }

  setupHeartbeat(userId, ws) {
    const interval = setInterval(async () => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
          await this.updateLastSeen(userId);
        } catch (error) {
          console.error('Error en heartbeat:', error);
          clearInterval(interval);
          await this.removeConnection(userId, ws);
        }
      } else {
        clearInterval(interval);
        await this.removeConnection(userId, ws);
      }
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(ws, interval);
  }

  clearHeartbeat(ws) {
    if (this.heartbeatIntervals.has(ws)) {
      clearInterval(this.heartbeatIntervals.get(ws));
      this.heartbeatIntervals.delete(ws);
    }
  }

  async updateLastSeen(userId) {
    try {
      const userRef = this.db.collection('users').doc(userId);
      await userRef.set({
        lastSeen: new Date(),
        lastUpdated: this.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error al actualizar lastSeen:', error);
      throw error;
    }
  }
}

module.exports = WebSocketService;