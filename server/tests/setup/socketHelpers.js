const jwt = require('jsonwebtoken');

const waitForEvent = (socket, eventName, timeoutMs = 3000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${eventName}" event`));
    }, timeoutMs);

    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
};

const waitForEventMatching = (socket, eventName, predicate, timeoutMs = 3000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timed out waiting for "${eventName}" matching predicate`));
    }, timeoutMs);

    const listener = (payload) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(eventName, listener);
        resolve(payload);
      }
    };
    socket.on(eventName, listener);
  });
};


const signTestToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const collectEvents = (socket, eventName, durationMs = 300) => {
  return new Promise((resolve) => {
    const collected = [];
    const listener = (payload) => collected.push(payload);
    socket.on(eventName, listener);
    setTimeout(() => {
      socket.off(eventName, listener);
      resolve(collected);
    }, durationMs);
  });
};

module.exports = { waitForEvent, signTestToken, waitForEventMatching, collectEvents };