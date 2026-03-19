import IORedis from "ioredis";
import config from "./index.js";
import logger from "./logger.js";

let sharedBullmqConnection;

const attachRedisLoggers = (redisClient, clientName) => {
  if (!redisClient || redisClient.__helpForgeLoggersAttached) {
    return redisClient;
  }

  redisClient.__helpForgeLoggersAttached = true;

  redisClient.on("connect", () => {
    logger.info({ client: clientName }, "Redis socket connected");
  });

  redisClient.on("ready", () => {
    logger.info({ client: clientName }, "Redis client ready");
  });

  redisClient.on("reconnecting", () => {
    logger.warn({ client: clientName }, "Redis reconnecting");
  });

  redisClient.on("close", () => {
    logger.warn({ client: clientName }, "Redis connection closed");
  });

  redisClient.on("end", () => {
    logger.warn({ client: clientName }, "Redis connection ended");
  });

  redisClient.on("error", (error) => {
    logger.error(
      {
        client: clientName,
        error: error.message,
      },
      "Redis connection error",
    );
  });

  return redisClient;
};

const createRedisClient = () => {
  if (!config.redis.url) {
    logger.warn("REDIS_URL not set, Redis client not created");
    return null;
  }

  const redisClient = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  return attachRedisLoggers(redisClient, "redis-client");
};

const getSharedBullmqConnection = () => {
  if (!config.redis.url) {
    return null;
  }

  if (!sharedBullmqConnection) {
    sharedBullmqConnection = createRedisClient();

    if (sharedBullmqConnection) {
      attachRedisLoggers(sharedBullmqConnection, "bullmq-shared");
    }
  }

  return sharedBullmqConnection;
};

export { createRedisClient, getSharedBullmqConnection };

export default {
  createRedisClient,
  getSharedBullmqConnection,
};
