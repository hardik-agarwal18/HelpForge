import prisma from "../../config/database.config.js";

export const createOrganization = async ({ name, userId }) => {
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

export const patchOrganization = async ({ orgId, name }) => {
  return await prisma.organization.update({
    where: {
      id: orgId,
    },
    data: {
      name,
    },
    include: {
      memberships: true,
    },
  });
};

export const findOrganizationByOwner = async ({ userId }) => {
  return await prisma.organization.findFirst({
    where: {
      memberships: {
        some: {
          userId,
          role: "OWNER",
        },
      },
    },
  });
};
