import prisma from "../../config/database.config.js";

export const createOrganization = async (name) => {
  return await prisma.organization.create({
    data: { name },
  });
};
