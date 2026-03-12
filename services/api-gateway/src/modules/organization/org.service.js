import { createOrganization, getOrganizationsByUserId } from "./org.repo.js";

export const createOrganizationService = async (name, userId) => {
  return await createOrganization(name, userId);
};

export const getOrganizationByUserIdService = async (userId) => {
  return await getOrganizationsByUserId(userId);
};
