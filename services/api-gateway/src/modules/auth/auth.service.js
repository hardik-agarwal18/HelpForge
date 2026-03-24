import { createUser, findUserByEmail } from "./auth.repo.js";
import { ApiError } from "../../utils/errorHandler.js";
import {
  hashPassword,
  comparePassword,
  generateToken,
  sanitizeUser,
} from "./auth.utils.js";

export const registerUser = async (userData) => {
  //Check if user already exists
  const existingUser = await findUserByEmail(userData.email);
  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  //Hash password
  const hashedPassword = await hashPassword(userData.password);
  if (!hashedPassword) {
    throw new ApiError(500, "Failed to hash password");
  }

  //Create new user
  const newUser = await createUser({
    ...userData,
    password: hashedPassword,
  });

  if (!newUser || !newUser.id) {
    throw new ApiError(500, "Failed to create user");
  }

  const { token, expiresIn } = generateToken(newUser);

  return { user: sanitizeUser(newUser), token, expiresIn };
};

export const loginUser = async (email, password) => {
  //Check if user exists
  const user = await findUserByEmail(email);
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (!user.password) {
    throw new ApiError(401, "Invalid credentials");
  }

  //Check if password is correct
  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const { token, expiresIn } = generateToken(user);

  return { user: sanitizeUser(user), token, expiresIn };
};
