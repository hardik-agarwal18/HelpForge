import logger from "../../../config/logger.js";
import db from "../../../config/database.config.js";
import {
  getAgentTickets as getBaseAgentTickets,
  getTicket as getBaseTicket,
  getTicketComments as getBaseTicketComments,
  getTicketWithComments as getBaseTicketWithComments,
} from "../core/repo/ticket.base.repo.js";

/**
 * AI Repository - Data access layer for AI module
 * Abstracts all database operations for tickets, comments, agents, and workload
 */

/**
 * Get ticket with full context (comments, creator, assignee)
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Ticket with relations
 */
export const getTicketWithComments = async (ticketId) => {
  try {
    return await getBaseTicketWithComments(ticketId);
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching ticket with comments");
    throw error;
  }
};

/**
 * Get ticket basic info
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Ticket object
 */
export const getTicket = async (ticketId) => {
  try {
    return await getBaseTicket(ticketId);
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching ticket");
    throw error;
  }
};

/**
 * Get ticket comments only
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Array>} Array of comments
 */
export const getTicketComments = async (ticketId) => {
  try {
    return await getBaseTicketComments(ticketId);
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching comments");
    throw error;
  }
};

/**
 * Get recent AI comments for ticket
 * @param {string} ticketId - Ticket ID
 * @param {number} limit - Number of comments to fetch
 * @returns {Promise<Array>} AI comments
 */
