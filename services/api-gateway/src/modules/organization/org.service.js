import {
  createOrganization,
  deleteOrganization,
  findOrganizationByOwner,
  getOrganizationMembersById,
  getOrganizationMembershipByUserId,
  getOrganizationsByUserId,
  inviteMemberInOrganization,
  patchOrganization,
  updateMembershipRole,
} from "./org.repo.js";
import { ApiError } from "../../utils/errorHandler.js";
import { normalizeRole, assertCanInviteRole, assertCanUpdateRole } from "./org.utils.js";

export const getOrganizationByUserIdService = async (userId) => {
  const organizations = await getOrganizationsByUserId(userId);
  return organizations || [];
};

export const createOrganizationService = async ({ name, userId }) => {
  const existingOrg = await findOrganizationByOwner({ userId });

  if (existingOrg) {
    throw new ApiError(409, "User already owns an organization", "USER_ALREADY_OWNER");
  }

  const organization = await createOrganization({ name, userId });

  if (!organization || !organization.id) {
    throw new ApiError(500, "Failed to create organization", "ORG_CREATION_FAILED");
  }

  return organization;
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

export const viewAllMembersInOrganizationService = async (orgId) => {
  const members = await getOrganizationMembersById(orgId);
  return members || [];
};

export const inviteMemberInOrganizationService = async (
  orgId,
  userId,
  role,
  actorMembership,
) => {
  const normalizedRole = normalizeRole(role);
  assertCanInviteRole(actorMembership?.role, normalizedRole);

  const membership = await inviteMemberInOrganization(orgId, userId, normalizedRole);

  if (!membership || !membership.id) {
    throw new ApiError(500, "Failed to invite member to organization", "MEMBER_INVITE_FAILED");
  }

  return membership;
};

export const updateMemberFromOrganizationService = async (
  orgId,
  userId,
  role,
  actorMembership,
) => {
  const normalizedRole = normalizeRole(role);
  const targetMembership = await getOrganizationMembershipByUserId(orgId, userId);

  if (!targetMembership || !targetMembership.id) {
    throw new ApiError(404, "Member not found in organization", "MEMBER_NOT_FOUND");
  }

  assertCanUpdateRole(actorMembership, targetMembership, normalizedRole);

  const updatedMembership = await updateMembershipRole(orgId, userId, normalizedRole);

  if (!updatedMembership || !updatedMembership.id) {
    throw new ApiError(500, "Failed to update member in organization", "MEMBER_UPDATE_FAILED");
  }

  return updatedMembership;
};
