import { registerUser, loginUser } from "./auth.service.js";
import { ApiError } from "../../utils/errorHandler.js";

export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const result = await registerUser({ email, password, name });

    if (!result || !result.user || !result.token) {
      throw new ApiError(500, "Failed to register user");
    }

    const { user, token } = result;

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser(email, password);

    if (!result || !result.user || !result.token) {
      throw new ApiError(500, "Failed to login user");
    }

    const { user, token } = result;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const user = req.user;

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
