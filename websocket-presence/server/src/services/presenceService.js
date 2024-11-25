
const logger = require('../logger');
const WebSocketService = require('./websocket-service');

class PresenceService {
  constructor(db, FieldValue, webSocketConfig) {
    this.db = db;
    this.FieldValue = FieldValue;
    this.webSocketService = new WebSocketService(webSocketConfig);
    this.connections = new Map();
    this.heartbeatIntervals = new Map();
  }


  async addConnection(userId, ws) {
    try {
      //* Guardar conexión en memoria
      if (!this.connections.has(userId)) {
        this.connections.set(userId, new Set());
      }
      this.connections.get(userId).add(ws);

      //* Actualizar estado en Firestore
      await this.updateUserStatus(userId, true);

      //* Configurar heartbeat para esta conexión
      this.setupHeartbeat(userId, ws);

      logger.log(`Usuario ${userId} conectado. Conexiones activas: ${this.connections.get(userId).size}`);
    } catch (error) {
      logger.error('Error al agregar conexión:', error);
      throw error;
    }
  }

  async removeConnection(userId, ws) {
    try {
      if (this.connections.has(userId)) {
        this.connections.get(userId).delete(ws);
        
        //* Limpiar intervalo de heartbeat
        if (this.heartbeatIntervals.has(ws)) {
          clearInterval(this.heartbeatIntervals.get(ws));
          this.heartbeatIntervals.delete(ws);
        }

        //* Si no hay más conexiones activas para este usuario
        if (this.connections.get(userId).size === 0) {
          this.connections.delete(userId);
          await this.updateUserStatus(userId, false);
          logger.log(`Usuario ${userId} desconectado completamente`);
        } else {
          logger.log(`Usuario ${userId} cerró una conexión. Conexiones restantes: ${this.connections.get(userId).size}`);
        }
      }
    } catch (error) {
      logger.error('Error al remover conexión:', error);
      throw error;
    }
  }

  async updateUserStatus(userId, isOnline) {
    try {
      const userRef = this.db.collection('users').doc(userId);
      await userRef.set({
        isOnline,
        lastSeen: new Date(),
        lastUpdated: this.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      logger.error('Error al actualizar estado del usuario:', error);
      throw error;
    }
  }

  setupHeartbeat(userId, ws) {
    //* Enviar heartbeat cada 30 segundos
    const interval = setInterval(async () => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
          await this.updateLastSeen(userId);
        } catch (error) {
          logger.error('Error en heartbeat:', error);
          clearInterval(interval);
          await this.removeConnection(userId, ws);
        }
      } else {
        clearInterval(interval);
        await this.removeConnection(userId, ws);
      }
    }, 30000);

    this.heartbeatIntervals.set(ws, interval);
  }

  async updateLastSeen(userId) {
    try {
      const userRef = this.db.collection('users').doc(userId);
      await userRef.set({
        lastSeen: new Date(),
        lastUpdated: this.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      logger.error('Error al actualizar lastSeen:', error);
      throw error;
    }
  }

  async getUserStatus(userId) {
    try {
      const userRef = this.db.collection('users').doc(userId);
      const doc = await userRef.get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      logger.error('Error al obtener estado del usuario:', error);
      throw error;
    }
  }

  isUserConnected(userId) {
    return this.connections.has(userId) && this.connections.get(userId).size > 0;
  }
}

module.exports = PresenceService;