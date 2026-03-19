import logger from "../../../../config/logger.js";
import { createRedisClient } from "../../../../config/redis.config.js";
import aiConfig from "../config/ai.config.js";

let cacheClient;

const getCacheClient = () => {
  if (!aiConfig.cache.enabled) {
    return null;
  }

  if (!cacheClient) {
    cacheClient = createRedisClient();
  }

  return cacheClient;
};

export const getCacheValue = async (key) => {
  const client = getCacheClient();

  if (!client) {
    return null;
  }

  try {
    return await client.get(key);
  } catch (error) {
    logger.error({ error, key }, "Error reading AI cache");
    return null;
  }
};

export const setCacheValue = async (
  key,
  value,
  ttlSeconds = aiConfig.cache.ttlSeconds,
) => {
  const client = getCacheClient();

  if (!client) {
    return false;
  }

  try {
    await client.set(key, value, "EX", ttlSeconds);
    return true;
  } catch (error) {
    logger.error({ error, key }, "Error writing AI cache");
    return false;
  }
};

export const deleteCacheValue = async (key) => {
  const client = getCacheClient();

  if (!client) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.error({ error, key }, "Error deleting AI cache");
    return false;
  }
};

export default {
  getCacheValue,
  setCacheValue,
  deleteCacheValue,
};
