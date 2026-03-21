import {
  deleteOrganization,
  getOrganizationMembersById,
  getOrganizationMembershipByUserId,
  getOrganizationsByUserId,
  inviteMemberInOrganization,
  updateMembershipRole,
} from "./org.repo.js";
import { ApiError } from "../../utils/errorHandler.js";
import { ROLE_POLICIES } from "./org.constants.js";

const normalizeRole = (role) => {
  if (typeof role !== "string" || !role.trim()) {
    throw new ApiError(400, "Role is required");
  }

  const normalizedRole = role.toUpperCase();

  if (!ROLE_POLICIES[normalizedRole]) {
    throw new ApiError(400, "Invalid role");
  }

  return normalizedRole;
};

const getRolePolicy = (role) => ROLE_POLICIES[role] || null;

const assertCanInviteRole = (actorRole, targetRole) => {
  const actorPolicy = getRolePolicy(actorRole);

  if (actorPolicy?.canInvite.includes(targetRole)) {
    return;
  }

  throw new ApiError(403, "You do not have permission to invite this role");
};

const assertCanUpdateRole = (actorMembership, targetMembership, nextRole) => {
  const actorRole = actorMembership?.role;
  const actorPolicy = getRolePolicy(actorRole);

  if (!actorPolicy || actorPolicy.canManage.length === 0) {
    throw new ApiError(403, "You do not have permission to update roles");
  }

  if (
    actorMembership.userId === targetMembership.userId &&
    actorRole === "OWNER"
  ) {
    throw new ApiError(400, "Owner cannot change their own role");
  }

  if (!actorPolicy.canManage.includes(targetMembership.role)) {
    throw new ApiError(
      403,
      "You can only update members with a lower role than yours",
    );
  }

  if (nextRole === "OWNER") {
    throw new ApiError(400, "Cannot assign OWNER role to a member");
  }

  if (!actorPolicy.canAssign.includes(nextRole)) {
    throw new ApiError(
      403,
      "You cannot promote a member to your role or higher",
    );
  }
};

export const getOrganizationByUserIdService = async (userId) => {
  const organizations = await getOrganizationsByUserId(userId);

  return organizations || [];
};

export const inviteMemberInOrganizationService = async (
  orgId,
  userId,
  role,
  actorMembership,
) => {
  const normalizedRole = normalizeRole(role);
  assertCanInviteRole(actorMembership?.role, normalizedRole);
  const membership = await inviteMemberInOrganization(
    orgId,
    userId,
    normalizedRole,
  );

  if (!membership || !membership.id) {
    throw new ApiError(500, "Failed to invite member to organization");
  }

  return membership;
};

export const viewAllMembersInOrganizationService = async (orgId) => {
  const members = await getOrganizationMembersById(orgId);

  return members || [];
};

export const updateMemberFromOrganizationService = async (
  orgId,
  userId,
  role,
  actorMembership,
) => {
  const normalizedRole = normalizeRole(role);
  const targetMembership = await getOrganizationMembershipByUserId(
    orgId,
    userId,
  );

  if (!targetMembership || !targetMembership.id) {
    throw new ApiError(404, "Member not found in organization");
  }

  assertCanUpdateRole(actorMembership, targetMembership, normalizedRole);

  const updatedMembership = await updateMembershipRole(
    orgId,
    userId,
    normalizedRole,
  );

  if (!updatedMembership || !updatedMembership.id) {
    throw new ApiError(500, "Failed to update member in organization");
  }

  return updatedMembership;
};
