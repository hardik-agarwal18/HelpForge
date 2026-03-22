import prisma from "../../../config/database.config.js";

/**
 * Get AIConfig for an organization
 * @param {string} organizationId
 * @returns {Promise<Object|null>}
 */
export const getAIConfigByOrg = async (organizationId) => {
  return await prisma.aIConfig.findUnique({
    where: { organizationId },
  });
};

/**
 * Create AIConfig for an organization
 * @param {string} organizationId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const createAIConfig = async (organizationId, data) => {
  return await prisma.aIConfig.create({
    data: { organizationId, ...data },
  });
};

/**
 * Update AIConfig for an organization
 * @param {string} organizationId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const updateAIConfig = async (organizationId, data) => {
  return await prisma.aIConfig.update({
    where: { organizationId },
    data,
  });
};

/**
 * Upsert AIConfig — create if not exists, otherwise update
 * @param {string} organizationId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const upsertAIConfig = async (organizationId, data) => {
  return await prisma.aIConfig.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
};
