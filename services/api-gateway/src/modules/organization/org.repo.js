import db from "../../config/database.config.js";

// ── Organization CRUD ────────────────────────────────────────────────

export const getOrganizationsByUserId = async (userId) => {
  return await db.read.organization.findMany({
    where: {
      memberships: {
        some: { userId },
      },
    },
  });
};

export const createOrganization = async ({ name, userId, ownerRoleId }) => {
  return await db.write.organization.create({
    data: {
      name,
      memberships: {
        create: {
          userId,
          roleId: ownerRoleId,
        },
      },
    },
    include: {
      memberships: { include: { role: true } },
    },
  });
};

export const patchOrganization = async ({ orgId, name }) => {
  return await db.write.organization.update({
    where: { id: orgId },
    data: { name },
    include: { memberships: { include: { role: true } } },
  });
};

export const findOrganizationByOwner = async ({ userId }) => {
  return await db.read.organization.findFirst({
    where: {
      memberships: {
        some: {
          userId,
          role: { name: "OWNER", isSystem: true },
        },
      },
    },
  });
};

export const deleteOrganization = async ({ orgId }) => {
  return await db.write.$transaction(async (tx) => {
    await tx.membership.deleteMany({
      where: { organizationId: orgId },
    });
    await tx.orgRole.deleteMany({
      where: { organizationId: orgId },
    });
    return await tx.organization.delete({
      where: { id: orgId },
    });
  });
};

// ── Membership ───────────────────────────────────────────────────────

export const getOrganizationMembersById = async (orgId) => {
  return await db.read.membership.findMany({
    where: { organizationId: orgId },
    include: { user: true, role: true },
  });
};

export const getOrganizationMembershipByUserId = async (orgId, userId) => {
  return await db.read.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    include: { role: true },
  });
};

export const getUserMembershipInOrganization = async ({ userId, orgId }) => {
  return await db.read.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    include: { organization: true, role: true },
  });
};

export const inviteMemberInOrganization = async (orgId, userId, roleId) => {
  return await db.write.membership.create({
    data: {
      organizationId: orgId,
      userId,
      roleId,
    },
    include: { role: true },
  });
};

export const updateMembershipRole = (orgId, userId, roleId) => {
  return db.write.membership.update({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    data: { roleId },
    include: { role: true },
  });
};

// ── OrgRole CRUD ─────────────────────────────────────────────────────

export const createOrgRoles = async (orgId, roles) => {
  return await db.write.orgRole.createMany({
    data: roles.map((role) => ({
      organizationId: orgId,
      name: role.name,
      permissions: role.permissions,
      level: role.level,
      isSystem: role.isSystem ?? false,
    })),
  });
};

export const getOrgRoles = async (orgId) => {
  return await db.read.orgRole.findMany({
    where: { organizationId: orgId },
    orderBy: { level: "desc" },
  });
};

export const getOrgRoleById = async (roleId) => {
  return await db.read.orgRole.findUnique({
    where: { id: roleId },
  });
};

export const getOrgRoleByName = async (orgId, name) => {
  return await db.read.orgRole.findUnique({
    where: {
      organizationId_name: { organizationId: orgId, name },
    },
  });
};

export const createOrgRole = async (orgId, { name, permissions, level }) => {
  return await db.write.orgRole.create({
    data: {
      organizationId: orgId,
      name,
      permissions,
      level,
      isSystem: false,
    },
  });
};

export const updateOrgRole = async (roleId, { name, permissions, level }) => {
  const data = {};
  if (name !== undefined) data.name = name;
  if (permissions !== undefined) data.permissions = permissions;
  if (level !== undefined) data.level = level;

  return await db.write.orgRole.update({
    where: { id: roleId },
    data,
  });
};

export const deleteOrgRole = async (roleId) => {
  return await db.write.orgRole.delete({
    where: { id: roleId },
  });
};
