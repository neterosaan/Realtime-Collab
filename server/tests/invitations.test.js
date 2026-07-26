import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
const app = require('../app');
const connectToMongoDB = require('../db/mongo');
const { resetAll, disconnectAll, getMysqlPool } = require('./setup/testDb');

const registerUser = async (username, email) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password: 'password123' });
  return { token: res.body.accessToken, user: res.body.data.user };
};

describe('Invitations', () => {
  beforeAll(async () => {
    await connectToMongoDB();
  });

  beforeEach(async () => {
    await resetAll();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  describe('GET /api/invitations (my pending invitations)', () => {
    it('lists a pending invitation sent to the current user', async () => {
      const { token: ownerToken } = await registerUser('inv-owner1', 'inv-owner1@test.com');
      const { token: inviteeToken } = await registerUser('inv-invitee1', 'inv-invitee1@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Shared Doc' });

      await request(app)
        .post(`/api/documents/${createRes.body.data.document.id}/share`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'inv-invitee1@test.com' });

      const res = await request(app)
        .get('/api/invitations')
        .set('Authorization', `Bearer ${inviteeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toBe(1);
      expect(res.body.data.invitations[0].title).toBe('Shared Doc');
    });
  });

  describe('POST /api/invitations/:id/accept', () => {
    const setupPendingInvitation = async () => {
      const { token: ownerToken } = await registerUser('inv-owner2', 'inv-owner2@test.com');
      const { token: inviteeToken } = await registerUser('inv-invitee2', 'inv-invitee2@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Doc To Share' });
      const documentId = createRes.body.data.document.id;

      await request(app)
        .post(`/api/documents/${documentId}/share`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'inv-invitee2@test.com' });

      const invitesRes = await request(app)
        .get('/api/invitations')
        .set('Authorization', `Bearer ${inviteeToken}`);
      const invitationId = invitesRes.body.data.invitations[0].id;

      return { ownerToken, inviteeToken, documentId, invitationId };
    };

    it('grants access on accept, and the invitee can now fetch the document', async () => {
      const { inviteeToken, documentId, invitationId } = await setupPendingInvitation();

      const acceptRes = await request(app)
        .post(`/api/invitations/${invitationId}/accept`)
        .set('Authorization', `Bearer ${inviteeToken}`);
      expect(acceptRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${inviteeToken}`);
      expect(getRes.status).toBe(200);
    });

    it('allows exactly one of two concurrent accept requests for the same invitation to succeed', async () => {
      const { inviteeToken, invitationId } = await setupPendingInvitation();

      const results = await Promise.allSettled([
        request(app)
          .post(`/api/invitations/${invitationId}/accept`)
          .set('Authorization', `Bearer ${inviteeToken}`),
        request(app)
          .post(`/api/invitations/${invitationId}/accept`)
          .set('Authorization', `Bearer ${inviteeToken}`),
      ]);

      const statuses = results.map((r) => r.value.status).sort();
      expect(statuses).toEqual([200, 404]);

      const pool = await getMysqlPool();
      const [rows] = await pool.query(
        'SELECT * FROM user_document_permissions WHERE document_id = (SELECT document_id FROM document_invitations WHERE id = ?)',
        [invitationId]
      );
      const nonOwnerRows = rows.filter((r) => r.role_id !== 1);
      expect(nonOwnerRows).toHaveLength(1);
    });

    it('rejects accepting an invitation that does not belong to you', async () => {
      const { invitationId } = await setupPendingInvitation();
      const { token: strangerToken } = await registerUser(
        'inv-stranger1',
        'inv-stranger1@test.com'
      );

      const res = await request(app)
        .post(`/api/invitations/${invitationId}/accept`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/invitations/:id/decline', () => {
    it('declines a pending invitation cleanly', async () => {
      const { token: ownerToken } = await registerUser('inv-owner3', 'inv-owner3@test.com');
      const { token: inviteeToken } = await registerUser('inv-invitee3', 'inv-invitee3@test.com');

      const createRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Doc' });

      await request(app)
        .post(`/api/documents/${createRes.body.data.document.id}/share`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'inv-invitee3@test.com' });

      const invitesRes = await request(app)
        .get('/api/invitations')
        .set('Authorization', `Bearer ${inviteeToken}`);
      const invitationId = invitesRes.body.data.invitations[0].id;

      const res = await request(app)
        .post(`/api/invitations/${invitationId}/decline`)
        .set('Authorization', `Bearer ${inviteeToken}`);

      expect(res.status).toBe(200);
    });

    it('returns a clean 404 (not a 500 crash) when declining an invitation that does not exist', async () => {
      const { token } = await registerUser('inv-user4', 'inv-user4@test.com');

      const res = await request(app)
        .post('/api/invitations/99999/decline')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found|already acted upon/i);
    });
  });
});
