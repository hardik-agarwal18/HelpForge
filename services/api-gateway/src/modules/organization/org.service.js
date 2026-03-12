import { createOrganization } from "./org.repo.js";

export const createOrganizationService = async (name) => {
  return await createOrganization(name);
};
