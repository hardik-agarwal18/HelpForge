import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createUser, findUserByEmail } from "./auth.repo.js";
import { ApiError } from "../../utils/errorHandler.js";
import config from "../../config/index.js";

export const registerUser = async (userData) => {
  //Check if user already exists
  const existingUser = await findUserByEmail(userData.email);
  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  //Hash password
  const hashedPassword = await bcrypt.hash(userData.password, 10);
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

  //Generate JWT token
  const token = jwt.sign(
    { userId: newUser.id, email: newUser.email },
    config.jwtSecret,
    { expiresIn: "7d" },
  );

  return { user: newUser, token, expiresIn: "7d" };
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
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  //Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: "7d" },
  );

  return { user, token, expiresIn: "7d" };
};
