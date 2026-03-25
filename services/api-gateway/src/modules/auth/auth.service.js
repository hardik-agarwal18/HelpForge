import {
  createUser,
  findUserByEmail,
  findUserById,
  getUserPermissionSnapshot,
  createRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  blacklistToken,
  updateUserTokenIssuedAt,
} from "./auth.repo.js";
import { ApiError } from "../../utils/errorHandler.js";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  sanitizeUser,
  parseDuration,
} from "./auth.utils.js";
import config from "../../config/index.js";

const issueTokens = async (user) => {
  const orgPermissions = await getUserPermissionSnapshot(user.id);
  const { accessToken, expiresIn } = generateAccessToken(user, {
    orgPermissions,
  });

  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(
    Date.now() + parseDuration(config.refreshTokenExpiresIn),
  );

  await createRefreshToken({
    token: refreshToken,
    userId: user.id,
    expiresAt: refreshExpiresAt,
  });

  return { accessToken, refreshToken, expiresIn };
};

export const registerUser = async (userData) => {
  const existingUser = await findUserByEmail(userData.email);
  if (existingUser) {
    throw new ApiError(409, "User already exists", "USER_EXISTS");
  }

  const hashedPassword = await hashPassword(userData.password);
  if (!hashedPassword) {
    throw new ApiError(500, "Failed to hash password", "HASH_FAILED");
  }

  const newUser = await createUser({
    ...userData,
    password: hashedPassword,
  });

  if (!newUser || !newUser.id) {
    throw new ApiError(500, "Failed to create user", "USER_CREATION_FAILED");
  }

  const tokens = await issueTokens(newUser);

  return { user: sanitizeUser(newUser), ...tokens };
};

export const loginUser = async ({ email, password }) => {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new ApiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  if (!user.password) {
    throw new ApiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const tokens = await issueTokens(user);

  return { user: sanitizeUser(user), ...tokens };
};

export const refreshAccessToken = async (refreshToken) => {
  const stored = await findRefreshToken(refreshToken);
  if (!stored) {
    throw new ApiError(401, "Invalid refresh token", "REFRESH_TOKEN_INVALID");
  }

  if (new Date() > stored.expiresAt) {
    await deleteRefreshToken(refreshToken);
    throw new ApiError(401, "Refresh token expired", "REFRESH_TOKEN_EXPIRED");
  }

  const user = await findUserById(stored.userId);
  if (!user) {
    await deleteRefreshToken(refreshToken);
    throw new ApiError(401, "User not found", "USER_NOT_FOUND");
  }

  // Rotate: delete old, issue new
  await deleteRefreshToken(refreshToken);
  const tokens = await issueTokens(user);

  return { user: sanitizeUser(user), ...tokens };
};

export const logoutUser = async ({ accessToken, refreshToken }) => {
  if (accessToken) {
    try {
      const decoded = verifyAccessToken(accessToken);
      if (decoded.jti && decoded.exp) {
        await blacklistToken({
          jti: decoded.jti,
          expiresAt: new Date(decoded.exp * 1000),
        });
      }
    } catch {
      // Token already expired or invalid — no need to blacklist
    }
  }

  if (refreshToken) {
    await deleteRefreshToken(refreshToken).catch((err) => {
      if (err?.code !== "P2025") throw err; // re-throw unless "record not found"
    });
  }
};

export const logoutAllDevices = async (userId) => {
  await updateUserTokenIssuedAt(userId);
  await deleteUserRefreshTokens(userId);
};
