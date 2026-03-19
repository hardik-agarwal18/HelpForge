import logger from "../../../../config/logger.js";
import {
  buildAIOrganizationUsageCacheKey,
  buildAITicketUsageCacheKey,
} from "../cache/cache.keys.js";
import { incrementHashValues } from "../cache/cache.service.js";

const trackAIUsageTotals = async (entry) => {
  const aiUsage = entry?.metadata?.aiUsage;

  if (!aiUsage) {
    return;
  }

  const usageTotals = {
    tokensUsed: aiUsage.tokensUsed || 0,
    cost: aiUsage.cost || 0,
    requests: 1,
  };

  const updates = [];

  if (entry?.ticketId) {
    updates.push(
      incrementHashValues(buildAITicketUsageCacheKey(entry.ticketId), usageTotals),
    );
  }

  if (entry?.organizationId) {
    updates.push(
      incrementHashValues(
        buildAIOrganizationUsageCacheKey(entry.organizationId),
        usageTotals,
      ),
    );
  }

  await Promise.all(updates);
};

/**
 * Logger-backed AI activity persistence hook.
 * The current schema has no dedicated AI logs table yet, so this centralizes
 * the contract without forcing a migration right now.
 */
export const logAIActivity = async (entry) => {
  const payload = {
    ticketId: entry?.ticketId,
    organizationId: entry?.organizationId,
    module: entry?.module || "ai",
    action: entry?.action || "unknown",
    metadata: entry?.metadata || {},
    createdAt: entry?.createdAt || new Date().toISOString(),
  };

  await trackAIUsageTotals(payload);
  logger.info(payload, "AI activity logged");
  return payload;
};

export default {
  logAIActivity,
};
