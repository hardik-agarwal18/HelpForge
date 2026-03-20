import { organizationIdParamSchema } from "./ai.analytics.validator";
import { getAIStats } from "./ai.analytics.service";
import logger from "../../../config/logger.js";

export const getStats = async (req, res, next) => {
  try {
    const { organizationId } = organizationIdParamSchema.parse(req.params);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = await getAIStats(organizationId, sevenDaysAgo);

    res.json({
      organizationId,
      period: "Last 7 days",
      ...stats,
    });
  } catch (error) {
    logger.error(
      { error, organizationId: req.params.organizationId },
      "Error getting stats",
    );
    next(error);
  }
};
