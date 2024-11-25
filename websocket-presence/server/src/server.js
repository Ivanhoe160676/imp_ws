const logger = require('./logger');

logger.info(`Servidor WebSocket ejecutándose en ${process.env.HOST}:${process.env.PORT}`);
logger.error('Error en manejo de conexión:', error);
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { initializeFirebase } = require('./config/firebase');
const PresenceService = require('./services/presenceService');
const WebSocketService = require('./services/websocket-service');

//* Inicializar Firebase y servicios
const { db, FieldValue } = initializeFirebase();
const webSocketService = new WebSocketService({ heartbeatInterval: 30000 });
const presenceService = new PresenceService(db, FieldValue, webSocketService);

//* Inicialización
const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS.split(','),
  credentials: true
}));

//* Crear servidores
const server = http.createServer(app);

//* Configuración del WebSocket Server
const wss = new WebSocket.Server({ 
  server,
  //* Permitir conexiones desde cualquier origen en desarrollo
  verifyClient: (info, callback) => {
    const origin = info.origin;
    const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
    
    if (process.env.NODE_ENV === 'development') {
      callback(true);
    } else {
      callback(allowedOrigins.includes(origin));
    }
  },

  //* Configurar ping/pong para mantener conexiones activas
  clientTracking: true,
  pingInterval: 30000,
  pingTimeout: 10000
});

//* Endpoints REST
app.get('/health', async (req, res) => {
  try {
    const activeConnections = Array.from(wss.clients).length;
    const activeUsers = presenceService.connections.size;
    
    res.json({ 
      status: 'OK',
      activeConnections,
      activeUsers,
      environment: process.env.NODE_ENV,
      serverTime: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({ error: error.message });
  }
});

//* WebSocket connection handler
wss.on('connection', async (ws, req) => {
  try {
    logger.log('Nueva conexión WebSocket recibida');
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (!userId) {
      logger.warn('Intento de conexión sin userId');
      ws.close(1002, 'userId es requerido');
      return;
    }

    await presenceService.addConnection(userId, ws);
    logger.log(`Usuario ${userId} conectado`);

    ws.send(JSON.stringify({
      type: 'connected',
      userId,
      timestamp: new Date().toISOString()
    }));

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        logger.log(`Mensaje recibido de ${userId}:`, data.type);
        
        switch (data.type) {
          case 'heartbeat_ack':
            await presenceService.updateLastSeen(userId);
            break;
            
          default:
            logger.log(`Tipo de mensaje no manejado: ${data.type}`);
        }
      } catch (error) {
        logger.error(`Error procesando mensaje de ${userId}:`, error);
      }
    });

    ws.on('close', async () => {
      logger.log(`Usuario ${userId} desconectado`);
      await presenceService.removeConnection(userId, ws);
    });

    ws.on('error', (error) => {
      logger.error(`Error en conexión de ${userId}:`, error);
    });

  } catch (error) {
    logger.error(`Error en manejo de conexión:`, error);
    ws.close(1011, 'Error interno del servidor');
  }
});

//* Intervalo de ping para mantener conexiones activas
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      logger.log('Terminando conexión inactiva');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

//* Start server con manejo de errores mejorado
server.listen(process.env.PORT, process.env.HOST, () => {
  logger.log(`Servidor WebSocket ejecutándose en ${process.env.HOST}:${process.env.PORT}`);
  logger.log(`Ambiente: ${process.env.NODE_ENV}`);
});

//* Error handling
process.on('unhandledRejection', (error) => {
  // logger.error('Error no manejado:', error);
});

process.on('uncaughtException', (error) => {
  // logger.error('Excepción no capturada:', error);
  //* Dar tiempo para logging antes de salir
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});