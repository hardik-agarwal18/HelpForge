import logger from "../../config/logger.js";
import { getCacheClient } from "../../config/redis.config.js";

const CACHE_TTL_SECONDS = 300;

const membershipCacheKey = (orgId, userId) =>
  `org:membership:${orgId}:user:${userId}`;

const getCache = () => getCacheClient();

const parseCachedValue = async (key) => {
  const client = getCache();
  if (!client) return null;

  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    logger.error({ error, key }, "Organization cache read failed");
    return null;
  }
};

const setCachedValue = async (key, value, ttlSeconds = CACHE_TTL_SECONDS) => {
  const client = getCache();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    logger.error({ error, key }, "Organization cache write failed");
  }
};

const deleteCachedValue = async (key) => {
  const client = getCache();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    logger.error({ error, key }, "Organization cache delete failed");
  }
};

const deleteByPattern = async (pattern) => {
  const client = getCache();
  if (!client) return;

  try {
    let cursor = "0";

    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    logger.error({ error, pattern }, "Organization cache pattern delete failed");
  }
};

export const getCachedOrganizationMembership = async (orgId, userId) =>
  parseCachedValue(membershipCacheKey(orgId, userId));

export const setCachedOrganizationMembership = async (membership) => {
  if (!membership?.organizationId || !membership?.userId) {
    return;
  }

  await setCachedValue(
    membershipCacheKey(membership.organizationId, membership.userId),
    membership,
  );
};

export const invalidateOrganizationMembershipCache = async (orgId, userId) =>
  deleteCachedValue(membershipCacheKey(orgId, userId));

export const invalidateOrganizationMembershipCacheByOrg = async (orgId) =>
  deleteByPattern(`org:membership:${orgId}:user:*`);
