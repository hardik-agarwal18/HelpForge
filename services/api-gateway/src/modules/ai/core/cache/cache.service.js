import logger from "../../../../config/logger.js";
import { getCacheClient as getRedisCache } from "../../../../config/redis.config.js";
import aiConfig from "../config/ai.config.js";

let cacheClient;

const getCacheClient = () => {
  if (!aiConfig.cache.enabled) {
    return null;
  }

  if (!cacheClient) {
    cacheClient = getRedisCache();
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
  ttlMs = aiConfig.cache.ttlMs,
) => {
  const client = getCacheClient();

  if (!client) {
    return null;
  }

  try {
    await client.set(key, value, "PX", ttlMs);
    return true;
  } catch (error) {
    logger.error({ error, key }, "Error writing AI cache");
    return false;
  }
};

export const setCacheValueIfAbsent = async (
  key,
  value,
  ttlMs = aiConfig.cache.ttlMs,
) => {
  const client = getCacheClient();

  if (!client) {
    return null;
  }

  try {
    const result = await client.set(key, value, "PX", ttlMs, "NX");
    return result === "OK";
  } catch (error) {
    logger.error({ error, key }, "Error writing AI cache with NX");
    return false;
  }
};

export const deleteCacheValue = async (key) => {
  const client = getCacheClient();

  if (!client) {
    return null;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.error({ error, key }, "Error deleting AI cache");
    return false;
  }
};

export const incrementHashValues = async (key, values = {}) => {
  const client = getCacheClient();

  if (!client) {
    return null;
  }

  try {
    const entries = Object.entries(values).filter(([, value]) =>
      Number.isFinite(Number(value)),
    );

    if (!entries.length) {
      return true;
    }

    for (const [field, value] of entries) {
      await client.hincrbyfloat(key, field, Number(value));
    }

    return true;
  } catch (error) {
    logger.error({ error, key, values }, "Error incrementing AI cache hash");
    return false;
  }
};

export default {
  getCacheValue,
  setCacheValue,
  setCacheValueIfAbsent,
  deleteCacheValue,
  incrementHashValues,
};
