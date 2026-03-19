import logger from "../../../config/logger.js";
import * as aiRepo from "../automation/ai.automation.repo.js";
import {
  generateAIResponse,
  generateAISummary,
} from "../core/provider/ai.provider.orchestrator.js";
import {
  buildAgentContext,
  getAgentSystemPrompt,
} from "../core/prompts/agent.prompt.js";

/**
 * AI Augmentation Service - PHASE 3
 * Provides AI-powered suggestions and summaries to speed up human agents
 * Goals: AI suggestions, ticket summaries, agent performance boost
 */

/**
 * Generate suggested reply for an agent
 * Analyzes ticket conversation and suggests next best response
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Suggested reply with confidence
 */
export const generateAgentSuggestion = async (ticketId) => {
  try {
    const ticket = await aiRepo.getTicketWithComments(ticketId);

    if (!ticket) {
      logger.warn({ ticketId }, "Ticket not found for suggestion");
      return null;
    }

    // Get the last user comment
    const lastUserComment = [...ticket.comments]
      .reverse()
      .find((c) => c.authorType === "USER");

    if (!lastUserComment) {
      logger.warn({ ticketId }, "No user comment found");
      return null;
    }

    // Build context for agent
    const context = buildAgentContext(ticket, lastUserComment);

    logger.info({ ticketId }, "Generating agent suggestion");

    // Call AI with agent-optimized prompt
    const suggestion = await generateAIResponse({
      ticketId: ticket.id,
      context,
      systemPrompt: getAgentSystemPrompt(),
    });

    // Calculate quality metrics
    const metrics = calculateSuggestionQuality(suggestion);

    logger.info(
      { ticketId, quality: metrics.quality },
      "Agent suggestion generated",
    );

    return {
      ticketId: ticket.id,
      suggestion,
      quality: metrics.quality, // "excellent" | "good" | "fair"
      confidence: metrics.confidence,
      reasoning: metrics.reasoning,
      copySuggestion: `Copy & Customize: ${suggestion.substring(0, 50)}...`,
    };
  } catch (error) {
    logger.error({ error, ticketId }, "Error generating agent suggestion");
    return null;
  }
};

/**
 * Generate conversation summary for agent
 * Concise overview of issue, attempts, and current state
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Summary with key information
 */
export const generateTicketSummary = async (ticketId) => {
  try {
    const ticket = await aiRepo.getTicketWithComments(ticketId);

    if (!ticket) {
      logger.warn({ ticketId }, "Ticket not found for summary");
      return null;
    }

    logger.info({ ticketId }, "Generating ticket summary");

    const summary = await generateAISummary(ticket.comments);

    // Extract key information
    const keyInfo = extractKeyInformation(ticket);

    logger.info(
      { ticketId, summaryLength: summary.length },
      "Ticket summary generated",
    );

    return {
      ticketId: ticket.id,
      title: ticket.title,
      issue: generateIssueSummary(ticket, summary),
      timeline: generateTimeline(ticket),
      keyPoints: keyInfo.keyPoints,
      attemptedSolutions: keyInfo.attemptedSolutions,
      nextSteps: keyInfo.nextSteps,
      customerSentiment: analyzeCustomerSentiment(ticket.comments),
      priority: ticket.priority,
      age: calculateTicketAge(ticket.createdAt),
    };
  } catch (error) {
    logger.error({ error, ticketId }, "Error generating summary");
    return null;
  }
};

/**
 * Generate suggested actions for agent
 * What should the agent do next?
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Array>} Array of suggested actions
 */
export const generateSuggestedActions = async (ticketId) => {
  try {
    const ticket = await aiRepo.getTicket(ticketId);

    if (!ticket) {
      return [];
    }

    const actions = [];

    // Check for patterns
    const commentCount = ticket.comments.length;
    const hasAttachments = ticket.comments.some(
      (c) => c.attachments && c.attachments.length > 0,
    );
    const lastComment = ticket.comments[ticket.comments.length - 1];
    const ticketAge = Date.now() - ticket.createdAt.getTime();

    // Action 1: Escalation check
    if (
      ticketAge > 86400000 && // > 24 hours
      commentCount > 3 &&
      ticket.status === "OPEN"
    ) {
      actions.push({
        rank: 1,
        actionType: "escalate",
        title: "Consider escalation",
        description:
          "Ticket is 24+ hours old with multiple comments. May need supervisor review.",
        priority: "HIGH",
      });
    }

    // Action 2: Attachment request
    if (!hasAttachments && ticket.priority === "HIGH") {
      actions.push({
        rank: 2,
        actionType: "request_attachment",
        title: "Request more information",
        description:
          "High priority ticket without attachments. Ask for logs/screenshots.",
        priority: "MEDIUM",
      });
    }

    // Action 3: Schedule follow-up
    if (commentCount > 5) {
      actions.push({
        rank: 3,
        actionType: "schedule_followup",
        title: "Schedule follow-up",
        description:
          "Complex issue with multiple back-and-forths. Schedule dedicated call.",
        priority: "MEDIUM",
      });
    }

    // Action 4: Knowledge base search
    if (lastComment?.authorType === "USER" && commentCount > 2) {
      actions.push({
        rank: 4,
        actionType: "kb_search",
        title: "Check knowledge base",
        description: "Suggested searches: common errors related to this issue.",
        priority: "LOW",
      });
    }

    logger.info(
      { ticketId, actionCount: actions.length },
      "Suggested actions generated",
    );

    return actions;
  } catch (error) {
    logger.error({ error, ticketId }, "Error generating suggested actions");
    return [];
  }
};

