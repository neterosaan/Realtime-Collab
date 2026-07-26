const { buildServer } = require('../../server');

const startTestServer = () => {
  return new Promise((resolve) => {
    const { server, io } = buildServer();
    server.listen(0, () => { // port 0 = OS assigns a free port automatically
      const port = server.address().port;
      resolve({ server, io, port });
    });
  });
};

const stopTestServer = (server) => {
  return new Promise((resolve) => server.close(resolve));
};

module.exports = { startTestServer, stopTestServer };