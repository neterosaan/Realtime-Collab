const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Real-Time Collab API',
      version: '1.0.0',
      description: 'Backend for a real-time collaborative document editor -- MySQL, MongoDB, and Redis, with Socket.io for live collaboration, presence, and chat.',
    },
    servers: [
      { url: 'http://localhost:4000/api', description: 'Local (Docker Compose)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);