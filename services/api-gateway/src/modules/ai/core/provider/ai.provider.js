import logger from "../../../../config/logger.js";
import { buildSummaryContext } from "../prompts/summary.prompt.js";
import aiConfig from "../config/ai.config.js";

/**
 * AI Provider - Integrates with external AI services (OpenAI)
 * Currently supports OpenAI's API, extendable for other providers
 */

const { provider, openAiApiKey: apiKey, model } = aiConfig;
const {
  promptCostPer1kTokens: PROMPT_COST_PER_1K_TOKENS,
  completionCostPer1kTokens: COMPLETION_COST_PER_1K_TOKENS,
} = aiConfig.usage;

const estimateTokens = (value) => {
  if (!value) {
    return 0;
  }

  return Math.max(1, Math.ceil(String(value).length / 4));
};

const buildAIUsage = (promptInput, completionOutput) => {
  const promptTokens = estimateTokens(promptInput);
  const completionTokens = estimateTokens(completionOutput);
  const tokensUsed = promptTokens + completionTokens;
  const cost =
    (promptTokens / 1000) * PROMPT_COST_PER_1K_TOKENS +
    (completionTokens / 1000) * COMPLETION_COST_PER_1K_TOKENS;

  return {
    promptTokens,
    completionTokens,
    tokensUsed,
    cost: Number(cost.toFixed(6)),
    model,
    provider,
  };
};

/**
 * Generate AI response from a ticket context
 * @param {Object} context - Ticket context with comments
 * @returns {Promise<{content: string, aiUsage: Object}>} AI generated response
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
  const content =
    "This is a placeholder AI response. Configure OpenAI API key to enable.";

  return {
    content,
    aiUsage: buildAIUsage(
      JSON.stringify(context),
      content,
    ),
  };
};

/**
 * Generate summary of conversation
 * @param {Array} comments - Array of ticket comments
 * @returns {Promise<{content: string, aiUsage: Object}>} Summary
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
  const content = "Ticket summary placeholder";

  return {
    content,
    aiUsage: buildAIUsage(summaryContext || "", content),
  };
};
