import db from "../../config/database.config.js";
import { ALL_PERMISSION_DETAILS } from "./org.constants.js";
import {
  normalizeMembershipRole,
  normalizeRolePermissions,
} from "./org.utils.js";

const rolePermissionInclude = {
  rolePermissions: {
    include: {
      permission: true,
    },
  },
};

const membershipWithRoleInclude = {
  role: {
    include: rolePermissionInclude,
  },
};

const normalizeOrganization = (organization) => {
  if (!organization) {
    return organization;
  }

  const normalized = { ...organization };

  if (Array.isArray(organization.roles)) {
    normalized.roles = organization.roles.map(normalizeRolePermissions);
  }

  if (Array.isArray(organization.memberships)) {
    normalized.memberships = organization.memberships.map(normalizeMembershipRole);
  }

  return normalized;
};

const ensurePermissionsExist = async (tx, permissions = []) => {
  const permissionSet = new Set(permissions);

  if (permissionSet.size === 0) {
    return;
  }

  const permissionRows = ALL_PERMISSION_DETAILS.filter(({ name }) =>
    permissionSet.has(name),
  );

  await tx.permission.createMany({
    data: permissionRows,
    skipDuplicates: true,
  });
};

const toRolePermissionConnect = (permissions = []) =>
  permissions.map((name) => ({
    permission: {
      connect: { name },
    },
  }));

// Organization CRUD

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
  const organization = await db.write.organization.create({
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
      memberships: { include: membershipWithRoleInclude },
    },
  });

  return normalizeOrganization(organization);
};

export const createOrganizationWithRolesAndOwner = async ({
  name,
  userId,
  roles,
  ownerRoleName = "OWNER",
}) => {
  return await db.write.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name },
    });

    await ensurePermissionsExist(
      tx,
      roles.flatMap((role) => role.permissions || []),
    );

    await Promise.all(
      roles.map((role) =>
        tx.orgRole.create({
          data: {
            organizationId: organization.id,
            name: role.name,
            level: role.level,
            isSystem: role.isSystem ?? false,
            rolePermissions: {
              create: toRolePermissionConnect(role.permissions || []),
            },
          },
        }),
      ),
    );

    const ownerRole = await tx.orgRole.findUnique({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: ownerRoleName,
        },
      },
    });

    if (!ownerRole) {
      return null;
    }

    await tx.membership.create({
      data: {
        organizationId: organization.id,
        userId,
        roleId: ownerRole.id,
      },
    });

    const hydratedOrganization = await tx.organization.findUnique({
      where: { id: organization.id },
      include: {
        memberships: { include: membershipWithRoleInclude },
        roles: {
          include: rolePermissionInclude,
        },
      },
    });

    return normalizeOrganization(hydratedOrganization);
  });
};

export const patchOrganization = async ({ orgId, name }) => {
  const organization = await db.write.organization.update({
    where: { id: orgId },
    data: { name },
    include: { memberships: { include: membershipWithRoleInclude } },
  });

  return normalizeOrganization(organization);
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

// Membership

export const getOrganizationMembersById = async (orgId) => {
  const memberships = await db.read.membership.findMany({
    where: { organizationId: orgId },
    include: {
      user: true,
      role: {
        include: rolePermissionInclude,
      },
    },
  });

  return memberships.map(normalizeMembershipRole);
};

export const getOrganizationMembershipByUserId = async (orgId, userId) => {
  const membership = await db.read.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    include: {
      role: {
        include: rolePermissionInclude,
      },
    },
  });

  return normalizeMembershipRole(membership);
};

export const getUserMembershipInOrganization = async ({ userId, orgId }) => {
  const membership = await db.read.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    include: {
      organization: true,
      role: {
        include: rolePermissionInclude,
      },
    },
  });

  return normalizeMembershipRole(membership);
};

export const inviteMemberInOrganization = async (orgId, userId, roleId) => {
  const membership = await db.write.membership.create({
    data: {
      organizationId: orgId,
      userId,
      roleId,
    },
    include: {
      role: {
        include: rolePermissionInclude,
      },
    },
  });

  return normalizeMembershipRole(membership);
};

export const updateMembershipRole = async (orgId, userId, roleId) => {
  const membership = await db.write.membership.update({
    where: {
      userId_organizationId: { userId, organizationId: orgId },
    },
    data: { roleId },
    include: {
      role: {
        include: rolePermissionInclude,
      },
    },
  });

  return normalizeMembershipRole(membership);
};

// OrgRole CRUD

export const createOrgRoles = async (orgId, roles) => {
  return await db.write.$transaction(async (tx) => {
    await ensurePermissionsExist(
      tx,
      roles.flatMap((role) => role.permissions || []),
    );

    const createdRoles = await Promise.all(
      roles.map((role) =>
        tx.orgRole.create({
          data: {
            organizationId: orgId,
            name: role.name,
            level: role.level,
            isSystem: role.isSystem ?? false,
            rolePermissions: {
              create: toRolePermissionConnect(role.permissions || []),
            },
          },
          include: rolePermissionInclude,
        }),
      ),
    );

    return createdRoles.map(normalizeRolePermissions);
  });
};

export const getOrgRoles = async (orgId) => {
  const roles = await db.read.orgRole.findMany({
    where: { organizationId: orgId },
    include: rolePermissionInclude,
    orderBy: { level: "desc" },
  });

  return roles.map(normalizeRolePermissions);
};

export const getOrgRoleById = async (roleId) => {
  const role = await db.read.orgRole.findUnique({
    where: { id: roleId },
    include: rolePermissionInclude,
  });

  return normalizeRolePermissions(role);
};

export const getOrgRoleByName = async (orgId, name) => {
  const role = await db.read.orgRole.findUnique({
    where: {
      organizationId_name: { organizationId: orgId, name },
    },
    include: rolePermissionInclude,
  });

  return normalizeRolePermissions(role);
};

export const createOrgRole = async (orgId, { name, permissions, level }) => {
  return await db.write.$transaction(async (tx) => {
    await ensurePermissionsExist(tx, permissions);

    const role = await tx.orgRole.create({
      data: {
        organizationId: orgId,
        name,
        level,
        isSystem: false,
        rolePermissions: {
          create: toRolePermissionConnect(permissions),
        },
      },
      include: rolePermissionInclude,
    });

    return normalizeRolePermissions(role);
  });
};

export const updateOrgRole = async (roleId, { name, permissions, level }) => {
  const data = {};

  if (name !== undefined) data.name = name;
  if (level !== undefined) data.level = level;

  return await db.write.$transaction(async (tx) => {
    if (permissions !== undefined) {
      await ensurePermissionsExist(tx, permissions);
      data.rolePermissions = {
        deleteMany: {},
        create: toRolePermissionConnect(permissions),
      };
    }

    const role = await tx.orgRole.update({
      where: { id: roleId },
      data,
      include: rolePermissionInclude,
    });

    return normalizeRolePermissions(role);
  });
};

export const deleteOrgRole = async (roleId) => {
  return await db.write.orgRole.delete({
    where: { id: roleId },
  });
};
