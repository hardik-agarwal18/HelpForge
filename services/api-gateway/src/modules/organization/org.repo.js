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
  return await prisma.$transaction(async (tx) => {
    // Delete memberships and organization together so we never leave an org orphaned.
    await tx.membership.deleteMany({
      where: {
        organizationId: orgId,
      },
    });

    return await tx.organization.delete({
      where: {
        id: orgId,
      },
    });
  });
};

export const inviteMemberInOrganization = async (orgId, userId, role) => {
  return await prisma.membership.create({
    data: {
      organizationId: orgId,
      userId,
      role: role || "MEMBER",
    },
  });
};

export const getOrganizationMembersById = async (orgId) => {
  return await prisma.membership.findMany({
    where: {
      organizationId: orgId,
    },
    include: {
      user: true,
    },
  });
};

export const getOrganizationMembershipByUserId = async (orgId, userId) => {
  return await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
  });
};

export const updateMembershipRole = (orgId, userId, role) => {
  return prisma.membership.update({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
    data: { role },
  });
};
