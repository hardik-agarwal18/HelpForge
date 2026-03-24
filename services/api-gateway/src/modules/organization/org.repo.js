import db from "../../config/database.config.js";

export const getOrganizationsByUserId = async (userId) => {
  return await db.read.organization.findMany({
    where: {
      memberships: {
        some: { userId },
      },
    },
  });
};

export const createOrganization = async ({ name, userId }) => {
  return await db.write.organization.create({
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
  return await db.write.organization.update({
    where: { id: orgId },
    data: { name },
    include: { memberships: true },
  });
};

export const findOrganizationByOwner = async ({ userId }) => {
  return await db.read.organization.findFirst({
    where: {
      memberships: {
        some: { userId, role: "OWNER" },
      },
    },
  });
};

export const deleteOrganization = async ({ orgId }) => {
  return await db.write.$transaction(async (tx) => {
    await tx.membership.deleteMany({
      where: { organizationId: orgId },
    });
    return await tx.organization.delete({
      where: { id: orgId },
    });
  });
};

export const getOrganizationMembersById = async (orgId) => {
  return await db.read.membership.findMany({
    where: { organizationId: orgId },
    include: { user: true },
  });
};

export const getOrganizationMembershipByUserId = async (orgId, userId) => {
  return await db.read.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
  });
};

export const getUserMembershipInOrganization = async ({ userId, orgId }) => {
  return await db.read.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    include: { organization: true },
  });
};

export const inviteMemberInOrganization = async (orgId, userId, role) => {
  return await db.write.membership.create({
    data: {
      organizationId: orgId,
      userId,
      role: role || "MEMBER",
    },
  });
};

export const updateMembershipRole = (orgId, userId, role) => {
  return db.write.membership.update({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    data: { role },
  });
};
