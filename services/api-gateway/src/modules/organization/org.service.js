import {
  createOrganization,
  deleteOrganization,
  getOrganizationMembersById,
  getOrganizationsByUserId,
  inviteMemberInOrganization,
  patchOrganization,
  updateMembershipRole,
} from "./org.repo.js";
import { ApiError } from "../../utils/errorHandler.js";

const normalizeRole = (role) => {
  if (typeof role !== "string" || !role.trim()) {
    throw new ApiError(400, "Role is required");
  }

  return role.toUpperCase();
};

export const createOrganizationService = async (name, userId) => {
  const organization = await createOrganization(name, userId);

  if (!organization || !organization.id) {
    throw new ApiError(500, "Failed to create organization");
  }

  return organization;
};

export const getOrganizationByUserIdService = async (userId) => {
  const organizations = await getOrganizationsByUserId(userId);

  return organizations || [];
};

export const updateOrganizationService = async (orgId, name) => {
  const updatedOrganization = await patchOrganization(orgId, name);

  if (!updatedOrganization || !updatedOrganization.id) {
    throw new ApiError(500, "Failed to update organization");
  }

  return updatedOrganization;
};

export const deleteOrganizationService = async (orgId) => {
  const deletedOrganization = await deleteOrganization(orgId);

  if (!deletedOrganization || !deletedOrganization.id) {
    throw new ApiError(500, "Failed to delete organization");
  }

  return deletedOrganization;
};

export const inviteMemberInOrganizationService = async (
  orgId,
  userId,
  role,
) => {
  const normalizedRole = normalizeRole(role);
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
) => {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "OWNER") {
    throw new ApiError(400, "Cannot assign OWNER role to a member");
  }

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
