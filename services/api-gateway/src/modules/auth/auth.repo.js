import db from "../../config/database.config.js";
import logger from "../../config/logger.js";
import { getCacheClient } from "../../config/redis.config.js";

// ── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_TTL = 300; // 5 minutes

let redis;

const cache = () => {
  if (redis) return redis;
  const client = getCacheClient();
  if (client) redis = client;
  return client;
};

const cacheKey = {
  userById: (id) => `auth:user:id:${id}`,
  emailToId: (email) => `auth:user:email-to-id:${email}`,
  blacklist: (jti) => `auth:blacklist:${jti}`,
  accessScope: (userId) => `auth:user:scope:${userId}`,
};

const getCache = async (key) => {
  const client = cache();
  if (!client) return null;

  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error({ err, key }, "Auth cache read failed");
    return null;
  }
};

const setCache = async (key, value, ttl = CACHE_TTL) => {
  const client = cache();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.error({ err, key }, "Auth cache write failed");
  }
};

const delCache = async (...keys) => {
  const client = cache();
  if (!client) return;

  try {
    await client.del(...keys);
  } catch (err) {
    logger.error({ err, keys }, "Auth cache delete failed");
  }
};

// ── Shared select ────────────────────────────────────────────────────────────
// DB queries need `password` for auth, but we NEVER cache it.

const userSelectWithPassword = {
  id: true,
  email: true,
  password: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  tokenIssuedAt: true,
  isDeleted: true,
};

const userSelectPublic = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  tokenIssuedAt: true,
  isDeleted: true,
};

const stripPassword = ({ password, ...rest }) => rest;

// ── Cache population (never stores password) ─────────────────────────────────

const cacheUser = async (user) => {
  const safe = user.password !== undefined ? stripPassword(user) : user;
  await Promise.all([
    setCache(cacheKey.userById(safe.id), safe),
    setCache(cacheKey.emailToId(safe.email), safe.id),
  ]);
};

const invalidateUser = async (id, email) => {
  const keys = [cacheKey.userById(id)];
  if (email) keys.push(cacheKey.emailToId(email));
  await delCache(...keys);
};

// ── Users ────────────────────────────────────────────────────────────────────

export const findUserByEmail = async (email) => {
  // Always hits DB — returns password for auth flow (login / register check).
  // Only caches the password-free version for findUserById consumers.
  const user = await db.read.user.findUnique({
    where: { email },
    select: userSelectWithPassword,
  });

  if (!user || user.isDeleted) {
    return null;
  }

  await cacheUser(user);
  return user;
};

export const createUser = async (userData) => {
  const user = await db.write.user.create({
    data: userData,
    select: userSelectWithPassword,
  });

  await cacheUser(user);
  return user;
};

export const createUserWithRefreshToken = async ({
  userData,
  token,
  expiresAt,
}) => {
  const user = await db.write.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: userData,
      select: userSelectWithPassword,
    });

    await tx.refreshToken.create({
      data: {
        token,
        userId: createdUser.id,
        expiresAt,
      },
    });

    return createdUser;
  });

  await cacheUser(user);
  return user;
};

export const findUserById = async (id) => {
  const cached = await getCache(cacheKey.userById(id));
  if (cached) return cached; // no password — safe for middleware / token refresh

  const user = await db.read.user.findUnique({
    where: { id },
    select: userSelectPublic,
  });

  if (!user || user.isDeleted) {
    return null;
  }

  await cacheUser(user);
  return user;
};

export const getUserPermissionSnapshot = async (userId) => {
  const cached = await getCache(cacheKey.accessScope(userId));
  if (cached) {
    return cached;
  }

  const memberships = await db.read.membership.findMany({
    where: {
      userId,
    },
    select: {
      organizationId: true,
      roleId: true,
      role: {
        select: {
          name: true,
          level: true,
          rolePermissions: {
            select: {
              permission: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const snapshot = memberships.reduce((accumulator, membership) => {
    accumulator[membership.organizationId] = {
      roleId: membership.roleId,
      roleName: membership.role.name,
      level: membership.role.level,
      permissions: membership.role.rolePermissions.map(
        ({ permission }) => permission.name,
      ),
    };

    return accumulator;
  }, {});

  await setCache(cacheKey.accessScope(userId), snapshot);
  return snapshot;
};

export const invalidateUserPermissionSnapshot = async (userId) => {
  await delCache(cacheKey.accessScope(userId));
};

export const updateUserTokenIssuedAt = async (userId) => {
  const user = await db.write.user.update({
    where: { id: userId },
    data: { tokenIssuedAt: new Date() },
    select: userSelectPublic,
  });

  await cacheUser(user);
  await invalidateUserPermissionSnapshot(userId);
  return user;
};

export const softDeleteUser = async (userId) => {
  const user = await db.write.user.update({
    where: { id: userId },
    data: { isDeleted: true, deletedAt: new Date() },
    select: userSelectPublic,
  });

  await invalidateUser(userId, user.email);
  await invalidateUserPermissionSnapshot(userId);
  return user;
};

// ── Refresh tokens ───────────────────────────────────────────────────────────

export const createRefreshToken = async ({ token, userId, expiresAt }) =>
  db.write.refreshToken.create({
    data: { token, userId, expiresAt },
  });

export const findRefreshToken = async (token) =>
  db.read.refreshToken.findUnique({
    where: { token },
    select: { token: true, userId: true, expiresAt: true },
  });

export const deleteRefreshToken = async (token) =>
  db.write.refreshToken.delete({
    where: { token },
  });

export const deleteUserRefreshTokens = async (userId) =>
  db.write.refreshToken.deleteMany({
    where: { userId },
  });

// ── Token blacklist ──────────────────────────────────────────────────────────

export const blacklistToken = async ({ jti, expiresAt }) => {
  await db.write.tokenBlacklist.create({
    data: { jti, expiresAt },
  });

  const ttl = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
  await setCache(cacheKey.blacklist(jti), true, ttl);
};

export const isTokenBlacklisted = async (jti) => {
  const cached = await getCache(cacheKey.blacklist(jti));
  if (cached) return true;

  const entry = await db.read.tokenBlacklist.findUnique({
    where: { jti },
    select: { jti: true },
  });

  if (entry) await setCache(cacheKey.blacklist(jti), true);
  return !!entry;
};

export const cleanExpiredBlacklistEntries = async () =>
  db.write.tokenBlacklist.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
