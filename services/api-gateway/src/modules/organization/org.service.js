import {
  createOrganization,
  deleteOrganization,
  getOrganizationMembersById,
  getOrganizationsByUserId,
  inviteMemberInOrganization,
  patchOrganization,
} from "./org.repo.js";
import { ApiError } from "../../utils/errorHandler.js";

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
  const membership = await inviteMemberInOrganization(orgId, userId, role);

  if (!membership || !membership.id) {
    throw new ApiError(500, "Failed to invite member to organization");
  }

  return membership;
};

export const viewAllMembersInOrganizationService = async (orgId) => {
  const members = await getOrganizationMembersById(orgId);

  return members || [];
};
