import { ApiError } from "../utils/errorHandler.js";
import { findUserById } from "../modules/auth/auth.repo.js";
import { verifyToken } from "../modules/auth/auth.utils.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new ApiError(401, "Authentication token is required");
    }

    // Check if it starts with "Bearer "
    if (!authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Invalid authorization header format");
    }

    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Authentication token is required");
    }

    const decoded = verifyToken(token);
    const user = await findUserById(decoded.sub);

    if (!user) {
      throw new ApiError(401, "Invalid authentication token");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
