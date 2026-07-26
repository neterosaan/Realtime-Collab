import {describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
const { io: Client } = require('socket.io-client');
import request from 'supertest';
const app = require('../app');
const { connectToRedis } = require('../db/redis');
const connectToMongoDB = require('../db/mongo');
const { startTestServer, stopTestServer } = require('./setup/testServer');
const { waitForEvent ,waitForEventMatching, collectEvents } = require('./setup/socketHelpers');
const { resetAll, disconnectAll } = require('./setup/testDb');

const registerUser = async (username, email) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password: 'password123' });
  return { token: res.body.accessToken, user: res.body.data.user };
};

describe('Realtime (Socket.io)', () => {
  let testServer;
  let port;
  const openSockets = [];

  beforeAll(async () => {

    await connectToRedis();
    await connectToMongoDB();
    testServer = await startTestServer();
    port = testServer.port;
  });

  beforeEach(async () => {
    await resetAll();
  });

  afterEach(() => {
    openSockets.forEach((s) => s.disconnect());
    openSockets.length = 0;
  });

  afterAll(async () => {
    await stopTestServer(testServer.server);
    await disconnectAll();
  });

  const connectClient = (token) => {
    const socket = Client(`http://localhost:${port}`, {
      auth: { token: `Bearer ${token}` },
      reconnection: false,
    });
    openSockets.push(socket);
    return socket;
  };

    const createDocAsOwner = async (ownerToken) => {
    const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Realtime Test Doc' });
    return res.body.data.document.id;
    };

    const inviteAsEditor = async (ownerToken, documentId, editorEmail, editorToken) => {
    await request(app)
        .post(`/api/documents/${documentId}/share`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: editorEmail });

    const invites = await request(app)
        .get('/api/invitations')
        .set('Authorization', `Bearer ${editorToken}`);

    await request(app)
        .post(`/api/invitations/${invites.body.data.invitations[0].id}/accept`)
        .set('Authorization', `Bearer ${editorToken}`);
    };

    const grantViewerViaPublic = async (ownerToken, documentId, viewerToken) => {
    await request(app)
        .put(`/api/documents/${documentId}/public`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ is_public: true });

    await request(app)
        .get(`/api/documents/${documentId}/view`)
        .set('Authorization', `Bearer ${viewerToken}`);
    };


  it('rejects a connection with no token at all', async () => {
    const socket = connectClient('');
    const err = await waitForEvent(socket, 'connect_error');
    expect(err.message).toMatch(/token not provided/i);
  });

  it('rejects a connection with an invalid/garbage token', async () => {
    const socket = connectClient('not-a-real-token');
    const err = await waitForEvent(socket, 'connect_error');
    expect(err.message).toMatch(/invalid token/i);
  });

    it('accepts a connection with a valid token for a real user', async () => {
    const { token } = await registerUser('rt-user1', 'rt-user1@test.com');

    const socket = connectClient(token);
    await waitForEvent(socket, 'connect');

    expect(socket.connected).toBe(true);
    });


describe('joinDocument', () => {
  it('sends the current document content and empty chat history on join', async () => {
    const { token } = await registerUser('rt-join1', 'rt-join1@test.com');
    const documentId = await createDocAsOwner(token);

    const socket = connectClient(token);
    await waitForEvent(socket, 'connect');
    socket.emit('joinDocument', documentId);

    const content = await waitForEvent(socket, 'loadDocument');
    expect(content).toBe('');

    const history = await waitForEvent(socket, 'loadChatHistory');
    expect(history).toEqual([]);
  });

  it('rejects and disconnects a user with no access to the document', async () => {
    const { token } = await registerUser('rt-join2', 'rt-join2@test.com');
    const { token: strangerToken } = await registerUser('rt-stranger1', 'rt-stranger1@test.com');
    const documentId = await createDocAsOwner(token);

    const socket = connectClient(strangerToken);
    await waitForEvent(socket, 'connect');
    const disconnectPromise = waitForEvent(socket, 'disconnect'); 
    socket.emit('joinDocument', documentId);

    const errorPayload = await waitForEvent(socket, 'documentError');
    expect(errorPayload.message).toMatch(/authorization failed/i);

    await disconnectPromise;
  });
});

