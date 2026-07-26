const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    fileParallelism: false,
  },
});
