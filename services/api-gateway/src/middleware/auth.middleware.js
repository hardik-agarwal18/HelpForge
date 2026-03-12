import jwt from "jsonwebtoken";
import { ApiError } from "../utils/errorHandler.js";
import { findUserById } from "../modules/auth/auth.repo.js";

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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.userId);

    if (!user) {
      throw new ApiError(401, "Invalid authentication token");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
    next(error);
  }
};
