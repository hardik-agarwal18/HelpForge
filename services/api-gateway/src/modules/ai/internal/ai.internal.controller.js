import logger from "../../../config/logger.js";
import {
  generateAIResponse,
  generateAISummary,
} from "../core/provider/ai.provider.orchestrator.js";
import { getAIConfigByOrg } from "../config/ai.config.repo.js";

/**
 * POST /api/ai/internal/generate
 * Called by Python chatbot service.
 * Applies org-level config checks, then delegates to the AI orchestrator.
 */
export const generateController = async (req, res, next) => {
  try {
    const { orgId, messages, systemPrompt, ...rest } = req.body;

    const orgConfig = await getAIConfigByOrg(orgId);
    if (orgConfig && !orgConfig.aiEnabled) {
      return res.status(403).json({ success: false, message: "AI disabled for this organization" });
    }

    const result = await generateAIResponse({
      orgId,
      messages,
      systemPrompt,
      ...rest,
    });

    return res.status(200).json({
      success: true,
      content: result.content,
      usage: result.aiUsage,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/ai/internal/generate/stream
 * SSE streaming endpoint for the chatbot service.
 * Streams tokens as `data: <token>\n\n` events.
 *
 * NOTE: The current ai.provider.js returns a placeholder — swap with a real
 * OpenAI streaming call here when the API key is configured.
 */
export const generateStreamController = async (req, res, next) => {
  try {
    const { orgId, messages, systemPrompt } = req.body;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    // Placeholder: emit the full response as a single token chunk.
    // Replace with actual OpenAI stream iteration in production.
    const result = await generateAIResponse({ orgId, messages, systemPrompt });
    const words = result.content.split(" ");

    for (const word of words) {
      res.write(`data: ${word} \n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/ai/internal/embeddings
 * Returns embeddings for a list of texts.
 * The current provider returns placeholder vectors — replace with real call.
 */
export const embeddingsController = async (req, res, next) => {
  try {
    const { orgId, texts } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, message: "texts must be a non-empty array" });
    }

    // Placeholder: return zero-vectors.
    // Replace with actual embedding API call when configured.
    logger.info({ orgId, count: texts.length }, "Generating embeddings (placeholder)");
    const embeddings = texts.map(() => new Array(1536).fill(0));

    return res.status(200).json({ success: true, embeddings });
  } catch (error) {
    next(error);
  }
};
