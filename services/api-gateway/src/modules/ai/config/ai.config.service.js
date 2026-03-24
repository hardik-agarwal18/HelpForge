import { ApiError } from "../../../utils/errorHandler.js";
import * as aiConfigRepo from "./ai.config.repo.js";

/**
 * Get AI config for an organization.
 * Returns null if no config has been created yet.
 * @param {string} organizationId
 * @returns {Promise<Object|null>}
 */
export const getAIConfigService = async (organizationId) => {
  return await aiConfigRepo.getAIConfigByOrg(organizationId);
};

/**
 * Create AI config for an organization.
 * Throws 409 if one already exists.
 * @param {string} organizationId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const createAIConfigService = async (organizationId, data) => {
  const existing = await aiConfigRepo.getAIConfigByOrg(organizationId);
  if (existing) {
    throw new ApiError(409, "AI config already exists for this organization. Use PATCH to update.", "AI_CONFIG_EXISTS");
  }

  return await aiConfigRepo.createAIConfig(organizationId, data);
};

/**
 * Update AI config for an organization.
 * Throws 404 if no config exists yet.
 * @param {string} organizationId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const updateAIConfigService = async (organizationId, data) => {
  const existing = await aiConfigRepo.getAIConfigByOrg(organizationId);
  if (!existing) {
    throw new ApiError(404, "AI config not found for this organization. Use POST to create.", "AI_CONFIG_NOT_FOUND");
  }

  return await aiConfigRepo.updateAIConfig(organizationId, data);
};
