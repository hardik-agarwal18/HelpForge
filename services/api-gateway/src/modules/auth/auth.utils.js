import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import config from "../../config/index.js";
import { ApiError } from "../../utils/errorHandler.js";

const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "helpforge-api";
const JWT_AUDIENCE = "helpforge-users";

export const hashPassword = (password) =>
  bcrypt.hash(password, config.bcryptSaltRounds);

export const comparePassword = (plain, hashed) =>
  bcrypt.compare(plain, hashed);

export const generateToken = (user) => {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: config.jwtExpiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return { token, expiresIn: config.jwtExpiresIn };
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
};

export const sanitizeUser = ({ password, ...user }) => user;
