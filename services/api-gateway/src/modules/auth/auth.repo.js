import db from "../../config/database.config.js";

export const findUserByEmail = async (email) => {
  return await db.read.user.findUnique({
    where: {
      email: email,
    },
  });
};

export const createUser = async (userData) => {
  return await db.write.user.create({
    data: userData,
  });
};

export const findUserById = async (id) => {
  return await db.read.user.findUnique({
    where: {
      id: id,
    },
  });
};
