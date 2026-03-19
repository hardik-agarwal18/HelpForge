import logger from "../../../../config/logger.js";
import { withRetry } from "./ai.retry.js";
import { withTimeout } from "./ai.timeout.js";
import { buildSummaryContext } from "../prompts/summary.prompt.js";

/**
 * AI Provider - Integrates with external AI services (OpenAI)
 * Currently supports OpenAI's API, extendable for other providers
 */

const provider = process.env.AI_PROVIDER || "openai";
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.AI_MODEL;

const AI_PROVIDER_TIMEOUT_MS =
  Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 15000;
const AI_PROVIDER_RETRIES = Number(process.env.AI_PROVIDER_RETRIES) || 3;
const AI_PROVIDER_RETRY_DELAY_MS =
  Number(process.env.AI_PROVIDER_RETRY_DELAY_MS) || 500;

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
 * Generate AI response from a ticket context
 * @param {Object} context - Ticket context with comments
 * @returns {Promise<string>} AI generated response
 */
export const generateResponse = async (context) => {
  try {
    logger.info(
      {
        ticketId: context.ticketId,
        provider,
        model,
        hasApiKey: Boolean(apiKey),
      },
      "Generating AI response",
    );

    return await executeWithProviderGuards(
      async () => callOpenAI(context),
      "AI provider timeout while generating response",
    );
  } catch (error) {
    logger.error({ error, context }, "Failed to generate AI response");
    throw error;
  }
};

/**
 * Call OpenAI API with context
 * @private
 */
const callOpenAI = async (context) => {
  // Placeholder for OpenAI call
  // In production:
  // const openai = new OpenAI({ apiKey });
  // const response = await openai.chat.completions.create({...})
  return "This is a placeholder AI response. Configure OpenAI API key to enable.";
};

/**
 * Generate summary of conversation
 * @param {Array} comments - Array of ticket comments
 * @returns {Promise<string>} Summary
 */
export const generateSummary = async (comments) => {
  try {
    logger.info(
      { commentCount: comments.length, provider, model },
      "Generating conversation summary",
    );

    return await executeWithProviderGuards(
      async () => callOpenAISummary(comments),
      "AI provider timeout while generating summary",
    );
  } catch (error) {
    logger.error({ error }, "Failed to generate summary");
    throw error;
  }
};

const callOpenAISummary = async (comments) => {
  const summaryContext = buildSummaryContext(comments);

  // Placeholder for OpenAI summary call using summaryContext
  if (!summaryContext) {
    return "Ticket summary placeholder";
  }

  return "Ticket summary placeholder";
};
