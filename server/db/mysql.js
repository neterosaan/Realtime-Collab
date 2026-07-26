const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: 'root',
  password: process.env.MYSQL_ROOT_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool
  .getConnection()
  .then((connection) => {
    console.log('✅ MySQL Connection Pool created and connected successfully.');
    connection.release();
  })
  .catch((error) => {
    console.error('❌ Could not create MySQL Connection Pool:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  });

module.exports = pool;