export const getAIComments = async (ticketId, limit = 1) => {
  try {
    return await db.read.ticketComment.findMany({
      where: { ticketId, authorType: "AI" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching AI comments");
    throw error;
  }
};

/**
 * Get single comment by ID
 * @param {string} commentId - Comment ID
 * @returns {Promise<Object>} Comment object
 */
export const getComment = async (commentId) => {
  try {
    return await db.read.ticketComment.findUnique({
      where: { id: commentId },
    });
  } catch (error) {
    logger.error({ error, commentId }, "Error fetching comment");
    throw error;
  }
};

/**
 * Create ticket comment (AI or user)
 * @param {Object} data - Comment data { ticketId, message, authorType, authorId?, isInternal? }
 * @returns {Promise<Object>} Created comment
 */
export const createComment = async (data) => {
  try {
    const comment = await db.write.ticketComment.create({
      data: {
        ticketId: data.ticketId,
        message: data.message,
        authorType: data.authorType || "USER",
        authorId: data.authorId,
        isInternal: data.isInternal || false,
      },
    });

    logger.debug(
      { commentId: comment.id, ticketId: data.ticketId },
      "Comment created",
    );

    return comment;
  } catch (error) {
    logger.error({ error, data }, "Error creating comment");
    throw error;
  }
};

/**
 * Update ticket fields
 * @param {string} ticketId - Ticket ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated ticket
 */
export const updateTicket = async (ticketId, data) => {
  try {
    const ticket = await db.write.ticket.update({
      where: { id: ticketId },
      data,
    });

    logger.debug({ ticketId, updates: Object.keys(data) }, "Ticket updated");

    return ticket;
  } catch (error) {
    logger.error({ error, ticketId, data }, "Error updating ticket");
    throw error;
  }
};

/**
 * Get available agents for organization
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Array>} Available agents with workload
 */
export const getAvailableAgents = async (organizationId) => {
  try {
    return await db.read.agentWorkload.findMany({
      where: {
        organizationId,
        user: {
          memberships: {
            some: {
              isAvailable: true,
              role: { permissions: { has: "agent:update_availability" } },
            },
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  } catch (error) {
    logger.error({ error, organizationId }, "Error fetching available agents");
    throw error;
  }
};

/**
 * Get agent workload info
 * @param {string} userId - User ID
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Object>} Agent workload data
 */
export const getAgentWorkload = async (userId, organizationId) => {
  try {
    return await db.read.agentWorkload.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      "Error fetching agent workload",
    );
    throw error;
  }
};

/**
 * Get agent's tickets in timeframe
 * @param {string} agentId - Agent ID
 * @param {Date} since - Start date
 * @returns {Promise<Array>} Tickets assigned to agent
 */
export const getAgentTickets = async (agentId, since) => {
  try {
    return await getBaseAgentTickets(agentId, since);
  } catch (error) {
    logger.error({ error, agentId }, "Error fetching agent tickets");
    throw error;
  }
};

/**
 * Get ticket AI metadata
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} { aiActive, aiMessageCount, status, priority }
 */
export const getTicketAIMetadata = async (ticketId) => {
  try {
    const ticket = await db.read.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        aiActive: true,
        aiMessageCount: true,
        status: true,
        priority: true,
      },
    });

    return ticket;
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching AI metadata");
    throw error;
  }
};

/**
 * Increment AI message count
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Updated ticket
 */
export const incrementAIMessageCount = async (ticketId) => {
  try {
    return await db.write.ticket.update({
      where: { id: ticketId },
      data: {
        aiMessageCount: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Error incrementing AI message count");
    throw error;
  }
};

/**
 * Bulk update tickets (for batch operations)
 * @param {Array<{id, data}>} updates - Array of {id, data} objects
 * @returns {Promise<number>} Number of updated records
 */
export const bulkUpdateTickets = async (updates) => {
  try {
    await db.write.$transaction(
      updates.map(({ id, data }) => db.write.ticket.update({ where: { id }, data })),
    );

    logger.debug({ updateCount: updates.length }, "Bulk updated tickets");

    return updates.length;
  } catch (error) {
    logger.error(
      { error, updateCount: updates.length },
      "Error in bulk update",
    );
    throw error;
  }
};

/**
 * Get organization members (for team stats)
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Array>} Members with agent roles
 */
export const getOrganizationMembers = async (organizationId) => {
  try {
    return await db.read.membership.findMany({
      where: {
        organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  } catch (error) {
    logger.error({ error, organizationId }, "Error fetching org members");
    throw error;
  }
};

/**
 * Get all AI comments for ticket (for summaries)
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Array>} All AI comments
 */
export const getAllAIComments = async (ticketId) => {
  try {
    return await db.read.ticketComment.findMany({
      where: { ticketId, authorType: "AI" },
      orderBy: { createdAt: "asc" },
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching all AI comments");
    throw error;
  }
};

/**
 * Get user comments for ticket
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Array>} User comments only
 */
export const getUserComments = async (ticketId) => {
  try {
    return await db.read.ticketComment.findMany({
      where: { ticketId, authorType: "USER" },
      orderBy: { createdAt: "asc" },
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching user comments");
    throw error;
  }
};

/**
 * Transaction wrapper for complex operations
 * @param {Function} callback - Async function with prisma tx
 * @returns {Promise<any>} Result of callback
 */
export const transaction = async (callback) => {
  try {
    return await db.write.$transaction(callback);
  } catch (error) {
    logger.error({ error }, "Transaction failed");
    throw error;
  }
};

/**
 * Persist an exhausted AI queue job for later inspection/retry.
 * @param {Object} data - Failure data extracted from BullMQ job state
 * @param {number} maxEntries - Maximum number of failure rows to retain
 * @returns {Promise<Object>} Persisted failure record
 */
export const createAIProcessingFailure = async (data, maxEntries) => {
  try {
    const failure = await db.write.aiProcessingFailure.create({
      data: {
        queueName: data.queueName,
        jobName: data.jobName,
        jobId: data.jobId ? String(data.jobId) : null,
        ticketId: data.ticketId || null,
        commentId: data.commentId || null,
        attemptsMade: data.attemptsMade || 0,
        retryLimit: data.retryLimit || 0,
        retryable: data.retryable ?? true,
        failureReason: data.failureReason,
        stacktrace: data.stacktrace || null,
        payload: data.payload,
        failedAt: data.failedAt || new Date(),
      },
    });

    if (Number.isFinite(maxEntries) && maxEntries > 0) {
      const staleFailures = await db.read.aiProcessingFailure.findMany({
        orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
        skip: maxEntries,
        select: { id: true },
      });

      if (staleFailures.length > 0) {
        await db.write.aiProcessingFailure.deleteMany({
          where: {
            id: {
              in: staleFailures.map((entry) => entry.id),
            },
          },
        });
      }
    }

    return failure;
  } catch (error) {
    logger.error({ error, data }, "Error creating AI processing failure");
    throw error;
  }
};

/**
 * Get persisted AI queue failures from Postgres.
 * @param {number} limit - Number of failures to return
 * @returns {Promise<Array>} Failure records ordered newest-first
 */
export const getAIProcessingFailures = async (limit = 50) => {
  try {
    return await db.read.aiProcessingFailure.findMany({
      orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  } catch (error) {
    logger.error({ error, limit }, "Error fetching AI processing failures");
    throw error;
  }
};
