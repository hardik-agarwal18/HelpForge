import { ApiError } from "../utils/errorHandler.js";
import { findUserById, isTokenBlacklisted } from "../modules/auth/auth.repo.js";
import { verifyAccessToken, extractBearerToken } from "../modules/auth/auth.utils.js";

export const authenticate = async (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw new ApiError(401, "Authentication token is required", "TOKEN_MISSING");
    }

    const decoded = verifyAccessToken(token);

    if (decoded.jti && (await isTokenBlacklisted(decoded.jti))) {
      throw new ApiError(401, "Token has been revoked", "TOKEN_REVOKED");
    }

    const user = await findUserById(decoded.sub);

    if (!user) {
      throw new ApiError(401, "Invalid authentication token", "TOKEN_INVALID");
    }

    if (user.tokenIssuedAt && decoded.iat < Math.floor(user.tokenIssuedAt.getTime() / 1000)) {
      throw new ApiError(401, "Token has been revoked", "TOKEN_REVOKED");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
