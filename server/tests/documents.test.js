import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
const connectToMongoDB = require('../db/mongo');
import request from 'supertest';
const app = require('../app');
const { resetAll, disconnectAll, getMysqlPool, seedRoles } = require('./setup/testDb');

const registerUser = async (username, email) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password: 'password123' });
  return { token: res.body.accessToken, user: res.body.data.user };
};

describe('Documents', () => {
  beforeAll(async () => {
    await connectToMongoDB();
  });
  beforeEach(async () => {
    await resetAll();
    await seedRoles();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  describe('POST /api/documents (create)', () => {
    it('creates a document and automatically grants the creator owner access', async () => {
      const { token, user } = await registerUser('owner1', 'owner1@test.com');

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'My First Doc' });

      expect(res.status).toBe(201);
      expect(res.body.data.document.title).toBe('My First Doc');
      expect(res.body.data.document.owner_id).toBe(user.id);
    });

    it('defaults to "Untitled Document" when no title is given', async () => {
      const { token } = await registerUser('owner2', 'owner2@test.com');

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.body.data.document.title).toBe('Untitled Document');
    });
  });

  describe('GET /api/documents/:id (access boundary)', () => {
    it('allows the owner to fetch their document', async () => {
      const { token } = await registerUser('owner3', 'owner3@test.com');
      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Private' });

      const res = await request(app)
        .get(`/api/documents/${createRes.body.data.document.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('rejects a user with no relationship to the document', async () => {
      const { token: ownerToken } = await registerUser('owner4', 'owner4@test.com');
      const { token: strangerToken } = await registerUser('stranger1', 'stranger1@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Private' });

      const res = await request(app)
        .get(`/api/documents/${createRes.body.data.document.id}`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH/DELETE /api/documents/:id (owner-only)', () => {
    it('allows the owner to update the title', async () => {
      const { token } = await registerUser('owner5', 'owner5@test.com');
      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/documents/${createRes.body.data.document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.document.title).toBe('Updated');
    });

    it('rejects a non-owner trying to update the title', async () => {
      const { token: ownerToken } = await registerUser('owner6', 'owner6@test.com');
      const { token: strangerToken } = await registerUser('stranger2', 'stranger2@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/documents/${createRes.body.data.document.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ title: 'Hijacked' });

      expect(res.status).toBe(403);
    });

    it('rejects a non-owner trying to delete the document', async () => {
      const { token: ownerToken } = await registerUser('owner7', 'owner7@test.com');
      const { token: strangerToken } = await registerUser('stranger3', 'stranger3@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Original' });

      const res = await request(app)
        .delete(`/api/documents/${createRes.body.data.document.id}`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/documents/:id/share (isOwner middleware)', () => {
    it('allows the owner to share the document with another user', async () => {
      const { token: ownerToken } = await registerUser('owner8', 'owner8@test.com');
      const { user: editorUser } = await registerUser('editor1', 'editor1@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Shared Doc' });

      const res = await request(app)
        .post(`/api/documents/${createRes.body.data.document.id}/share`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'editor1@test.com' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation).toBeDefined();
    });

    it('rejects a non-owner trying to share the document', async () => {
      const { token: ownerToken } = await registerUser('owner9', 'owner9@test.com');
      const { token: strangerToken } = await registerUser('stranger4', 'stranger4@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Doc' });

      const res = await request(app)
        .post(`/api/documents/${createRes.body.data.document.id}/share`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ email: 'someone@test.com' });

      expect(res.status).toBe(403);
    });
  });

  describe('Public document self-access', () => {
    it('automatically grants viewer access when a user views a public document they have no permission for', async () => {
      const { token: ownerToken } = await registerUser('owner10', 'owner10@test.com');
      const { token: viewerToken } = await registerUser('viewer1', 'viewer1@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Public Doc' });
      const documentId = createRes.body.data.document.id;

      await request(app)
        .put(`/api/documents/${documentId}/public`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ is_public: true });

      const res = await request(app)
        .get(`/api/documents/${documentId}/view`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(201);

      const followUp = await request(app)
        .get(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(followUp.status).toBe(200);
    });

    it('rejects viewing a document that is not public and not shared', async () => {
      const { token: ownerToken } = await registerUser('owner11', 'owner11@test.com');
      const { token: strangerToken } = await registerUser('stranger5', 'stranger5@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Private Doc' });

      const res = await request(app)
        .get(`/api/documents/${createRes.body.data.document.id}/view`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(res.status).toBe(404);
    });
  });
});
