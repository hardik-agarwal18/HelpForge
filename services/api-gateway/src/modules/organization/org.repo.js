import db from "../../config/database.config.js";
import { invalidateUserPermissionSnapshot } from "../auth/auth.repo.js";
import { ALL_PERMISSION_DETAILS } from "./org.constants.js";
import {
  getCachedOrganizationMembership,
  invalidateOrganizationMembershipCache,
  invalidateOrganizationMembershipCacheByOrg,
  setCachedOrganizationMembership,
} from "./org.cache.js";
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

const getOrganizationMemberUserIds = async (tx, organizationId) => {
  const memberships = await tx.membership.findMany({
    where: { organizationId },
    select: { userId: true },
  });

  return [...new Set(memberships.map(({ userId }) => userId))];
};

const invalidateUserPermissionSnapshots = async (userIds = []) => {
  await Promise.all(
    [...new Set(userIds.filter(Boolean))].map((userId) =>
      invalidateUserPermissionSnapshot(userId),
    ),
  );
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
  const memberships = await db.read.membership.findMany({
    where: {
      userId,
    },
    select: {
      organization: true,
    },
  });

  return memberships.map(({ organization }) => organization);
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

    const membership = await tx.membership.create({
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

    const normalizedOrganization = normalizeOrganization(hydratedOrganization);

    const ownerMembership = normalizedOrganization?.memberships?.find(
      (entry) => entry.userId === membership.userId,
    );
    if (ownerMembership) {
      await setCachedOrganizationMembership(ownerMembership);
    }
    await invalidateUserPermissionSnapshot(userId);

    return normalizedOrganization;
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
  const membership = await db.read.membership.findFirst({
    where: {
      userId,
      role: { name: "OWNER", isSystem: true },
    },
    select: {
      organization: true,
    },
  });

  return membership?.organization ?? null;
};

export const deleteOrganization = async ({ orgId }) => {
  return await db.write.$transaction(async (tx) => {
    const userIds = await getOrganizationMemberUserIds(tx, orgId);

    await tx.membership.deleteMany({
      where: { organizationId: orgId },
    });
    await tx.orgRole.deleteMany({
      where: { organizationId: orgId },
    });
    const deletedOrganization = await tx.organization.delete({
      where: { id: orgId },
    });

    return { deletedOrganization, userIds };
  }).finally(async () => {
    await invalidateOrganizationMembershipCacheByOrg(orgId);
  }).then(async ({ deletedOrganization, userIds }) => {
    await invalidateUserPermissionSnapshots(userIds);
    return deletedOrganization;
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
  const cachedMembership = await getCachedOrganizationMembership(orgId, userId);
  if (cachedMembership) {
    return cachedMembership;
  }

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

  const normalizedMembership = normalizeMembershipRole(membership);
  if (normalizedMembership) {
    await setCachedOrganizationMembership(normalizedMembership);
  }

  return normalizedMembership;
};

export const getUserMembershipInOrganization = async ({ userId, orgId }) => {
  const cachedMembership = await getCachedOrganizationMembership(orgId, userId);
  if (cachedMembership?.organization) {
    return cachedMembership;
  }

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

  const normalizedMembership = normalizeMembershipRole(membership);
  if (normalizedMembership) {
    await setCachedOrganizationMembership(normalizedMembership);
  }

  return normalizedMembership;
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

  const normalizedMembership = normalizeMembershipRole(membership);
  await setCachedOrganizationMembership(normalizedMembership);
  await invalidateUserPermissionSnapshot(userId);
  return normalizedMembership;
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

  const normalizedMembership = normalizeMembershipRole(membership);
  await setCachedOrganizationMembership(normalizedMembership);
  await invalidateUserPermissionSnapshot(userId);
  return normalizedMembership;
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
  }).then(async (role) => {
    const userIds = await getOrganizationMemberUserIds(db.read, orgId);
    await invalidateUserPermissionSnapshots(userIds);
    return role;
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

    const userIds = await getOrganizationMemberUserIds(tx, role.organizationId);

    return {
      role: normalizeRolePermissions(role),
      userIds,
    };
  }).then(async (role) => {
    await invalidateOrganizationMembershipCacheByOrg(role.role.organizationId);
    await invalidateUserPermissionSnapshots(role.userIds);
    return role.role;
  });
};

export const deleteOrgRole = async (roleId) => {
  const role = await db.write.orgRole.delete({
    where: { id: roleId },
  });

  const userIds = await getOrganizationMemberUserIds(db.read, role.organizationId);
  await invalidateOrganizationMembershipCacheByOrg(role.organizationId);
  await invalidateUserPermissionSnapshots(userIds);

  return role;
};
