import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  logoutAllDevices,
} from "./auth.service.js";
import { ApiError } from "../../utils/errorHandler.js";
import { extractBearerToken, formatUserResponse } from "./auth.utils.js";

const tokenResponse = (
  res,
  status,
  message,
  { user, accessToken, refreshToken, expiresIn },
) =>
  res.status(status).json({
    success: true,
    message,
    data: {
      user: formatUserResponse(user),
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn,
    },
  });

export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const result = await registerUser({ email, password, name });

    return tokenResponse(res, 201, "User registered successfully", result);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser({ email, password });

    return tokenResponse(res, 200, "Login successful", result);
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError(
        400,
        "Refresh token is required",
        "REFRESH_TOKEN_MISSING",
      );
    }

    const result = await refreshAccessToken(refreshToken);

    return tokenResponse(res, 200, "Token refreshed successfully", result);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const accessToken = extractBearerToken(req.headers.authorization);

    await logoutUser({ accessToken, refreshToken });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const logoutAll = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Authentication required", "AUTH_REQUIRED");
    }

    await logoutAllDevices(req.user.id);

    return res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Authentication required", "AUTH_REQUIRED");
    }

    return res.status(200).json({
      success: true,
      data: {
        user: formatUserResponse(req.user),
      },
    });
  } catch (error) {
    next(error);
  }
};
