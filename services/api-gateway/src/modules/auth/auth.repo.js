import db from "../../config/database.config.js";

export const findUserByEmail = async (email) => {
  return await db.read.user.findUnique({
    where: { email },
  });
};

export const createUser = async (userData) => {
  return await db.write.user.create({
    data: userData,
  });
};

export const findUserById = async (id) => {
  return await db.read.user.findUnique({
    where: { id },
  });
};

export const updateUserTokenIssuedAt = async (userId) => {
  return await db.write.user.update({
    where: { id: userId },
    data: { tokenIssuedAt: new Date() },
  });
};

// --- Refresh tokens ---

export const createRefreshToken = async ({ token, userId, expiresAt }) => {
  return await db.write.refreshToken.create({
    data: { token, userId, expiresAt },
  });
};

export const findRefreshToken = async (token) => {
  return await db.read.refreshToken.findUnique({
    where: { token },
  });
};

export const deleteRefreshToken = async (token) => {
  return await db.write.refreshToken.delete({
    where: { token },
  });
};

export const deleteUserRefreshTokens = async (userId) => {
  return await db.write.refreshToken.deleteMany({
    where: { userId },
  });
};

// --- Token blacklist ---

export const blacklistToken = async ({ jti, expiresAt }) => {
  return await db.write.tokenBlacklist.create({
    data: { jti, expiresAt },
  });
};

export const isTokenBlacklisted = async (jti) => {
  const entry = await db.read.tokenBlacklist.findUnique({
    where: { jti },
  });
  return !!entry;
};

export const cleanExpiredBlacklistEntries = async () => {
  return await db.write.tokenBlacklist.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
};
