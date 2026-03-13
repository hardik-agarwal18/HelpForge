import {
  createOrganization,
  getOrganizationsByUserId,
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
