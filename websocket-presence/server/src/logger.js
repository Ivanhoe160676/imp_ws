const pino = require('pino');

const logger = pino({
  level: 'debug',
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

module.exports = logger;