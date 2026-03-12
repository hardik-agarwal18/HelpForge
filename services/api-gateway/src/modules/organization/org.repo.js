import prisma from "../../config/database.config.js";

export const createOrganization = async (name, userId) => {
  return await prisma.organization.create({
    data: {
      name,
      memberships: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
    include: {
      memberships: true,
    },
  });
};

export const getOrganizationById = async (id) => {
  return await prisma.organization.findUnique({
    where: { id },
  });
};

export const getOrganizationsByUserId = async (userId) => {
  return await prisma.organization.findMany({
    where: {
      memberships: {
        some: {
          userId,
        },
      },
    },
  });
};
