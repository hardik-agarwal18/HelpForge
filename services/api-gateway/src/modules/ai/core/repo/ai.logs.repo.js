import logger from "../../../../config/logger.js";

/**
 * Logger-backed AI activity persistence hook.
 * The current schema has no dedicated AI logs table yet, so this centralizes
 * the contract without forcing a migration right now.
 */
export const logAIActivity = async (entry) => {
  const payload = {
    ticketId: entry?.ticketId,
    module: entry?.module || "ai",
    action: entry?.action || "unknown",
    metadata: entry?.metadata || {},
    createdAt: entry?.createdAt || new Date().toISOString(),
  };

  logger.info(payload, "AI activity logged");
  return payload;
};

export default {
  logAIActivity,
};
