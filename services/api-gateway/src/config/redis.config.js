import IORedis from "ioredis";
import config from "./index.js";
import logger from "./logger.js";

// ── Configuration ────────────────────────────────────────────────────────────

const SERVICE_NAME = "api-gateway";
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 500;
const MAX_RETRY_DELAY_MS = 30_000;
const CONNECT_TIMEOUT_MS = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10) || 10_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

let sharedBullmqConnection;

// ── Loggers ──────────────────────────────────────────────────────────────────

const attachRedisLoggers = (redisClient, clientName) => {
  if (!redisClient || redisClient.__helpForgeLoggersAttached) {
    return redisClient;
  }

  redisClient.__helpForgeLoggersAttached = true;

  redisClient.on("connect", () => {
    logger.info({ service: SERVICE_NAME, client: clientName }, "Redis socket connected");
  });

  redisClient.on("ready", () => {
    logger.info({ service: SERVICE_NAME, client: clientName }, "Redis client ready");
  });

  redisClient.on("reconnecting", (delay) => {
    logger.warn({ service: SERVICE_NAME, client: clientName, delayMs: delay }, "Redis reconnecting");
  });

  redisClient.on("close", () => {
    logger.warn({ service: SERVICE_NAME, client: clientName }, "Redis connection closed");
  });

  redisClient.on("end", () => {
    logger.warn({ service: SERVICE_NAME, client: clientName }, "Redis connection ended");
  });

  redisClient.on("error", (error) => {
    logger.error(
      { service: SERVICE_NAME, client: clientName, error: error.message },
      "Redis connection error",
    );
  });

  return redisClient;
};

// ── Client Factory ───────────────────────────────────────────────────────────

const createRedisClient = (clientName = "redis-client") => {
  if (!config.redis.url) {
    logger.warn({ service: SERVICE_NAME }, "REDIS_URL not set, Redis client not created");
    return null;
  }

  const redisClient = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    retryStrategy(times) {
      if (times > MAX_RETRIES) {
        logger.error(
          { service: SERVICE_NAME, client: clientName, attempts: times },
          "Redis max retries reached — giving up",
        );
        return null;
      }
      const delay = Math.min(
        RETRY_BASE_MS * Math.pow(2, times - 1),
        MAX_RETRY_DELAY_MS,
      );
      logger.warn(
        { service: SERVICE_NAME, client: clientName, attempt: times, delayMs: delay },
        "Redis retry scheduled",
      );
      return delay;
    },
  });

  return attachRedisLoggers(redisClient, clientName);
};

// ── Shared BullMQ Connection (singleton) ─────────────────────────────────────

const getSharedBullmqConnection = () => {
  if (!config.redis.url) return null;

  if (!sharedBullmqConnection) {
    sharedBullmqConnection = createRedisClient("bullmq-shared");
  }

  return sharedBullmqConnection;
};

// ── Health Check ─────────────────────────────────────────────────────────────

const redisHealthCheck = async () => {
  const client = getSharedBullmqConnection();

  if (!client) {
    return { connected: false, latencyMs: null };
  }

  const start = Date.now();
  try {
    const result = await Promise.race([
      client.ping(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis PING timed out")),
          HEALTH_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
    return { connected: result === "PONG", latencyMs: Date.now() - start };
  } catch (error) {
    logger.warn(
      { service: SERVICE_NAME, error: error.message },
      "Redis health check failed",
    );
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
};

export { createRedisClient, getSharedBullmqConnection, redisHealthCheck };

export default { createRedisClient, getSharedBullmqConnection, redisHealthCheck };