describe('sendChanges (real-time collaboration)', () => {
  it('broadcasts a change from one editor to another client in the same document, but not back to the sender', async () => {
    const { token: ownerToken, user: owner } = await registerUser('rt-collab-owner', 'rt-collab-owner@test.com');
    const { token: editorToken, user: editor } = await registerUser('rt-collab-editor', 'rt-collab-editor@test.com');
    const documentId = await createDocAsOwner(ownerToken);
    await inviteAsEditor(ownerToken, documentId, 'rt-collab-editor@test.com', editorToken);

    const ownerSocket = connectClient(ownerToken);
    const editorSocket = connectClient(editorToken);

    await Promise.all([waitForEvent(ownerSocket, 'connect'), waitForEvent(editorSocket, 'connect')]);

    ownerSocket.emit('joinDocument', documentId);
    await waitForEvent(ownerSocket, 'loadDocument');

    editorSocket.emit('joinDocument', documentId);
    await waitForEvent(editorSocket, 'loadDocument');

    const receivedPromise = waitForEvent(editorSocket, 'receiveChanges');
    ownerSocket.emit('sendChanges', { text: 'hello from owner' });

    const received = await receivedPromise;
    expect(received).toEqual({ text: 'hello from owner' });

    const ownerEcho = await collectEvents(ownerSocket, 'receiveChanges', 200);
    expect(ownerEcho).toHaveLength(0);
  });

  it('silently drops changes sent by a viewer -- they never reach other clients', async () => {
    const { token: ownerToken } = await registerUser('rt-viewer-owner', 'rt-viewer-owner@test.com');
    const { token: viewerToken } = await registerUser('rt-viewer-user', 'rt-viewer-user@test.com');
    const documentId = await createDocAsOwner(ownerToken);
    await grantViewerViaPublic(ownerToken, documentId, viewerToken);

    const ownerSocket = connectClient(ownerToken);
    const viewerSocket = connectClient(viewerToken);

    await Promise.all([waitForEvent(ownerSocket, 'connect'), waitForEvent(viewerSocket, 'connect')]);

    ownerSocket.emit('joinDocument', documentId);
    await waitForEvent(ownerSocket, 'loadDocument');
    viewerSocket.emit('joinDocument', documentId);
    await waitForEvent(viewerSocket, 'loadDocument');

    const collected = collectEvents(ownerSocket, 'receiveChanges', 400);
    viewerSocket.emit('sendChanges', { text: 'viewer trying to edit' });

    const results = await collected;
    expect(results).toHaveLength(0);
  });
});

describe('presence', () => {
  it('shows both users online once they join the same document, and removes one on disconnect', async () => {
    const { token: ownerToken } = await registerUser('rt-presence-owner', 'rt-presence-owner@test.com');
    const { token: editorToken } = await registerUser('rt-presence-editor', 'rt-presence-editor@test.com');
    const documentId = await createDocAsOwner(ownerToken);
    await inviteAsEditor(ownerToken, documentId, 'rt-presence-editor@test.com', editorToken);

    const ownerSocket = connectClient(ownerToken);
    await waitForEvent(ownerSocket, 'connect');
    ownerSocket.emit('joinDocument', documentId);
    await waitForEvent(ownerSocket, 'loadDocument');

    const editorSocket = connectClient(editorToken);
    await waitForEvent(editorSocket, 'connect');

    const bothOnlinePromise = waitForEventMatching(
      ownerSocket,
      'updatePresence',
      (users) => users.length === 2
    );
    editorSocket.emit('joinDocument', documentId);
    await waitForEvent(editorSocket, 'loadDocument');
    await bothOnlinePromise;

    const onlyOwnerLeftPromise = waitForEventMatching(
      ownerSocket,
      'updatePresence',
      (users) => users.length === 1
    );
    editorSocket.disconnect();
    const finalPresence = await onlyOwnerLeftPromise;
    expect(finalPresence).toEqual(['rt-presence-owner']);
  });
});

describe('chat', () => {
  it('broadcasts a chat message to everyone in the room, including the sender', async () => {
    const { token: ownerToken } = await registerUser('rt-chat-owner', 'rt-chat-owner@test.com');
    const { token: editorToken } = await registerUser('rt-chat-editor', 'rt-chat-editor@test.com');
    const documentId = await createDocAsOwner(ownerToken);
    await inviteAsEditor(ownerToken, documentId, 'rt-chat-editor@test.com', editorToken);

    const ownerSocket = connectClient(ownerToken);
    const editorSocket = connectClient(editorToken);
    await Promise.all([waitForEvent(ownerSocket, 'connect'), waitForEvent(editorSocket, 'connect')]);

    ownerSocket.emit('joinDocument', documentId);
    await waitForEvent(ownerSocket, 'loadDocument');
    editorSocket.emit('joinDocument', documentId);
    await waitForEvent(editorSocket, 'loadDocument');

    const editorReceivedPromise = waitForEvent(editorSocket, 'receiveChatMessage');
    const ownerReceivedPromise = waitForEvent(ownerSocket, 'receiveChatMessage'); 

    ownerSocket.emit('sendChatMessage', 'hello everyone');

    const [editorMsg, ownerMsg] = await Promise.all([editorReceivedPromise, ownerReceivedPromise]);
    expect(editorMsg.content).toBe('hello everyone');
    expect(editorMsg.username).toBe('rt-chat-owner');
    expect(ownerMsg).toEqual(editorMsg);
  });
});
    
});