/**
 * Get agent stats and performance boosters
 * @param {string} agentId - Agent ID
 * @param {number} days - Number of days to analyze (default 7)
 * @returns {Promise<Object>} Agent performance metrics
 */
export const getAgentAugmentationStats = async (agentId, days = 7) => {
  try {
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const tickets = await aiRepo.getAgentTickets(agentId, daysAgo);

    const resolvedTickets = tickets.filter((t) => t.status === "RESOLVED");
    const activeTickets = tickets.filter((t) => t.status !== "RESOLVED");

    // Calculate metrics
    const totalHandled = tickets.length;
    const totalResolved = resolvedTickets.length;
    const avgResponseTime = calculateAvgResponseTime(tickets);
    const avgTicketAge = calculateAvgTicketAge(tickets);
    const aiBoosted = tickets.filter((t) => t.aiMessageCount > 0).length;

    return {
      agentId,
      period: `Last ${days} days`,
      stats: {
        totalTicketsHandled: totalHandled,
        resolved: totalResolved,
        active: activeTickets.length,
        resolutionRate:
          totalHandled > 0
            ? ((totalResolved / totalHandled) * 100).toFixed(2)
            : "0",
        avgResolutionTime: `${avgTicketAge} hours`,
        avgRespondTime: `${avgResponseTime} min`,
      },
      aiBooster: {
        ticketsWithAISuggestions: aiBoosted,
        suggestionsAcceptanceRate:
          ((aiBoosted / Math.max(1, totalHandled)) * 100).toFixed(2) + "%",
        timeSavedPerDay: `${Math.round((aiBoosted * 15) / days)} min`,
        estimatedHoursSaved: ((aiBoosted * 0.25) / days).toFixed(2),
      },
      recommendations: generateAgentRecommendations(
        resolvedTickets,
        activeTickets,
      ),
    };
  } catch (error) {
    logger.error({ error, agentId }, "Error calculating agent stats");
    return null;
  }
};

/**
 * Calculate quality of suggestion
 * @private
 */
const calculateSuggestionQuality = (suggestion) => {
  let quality = "fair";
  let confidence = 0.5;
  const factors = [];

  // Check length
  if (suggestion.length > 150 && suggestion.length < 400) {
    quality = "good";
    confidence += 0.15;
    factors.push("appropriate length");
  }

  // Check for clarity
  if (
    !suggestion.toLowerCase().includes("unclear") &&
    !suggestion.toLowerCase().includes("unsure")
  ) {
    confidence += 0.1;
    factors.push("clear response");
  }

  // Check for actionability
  if (
    suggestion.toLowerCase().includes("please") ||
    suggestion.toLowerCase().includes("try") ||
    suggestion.toLowerCase().includes("can you")
  ) {
    quality = "excellent";
    confidence += 0.2;
    factors.push("actionable");
  }

  // Penalize for generic responses
  if (
    suggestion.toLowerCase().includes("sorry for the inconvenience") &&
    suggestion.length < 100
  ) {
    quality = "fair";
    confidence = Math.max(0, confidence - 0.1);
  }

  confidence = Math.min(1, confidence);

  return {
    quality,
    confidence,
    reasoning: `Suggestion quality based on: ${factors.join(", ") || "standard analysis"}`,
  };
};

/**
 * Extract key information from ticket
 * @private
 */
const extractKeyInformation = (ticket) => {
  const keyPoints = [];
  const attemptedSolutions = [];
  const nextSteps = [];

  // Add issue type
  keyPoints.push(`Priority: ${ticket.priority}`);
  keyPoints.push(`Status: ${ticket.status}`);

  // Analyze comments for patterns
  ticket.comments.forEach((comment) => {
    if (comment.message.toLowerCase().includes("tried")) {
      attemptedSolutions.push(comment.message);
    }
    if (comment.message.toLowerCase().includes("error")) {
      keyPoints.push(`Error mentioned: ${comment.message.substring(0, 50)}`);
    }
  });

  // Generate next steps based on status
  if (ticket.status === "OPEN") {
    nextSteps.push("Acknowledge customer, confirm understanding");
    nextSteps.push("Gather additional information if needed");
    nextSteps.push("Provide initial troubleshooting steps or timeline");
  } else if (ticket.status === "IN_PROGRESS") {
    nextSteps.push("Follow up on previous troubleshooting steps");
    nextSteps.push(
      "Escalate to higher tier support if customer reports no resolution",
    );
  }

  return { keyPoints, attemptedSolutions, nextSteps };
};

