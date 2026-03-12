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

  //Create new user
  const newUser = await createUser({
    ...userData,
    password: hashedPassword,
  });

  //Generate JWT token
  const token = jwt.sign(
    { userId: newUser.id, email: newUser.email },
    config.jwtSecret,
    { expiresIn: "7d" },
  );

  return { user: newUser, token };
};

export const loginUser = async (email, password) => {
  //Check if user exists
  const user = await findUserByEmail(email);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  //Check if password is correct
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid password");
  }

  //Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: "7d" },
  );

  return { user, token };
};
