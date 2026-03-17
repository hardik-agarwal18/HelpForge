import IORedis from "ioredis";
import config from "./index.js";

let sharedBullmqConnection;

const createRedisClient = () => {
  if (!config.redis.url) {
    return null;
  }

  return new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
};

const getSharedBullmqConnection = () => {
  if (!config.redis.url) {
    return null;
  }

  if (!sharedBullmqConnection) {
    sharedBullmqConnection = createRedisClient();
  }

  return sharedBullmqConnection;
};

export { createRedisClient, getSharedBullmqConnection };

export default {
  createRedisClient,
  getSharedBullmqConnection,
};
