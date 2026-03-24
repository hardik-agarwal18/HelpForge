import { registerUser, loginUser } from "./auth.service.js";
import { ApiError } from "../../utils/errorHandler.js";

const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
});

export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const { user, token, expiresIn } = await registerUser({
      email,
      password,
      name,
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: sanitizeUser(user),
        token,
        tokenType: "Bearer",
        expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { user, token, expiresIn } = await loginUser(email, password);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: sanitizeUser(user),
        token,
        tokenType: "Bearer",
        expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }

    return res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(req.user),
      },
    });
  } catch (error) {
    next(error);
  }
};
