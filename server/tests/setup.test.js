import { describe, it, expect, beforeEach, afterAll } from 'vitest';
const {
  resetAll,
  disconnectAll,
  getMysqlPool,
  getRedisClient,
  getMongoConnection,
} = require('./setup/testDb');

describe('test harness', () => {
  beforeEach(async () => {
    await resetAll();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  it('can write to and read from the real test MySQL database', async () => {
    const pool = await getMysqlPool();
    await pool.query('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)', [
      'test-id-1',
      'harness',
      'harness@test.com',
      'hashed',
    ]);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', ['test-id-1']);
    expect(rows).toHaveLength(1);
  });

  it("resetAll actually wiped the previous test's MySQL row", async () => {
    const pool = await getMysqlPool();
    const [rows] = await pool.query('SELECT * FROM users');
    expect(rows).toHaveLength(0);
  });

  it('can write to and read from the real test Redis instance', async () => {
    const client = await getRedisClient();
    await client.set('harness-key', 'harness-value');
    const value = await client.get('harness-key');
    expect(value).toBe('harness-value');
  });

  it("resetAll actually wiped the previous test's Redis key", async () => {
    const client = await getRedisClient();
    const value = await client.get('harness-key');
    expect(value).toBeNull();
  });
});