/**
 * Generate issue summary
 * @private
 */
const generateIssueSummary = (ticket, aiSummary) => {
  return `${ticket.title}. ${aiSummary?.substring(0, 100) || ticket.description?.substring(0, 100)}`;
};

/**
 * Generate timeline of events
 * @private
 */
const generateTimeline = (ticket) => {
  const events = [
    {
      time: ticket.createdAt,
      action: "Ticket created",
      actor: ticket.createdBy?.name || "customer",
    },
  ];

  if (ticket.assignedToId) {
    events.push({
      time: ticket.updatedAt,
      action: "Assigned to",
      actor: ticket.assignedTo?.name || "agent",
    });
  }

  return events;
};

/**
 * Analyze customer sentiment
 * @private
 */
const analyzeCustomerSentiment = (comments) => {
  const userComments = comments.filter((c) => c.authorType === "USER");

  if (userComments.length === 0) return "neutral";

  let positiveKeywords = 0;
  let negativeKeywords = 0;

  const positive = [
    "thanks",
    "great",
    "good",
    "perfect",
    "solved",
    "working",
    "fixed",
  ];
  const negative = [
    "frustrated",
    "angry",
    "still broken",
    "not working",
    "terrible",
    "waste",
  ];

  userComments.forEach((c) => {
    const lower = c.message.toLowerCase();
    positive.forEach((word) => {
      if (lower.includes(word)) positiveKeywords++;
    });
    negative.forEach((word) => {
      if (lower.includes(word)) negativeKeywords++;
    });
  });

  if (negativeKeywords > positiveKeywords) {
    return "negative";
  } else if (positiveKeywords > negativeKeywords) {
    return "positive";
  }
  return "neutral";
};

/**
 * Calculate ticket age in readable format
 * @private
 */
const calculateTicketAge = (createdAt) => {
  const now = Date.now();
  const age = now - createdAt.getTime();

  const hours = Math.floor(age / 3600000);
  const minutes = Math.floor((age % 3600000) / 60000);

  if (hours > 24) {
    return `${Math.floor(hours / 24)} day(s)`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
};

/**
 * Calculate average response time
 * @private
 */
const calculateAvgResponseTime = (tickets) => {
  let totalTime = 0;
  let count = 0;

  tickets.forEach((ticket) => {
    if (ticket.comments.length > 1) {
      const userComments = ticket.comments.filter(
        (c) => c.authorType === "USER",
      );
      const agentComments = ticket.comments.filter(
        (c) => c.authorType !== "USER" && c.authorType !== "AI",
      );

      if (userComments.length > 0 && agentComments.length > 0) {
        const lastUserTime = userComments[userComments.length - 1].createdAt;
        const firstAgentResponse =
          agentComments[0].createdAt > lastUserTime
            ? agentComments[0].createdAt
            : null;

        if (firstAgentResponse) {
          totalTime += (firstAgentResponse - lastUserTime) / 60000; // minutes
          count++;
        }
      }
    }
  });

  return count > 0 ? Math.round(totalTime / count) : 0;
};

/**
 * Calculate average ticket age
 * @private
 */
const calculateAvgTicketAge = (tickets) => {
  if (tickets.length === 0) return 0;

  const totalTime = tickets.reduce((sum, ticket) => {
    return sum + (Date.now() - ticket.createdAt.getTime());
  }, 0);

  return Math.round(totalTime / tickets.length / 3600000); // hours
};

/**
 * Generate recommendations for agent improvement
 * @private
 */
const generateAgentRecommendations = (resolved, active) => {
  const recommendations = [];

  if (resolved.length > 0) {
    recommendations.push(
      "✅ Strong resolution rate - keep up the quality work",
    );
  }

  if (active.length > 5) {
    recommendations.push(
      "⚠️ High active tickets - consider reducing new assignments",
    );
  }

  if (resolved.length > 0) {
    const avgTime = calculateAvgTicketAge(resolved);
    if (avgTime < 2) {
      recommendations.push("🚀 Quick resolution time - excellent performance");
    } else if (avgTime > 12) {
      recommendations.push(
        "⏱️ Tickets taking longer to resolve - escalation may help",
      );
    }
  }

  return recommendations;
};
