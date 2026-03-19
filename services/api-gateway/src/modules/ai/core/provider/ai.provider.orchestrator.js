import logger from "../../../../config/logger.js";
import * as aiProvider from "./ai.provider.js";
import { withRetry } from "./ai.retry.js";
import { withTimeout } from "./ai.timeout.js";
import aiConfig from "../config/ai.config.js";

const {
  timeoutMs: AI_PROVIDER_TIMEOUT_MS,
  retries: AI_PROVIDER_RETRIES,
  retryDelayMs: AI_PROVIDER_RETRY_DELAY_MS,
} = aiConfig.providerGuards;

const executeWithProviderGuards = async (fn, timeoutMessage) => {
  return withRetry(
    () => withTimeout(fn(), AI_PROVIDER_TIMEOUT_MS, timeoutMessage),
    {
      retries: AI_PROVIDER_RETRIES,
      delayMs: AI_PROVIDER_RETRY_DELAY_MS,
      onRetry: (error, retriesRemaining) => {
        logger.warn(
          { error, retriesRemaining },
          "AI provider call failed, retrying",
        );
      },
    },
  );
};

/**
 * Generate an AI response with standardized retry and timeout guards.
 * @param {Object} config
 * @returns {Promise<string>}
 */
export const generateAIResponse = async (config) => {
  return executeWithProviderGuards(
    () => aiProvider.generateResponse(config),
    "AI provider timeout while generating response",
  );
};

/**
 * Generate an AI summary with standardized retry and timeout guards.
 * @param {Array} comments
 * @returns {Promise<string>}
 */
export const generateAISummary = async (comments) => {
  return executeWithProviderGuards(
    () => aiProvider.generateSummary(comments),
    "AI provider timeout while generating summary",
  );
};
