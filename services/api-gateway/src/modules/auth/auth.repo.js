import prisma from "../../config/database.config.js";

export const findUserByEmail = async (email) => {
  return await prisma.user.findUnique({
    where: {
      email: email,
    },
  });
};

export const createUser = async (userData) => {
  return await prisma.user.create({
    data: userData,
  });
};

export const findUserById = async (id) => {
  return await prisma.user.findUnique({
    where: {
      id: id,
    },
  });
};
