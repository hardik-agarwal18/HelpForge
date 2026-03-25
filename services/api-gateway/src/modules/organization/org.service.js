import {
  createOrganizationWithRolesAndOwner,
  createOrgRole,
  deleteOrganization,
  deleteOrgRole,
  findOrganizationByOwner,
  getOrganizationMembersById,
  getOrganizationMembershipByUserId,
  getOrganizationsByUserId,
  getOrgRoleById,
  getOrgRoles,
  inviteMemberInOrganization,
  patchOrganization,
  updateMembershipRole,
  updateOrgRole,
} from "./org.repo.js";
import { ApiError } from "../../utils/errorHandler.js";
import { DEFAULT_ROLES } from "./org.constants.js";
import { assertCanInviteRole, assertCanUpdateRole } from "./org.utils.js";

// ── Organization CRUD ────────────────────────────────────────────────

export const getOrganizationByUserIdService = async (userId) => {
  const organizations = await getOrganizationsByUserId(userId);
  return organizations || [];
};

export const createOrganizationService = async ({ name, userId }) => {
  const existingOrg = await findOrganizationByOwner({ userId });

  if (existingOrg) {
    throw new ApiError(409, "User already owns an organization", "USER_ALREADY_OWNER");
  }

  // Create org first (without membership) then create roles, then add owner membership
  const org = await createOrganizationWithRolesAndOwner({
    name,
    userId,
    roles: DEFAULT_ROLES,
  });

  if (!org || !org.id) {
    throw new ApiError(500, "Failed to create organization", "ORG_CREATION_FAILED");
  }

  return org;
};

export const updateOrganizationService = async ({ orgId, name }) => {
  const updatedOrganization = await patchOrganization({ orgId, name });

  if (!updatedOrganization || !updatedOrganization.id) {
    throw new ApiError(500, "Failed to update organization", "ORG_UPDATE_FAILED");
  }

  return updatedOrganization;
};

export const deleteOrganizationService = async ({ orgId }) => {
  const deletedOrganization = await deleteOrganization({ orgId });

  if (!deletedOrganization || !deletedOrganization.id) {
    throw new ApiError(500, "Failed to delete organization", "ORG_DELETE_FAILED");
  }

  return deletedOrganization;
};

// ── Members ──────────────────────────────────────────────────────────

export const viewAllMembersInOrganizationService = async (orgId) => {
  const members = await getOrganizationMembersById(orgId);
  return members || [];
};

export const inviteMemberInOrganizationService = async (
  orgId,
  userId,
  roleId,
  actorMembership,
) => {
  const targetRole = await getOrgRoleById(roleId);

  if (!targetRole || targetRole.organizationId !== orgId) {
    throw new ApiError(400, "Invalid role for this organization", "INVALID_ROLE");
  }

  assertCanInviteRole(actorMembership.role, targetRole);

  const membership = await inviteMemberInOrganization(orgId, userId, roleId);

  if (!membership || !membership.id) {
    throw new ApiError(500, "Failed to invite member to organization", "MEMBER_INVITE_FAILED");
  }

  return membership;
};

export const updateMemberFromOrganizationService = async (
  orgId,
  userId,
  roleId,
  actorMembership,
) => {
  const targetMembership = await getOrganizationMembershipByUserId(orgId, userId);

  if (!targetMembership || !targetMembership.id) {
    throw new ApiError(404, "Member not found in organization", "MEMBER_NOT_FOUND");
  }

  const nextRole = await getOrgRoleById(roleId);

  if (!nextRole || nextRole.organizationId !== orgId) {
    throw new ApiError(400, "Invalid role for this organization", "INVALID_ROLE");
  }

  assertCanUpdateRole(actorMembership, targetMembership, nextRole);

  const updatedMembership = await updateMembershipRole(orgId, userId, roleId);

  if (!updatedMembership || !updatedMembership.id) {
    throw new ApiError(500, "Failed to update member in organization", "MEMBER_UPDATE_FAILED");
  }

  return updatedMembership;
};

// ── Role CRUD ────────────────────────────────────────────────────────

export const getRolesService = async (orgId) => {
  const roles = await getOrgRoles(orgId);
  return roles || [];
};

export const createRoleService = async (orgId, { name, permissions, level }, actorMembership) => {
  if (level >= actorMembership.role.level) {
    throw new ApiError(403, "Cannot create a role with level equal to or higher than yours", "ROLE_LEVEL_FORBIDDEN");
  }

  const existing = await getOrgRoleByName(orgId, name);
  if (existing) {
    throw new ApiError(409, "A role with this name already exists", "ROLE_NAME_EXISTS");
  }

  const role = await createOrgRole(orgId, { name, permissions, level });

  if (!role || !role.id) {
    throw new ApiError(500, "Failed to create role", "ROLE_CREATION_FAILED");
  }

  return role;
};

export const updateRoleService = async (orgId, roleId, updates, actorMembership) => {
  const role = await getOrgRoleById(roleId);

  if (!role || role.organizationId !== orgId) {
    throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND");
  }

  if (role.isSystem) {
    throw new ApiError(403, "System roles cannot be modified", "SYSTEM_ROLE_IMMUTABLE");
  }

  if (role.level >= actorMembership.role.level) {
    throw new ApiError(403, "Cannot modify a role with level equal to or higher than yours", "ROLE_LEVEL_FORBIDDEN");
  }

  if (updates.level !== undefined && updates.level >= actorMembership.role.level) {
    throw new ApiError(403, "Cannot set role level equal to or higher than yours", "ROLE_LEVEL_FORBIDDEN");
  }

  if (updates.name) {
    const existing = await getOrgRoleByName(orgId, updates.name);
    if (existing && existing.id !== roleId) {
      throw new ApiError(409, "A role with this name already exists", "ROLE_NAME_EXISTS");
    }
  }

  const updatedRole = await updateOrgRole(roleId, updates);

  if (!updatedRole || !updatedRole.id) {
    throw new ApiError(500, "Failed to update role", "ROLE_UPDATE_FAILED");
  }

  return updatedRole;
};

export const deleteRoleService = async (orgId, roleId, actorMembership) => {
  const role = await getOrgRoleById(roleId);

  if (!role || role.organizationId !== orgId) {
    throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND");
  }

  if (role.isSystem) {
    throw new ApiError(403, "System roles cannot be deleted", "SYSTEM_ROLE_IMMUTABLE");
  }

  if (role.level >= actorMembership.role.level) {
    throw new ApiError(403, "Cannot delete a role with level equal to or higher than yours", "ROLE_LEVEL_FORBIDDEN");
  }

  const deletedRole = await deleteOrgRole(roleId);

  if (!deletedRole || !deletedRole.id) {
    throw new ApiError(500, "Failed to delete role", "ROLE_DELETION_FAILED");
  }

  return deletedRole;
};
