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

export const patchOrganization = async (orgId, name) => {
  return await prisma.organization.update({
    where: {
      id: orgId,
    },
    data: {
      name,
    },
  });
};

export const deleteOrganization = async (orgId) => {
  // First delete all memberships to avoid foreign key constraints
  await prisma.membership.deleteMany({
    where: {
      organizationId: orgId,
    },
  });

  return await prisma.organization.delete({
    where: {
      id: orgId,
    },
  });
};
