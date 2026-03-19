import logger from "../../../../config/logger.js";
import prisma from "../../../../config/database.config.js";

export const getTicketWithComments = async (ticketId) => {
  try {
    return await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
        createdBy: true,
        assignedTo: true,
        organization: true,
      },
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching ticket with comments");
    throw error;
  }
};

export const getTicket = async (ticketId) => {
  try {
    return await prisma.ticket.findUnique({
      where: { id: ticketId },
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching ticket");
    throw error;
  }
};

export const getTicketComments = async (ticketId) => {
  try {
    return await prisma.ticketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching comments");
    throw error;
  }
};

export const getAgentTickets = async (agentId, since) => {
  try {
    return await prisma.ticket.findMany({
      where: {
        assignedToId: agentId,
        updatedAt: { gte: since },
      },
      include: {
        comments: true,
      },
    });
  } catch (error) {
    logger.error({ error, agentId }, "Error fetching agent tickets");
    throw error;
  }
};

export default {
  getTicketWithComments,
  getTicket,
  getTicketComments,
  getAgentTickets,
};
