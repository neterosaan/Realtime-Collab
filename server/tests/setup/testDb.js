const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const { createClient } = require('redis');

let mysqlPool;
let redisClient;
let mongoConnection;

const getMysqlPool = async () => {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: 'root',
      password: process.env.MYSQL_ROOT_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });
  }
  return mysqlPool;
};

const seedRoles = async () => {
  const pool = await getMysqlPool();

  await pool.query(`
    INSERT INTO roles (id, name)
    VALUES
      (1, 'owner'),
      (2, 'editor'),
      (3, 'viewer')
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);
};

const getMongoConnection = async () => {
  if (!mongoConnection) {
    const uri = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}?authSource=admin`;
    mongoConnection = await mongoose.createConnection(uri).asPromise();
  }
  return mongoConnection;
};

const getRedisClient = async () => {
  if (!redisClient) {
    redisClient = createClient({
      socket: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT },
    });
    await redisClient.connect();
  }
  return redisClient;
};

const resetMysql = async () => {
  const pool = await getMysqlPool();
  const [tables] = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
    [process.env.MYSQL_DATABASE]
  );
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { TABLE_NAME } of tables) {
    if (TABLE_NAME !== 'roles') {
      await pool.query(`TRUNCATE TABLE \`${TABLE_NAME}\``);
    }
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
};

const resetMongo = async () => {
  const connection = await getMongoConnection();
  const collections = await connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
};

const resetRedis = async () => {
  const client = await getRedisClient();
  await client.flushDb();
};

const resetAll = async () => {
  await Promise.all([resetMysql(), resetMongo(), resetRedis()]);
};

const disconnectAll = async () => {
  if (mysqlPool) await mysqlPool.end();
  if (redisClient) await redisClient.quit();
  if (mongoConnection) await mongoConnection.close();
};

module.exports = { resetAll, disconnectAll, getMysqlPool, getRedisClient, seedRoles };
