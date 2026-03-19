import logger from "../../../../config/logger.js";
import { buildSummaryContext } from "../prompts/summary.prompt.js";
import aiConfig from "../config/ai.config.js";

/**
 * AI Provider - Integrates with external AI services (OpenAI)
 * Currently supports OpenAI's API, extendable for other providers
 */

const { provider, openAiApiKey: apiKey, model } = aiConfig;

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

    return await callOpenAI(context);
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

    return await callOpenAISummary(comments);
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
