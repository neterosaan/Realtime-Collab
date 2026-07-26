const app = require('./app');
const http = require('http');
const { connectToRedis } = require('./db/redis');
const connectToMongoDB = require('./db/mongo');
const initializeSocket = require('./socket/socketHandler');
const { Server } = require('socket.io');

const buildServer = () => {
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });
  initializeSocket(io);
  return { server, io };
};

async function startServer() {
  const PORT = process.env.PORT || 4000;
  const { server } = buildServer();

  require('./db/mysql');
  await connectToMongoDB();
  await connectToRedis();

  server.on('request', (req, res) => {
  console.log('🔥 REQUEST RECEIVED:', req.method, req.url);
});
  server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

module.exports = { buildServer, startServer };

if (require.main === module) {
  startServer();
}