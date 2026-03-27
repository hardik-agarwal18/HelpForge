import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../../config/index.js";
import { ApiError } from "../../utils/errorHandler.js";

const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "helpforge-api";
const JWT_AUDIENCE = "helpforge-users";

export const hashPassword = (password) =>
  bcrypt.hash(password, config.secrets.bcryptSaltRounds);

export const comparePassword = (plain, hashed) =>
  bcrypt.compare(plain, hashed);

export const generateAccessToken = (user, additionalClaims = {}) => {
  const jti = crypto.randomUUID();
  const iat = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { sub: user.id, type: "access", jti, iat, ...additionalClaims },
    config.secrets.jwtSecret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: config.auth.accessTokenExpiresIn,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
  return { accessToken: token, expiresIn: config.auth.accessTokenExpiresIn };
};

export const generateRefreshToken = () => crypto.randomBytes(48).toString("hex");

export const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.secrets.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (decoded.type !== "access") {
      throw new ApiError(401, "Invalid token type", "TOKEN_TYPE_INVALID");
    }
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Invalid or expired token", "TOKEN_INVALID");
  }
};

export const sanitizeUser = ({ password, ...user }) => user;

export const parseDuration = (duration) => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const [, value, unit] = match;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return parseInt(value, 10) * multipliers[unit];
};

export const extractBearerToken = (authHeader) => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  return token || null;
};

export const formatUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
});
