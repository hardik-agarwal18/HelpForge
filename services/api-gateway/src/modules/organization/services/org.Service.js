import { ApiError } from "../../../utils/errorHandler";
import {
  createOrganization,
  deleteOrganization,
  findOrganizationByOwner,
  patchOrganization,
} from "../repos/org.Repo";

export const createOrganizationService = async ({ name, userId }) => {
  const existingOrg = await findOrganizationByOwner({ userId });

  if (existingOrg) {
    throw new ApiError(400, "User already owns an organization");
  }
  const organization = await createOrganization({ name, userId });

  if (!organization || !organization.id) {
    throw new ApiError(500, "Failed to create organization");
  }

  return organization;
};

export const updateOrganizationService = async ({ orgId, name }) => {
  const updatedOrganization = await patchOrganization({ orgId, name });

  if (!updatedOrganization || !updatedOrganization.id) {
    throw new ApiError(500, "Failed to update organization");
  }

  return updatedOrganization;
};

export const deleteOrganizationService = async ({ orgId }) => {
  const deletedOrganization = await deleteOrganization({ orgId });

  if (!deletedOrganization || !deletedOrganization.id) {
    throw new ApiError(500, "Failed to delete organization");
  }

  return deletedOrganization;
};
