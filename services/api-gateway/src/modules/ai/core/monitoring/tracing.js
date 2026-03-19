import logger from "../../../../config/logger.js";
import aiConfig from "../config/ai.config.js";

export const startTrace = (name, metadata = {}) => {
  const startedAt = Date.now();

  return {
    name,
    metadata,
    finish(extra = {}) {
      const durationMs = Date.now() - startedAt;

      if (aiConfig.monitoring.enabled) {
        logger.debug(
          {
            trace: name,
            durationMs,
            metadata,
            ...extra,
          },
          "AI trace completed",
        );
      }

      return durationMs;
    },
  };
};

export default {
  startTrace,
};
