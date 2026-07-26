const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const DocumentContent = require('../models/documentContentModel');
const documentModel = require('../models/documentModel');
const db = require('../db/mysql');
const { getRedisClient } = require('../db/redis');
const AppError = require('../utils/appError');

const socketProtect = async (socket, next) => {
  try {
    let token;

    if (socket.handshake.auth?.token?.startsWith('Bearer ')) {
      token = socket.handshake.auth.token.split(' ')[1];
    } else if (socket.handshake.headers?.authorization?.startsWith('Bearer ')) {
      token = socket.handshake.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Authentication error: Token not provided.', 401));
    }

    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

    const [rows] = await db.execute(`select * from users where id=?`, [decoded.id]);

    const currentUser = rows[0];

    if (!currentUser) {
      return next(
        new AppError('Authentication error: The user for this token no longer exists.', 401)
      );
    }

    socket.user = currentUser;
    next();
  } catch (err) {
    return next(new AppError('Authentication error: Invalid token.', 401));
  }
};

module.exports = function initializeSocket(io) {
  io.use(socketProtect);
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.user.username} (Socket ID: ${socket.id})`);
    socket.on('joinDocument', async (documentId) => {
      try {
        if (socket.currentDocumentId) {
          socket.leave(socket.currentDocumentId);
          console.log(`User left room: ${socket.currentDocumentId}`);
        }

        socket.removeAllListeners('sendChanges');
        socket.removeAllListeners('saveDocument');
        socket.removeAllListeners('sendChatMessage');

        const role = await documentModel.getUserRole(documentId, socket.user.id);

        if (!role) {
          socket.emit('documentError', {
            message: 'Authorization Failed: You do not have access to this document.',
          });
          socket.disconnect(true);
          return;
        }

        socket.currentRole = role.name;

        socket.currentDocumentId = documentId;

        socket.join(documentId);
        console.log(
          `User ${socket.user.username} joined document room: ${documentId} with role: ${socket.currentRole}`
        );

        const document = await DocumentContent.findById(documentId);

        if (!document) {
          const errorMessage = `Document content not found for ID: ${documentId}`;
          console.error(errorMessage);

          socket.emit('documentError', { message: errorMessage });
          return;
        }

        socket.emit('loadDocument', document.content);

        try {
          const redisClient = getRedisClient();
          const chatKey = `chat:${socket.currentDocumentId}`;
          const history = await redisClient.lRange(chatKey, -50, -1);
          const parsedHistory = history.map((item) => JSON.parse(item));

          socket.emit('loadChatHistory', parsedHistory);
        } catch (error) {
          console.error('Error loading chat history from Redis:', error);
          socket.emit('chatError', { message: 'Could not load chat history.' });
        }

        try {
          const redisClient = getRedisClient();
          const presenceKey = `presence:${socket.currentDocumentId}`;
          const userId = socket.user.username;

          await redisClient.sAdd(presenceKey, userId);

          const onlineUsers = await redisClient.sMembers(presenceKey);

          io.to(socket.currentDocumentId).emit('updatePresence', onlineUsers);
        } catch (error) {
          console.error('Error updating presence on join:', error);
        }

        socket.on('sendChatMessage', async (messageContent) => {
          if (!messageContent || !socket.currentDocumentId) return;
          const message = {
            username: socket.user.username,
            content: messageContent,
            timestamp: new Date().toISOString(),
          };

          try {
            const redisClient = getRedisClient();
            const chatKey = `chat:${socket.currentDocumentId}`;

            await redisClient.rPush(chatKey, JSON.stringify(message));

            await redisClient.lTrim(chatKey, -100, -1);

            io.to(socket.currentDocumentId).emit('receiveChatMessage', message);
          } catch (error) {
            console.error('Error saving/broadcasting chat message:', error);
            socket.emit('chatError', { message: 'Could not send message.' });
          }
        });

        socket.on('sendChanges', async (delta) => {
          if (socket.currentRole === 'viewer') {
            return;
          }
          if (!socket.currentDocumentId) {
            return;
          }

          socket.broadcast.to(socket.currentDocumentId).emit('receiveChanges', delta);
        });

        socket.on('saveDocument', async (content) => {
          if (socket.currentRole === 'viewer') {
            socket.emit('saveError', { message: 'Could not save.' });
            return;
          }
          try {
            await DocumentContent.findByIdAndUpdate(socket.currentDocumentId, { content });
            socket.emit('documentSaved', { message: 'Document saved successfully!' });
          } catch (error) {
            console.error('Error saving document:', error);
            socket.emit('saveError', { message: 'Failed to save document.' });
          }
        });
      } catch (error) {
        const errorMessage = `Error fetching document content for ID ${documentId}: ${error.message}`;
        console.error(errorMessage);

        socket.emit('documentError', {
          message: 'A server error occurred while fetching the document.',
        });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`👋 User disconnected: ${socket.user.username}`);

      if (socket.currentDocumentId) {
        try {
          const redisClient = getRedisClient();
          const presenceKey = `presence:${socket.currentDocumentId}`;
          const userIdentifier = socket.user.username;

          await redisClient.sRem(presenceKey, userIdentifier);

          const onlineUsers = await redisClient.sMembers(presenceKey);

          socket.broadcast.to(socket.currentDocumentId).emit('updatePresence', onlineUsers);
        } catch (error) {
          console.error('Error updating presence on disconnect:', error);
        }
      }
    });
  });
};
