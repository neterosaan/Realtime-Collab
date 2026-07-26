import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
const app = require('../app');
const { resetAll, disconnectAll, getMysqlPool } = require('./setup/testDb');

describe('Auth', () => {
  beforeEach(async () => {
    await resetAll();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  describe('POST /api/auth/register', () => {
    it('creates a new user and returns an access token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'alice', email: 'alice@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('alice@test.com');
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('sets an httpOnly refresh token cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'bob', email: 'bob@test.com', password: 'password123' });

      const cookie = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
    });

    it('rejects registration with a missing field', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'nopass', email: 'nopass@test.com' });

      expect(res.status).toBe(400);
    });

    it('rejects a duplicate email with 409, not a raw DB error', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'first', email: 'dupe@test.com', password: 'password123' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'second', email: 'dupe@test.com', password: 'password123' });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'carol', email: 'carol@test.com', password: 'correct-password' });
    });

    it('logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'carol@test.com', password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('rejects an incorrect password without revealing which field was wrong', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'carol@test.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('rejects a non-existent email with the same generic message (no user enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'whatever' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password');
    });
  });

  describe('GET /api/auth/me (protected route)', () => {
    it('rejects a request with no Authorization header', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects a malformed/garbage token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(res.status).toBe(401);
    });

    it('returns the current user for a valid token', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({ username: 'dave', email: 'dave@test.com', password: 'password123' });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${registerRes.body.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('dave@test.com');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues a new access token given a valid refresh cookie', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({ username: 'erin', email: 'erin@test.com', password: 'password123' });

      const cookie = registerRes.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));

      const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('rejects a refresh attempt with no cookie at all', async () => {
      const res = await request(app).post('/api/auth/refresh');
      expect(res.status).toBe(401);
    });
  });
});
