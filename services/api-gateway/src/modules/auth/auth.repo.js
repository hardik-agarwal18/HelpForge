import db from "../../config/database.config.js";
import logger from "../../config/logger.js";
import { getCacheClient } from "../../config/redis.config.js";

// ── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_TTL = 300; // 5 minutes

const cacheKey = {
  userById: (id) => `auth:user:id:${id}`,
  emailToId: (email) => `auth:user:email-to-id:${email}`,
  blacklist: (jti) => `auth:blacklist:${jti}`,
};

const getCache = async (key) => {
  try {
    const client = getCacheClient();
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error({ err, key }, "Auth cache read failed");
    return null;
  }
};

const setCache = async (key, value, ttl = CACHE_TTL) => {
  try {
    const client = getCacheClient();
    await client.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.error({ err, key }, "Auth cache write failed");
  }
};

const delCache = async (...keys) => {
  try {
    const client = getCacheClient();
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
  await setCache(cacheKey.userById(safe.id), safe);
  await setCache(cacheKey.emailToId(safe.email), safe.id);
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
  const user = await db.read.user.findFirst({
    where: { email, isDeleted: false },
    select: userSelectWithPassword,
  });

  if (user) await cacheUser(user);
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

export const findUserById = async (id) => {
  const cached = await getCache(cacheKey.userById(id));
  if (cached) return cached; // no password — safe for middleware / token refresh

  const user = await db.read.user.findFirst({
    where: { id, isDeleted: false },
    select: userSelectPublic,
  });

  if (user) await cacheUser(user);
  return user;
};

export const updateUserTokenIssuedAt = async (userId) => {
  const user = await db.write.user.update({
    where: { id: userId },
    data: { tokenIssuedAt: new Date() },
    select: userSelectPublic,
  });

  await cacheUser(user);
  return user;
};

export const softDeleteUser = async (userId) => {
  const user = await db.write.user.update({
    where: { id: userId },
    data: { isDeleted: true, deletedAt: new Date() },
    select: userSelectPublic,
  });

  await invalidateUser(userId, user.email);
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
