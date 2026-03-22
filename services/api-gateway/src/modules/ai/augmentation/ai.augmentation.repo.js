import logger from "../../../config/logger.js";
import {
  getAgentTickets,
  getTicket,
  getTicketWithComments,
} from "../core/repo/ticket.base.repo.js";

/**
 * Dedicated repository for the augmentation module.
 * It composes shared ticket queries so augmentation can evolve
 * independently without duplicating core ticket access logic.
 */
export const getAugmentationTicket = async (ticketId) => {
  try {
    return await getTicket(ticketId);
  } catch (error) {
    logger.error({ error, ticketId }, "Error fetching augmentation ticket");
    throw error;
  }
};

export const getAugmentationTicketWithComments = async (ticketId) => {
  try {
    return await getTicketWithComments(ticketId);
  } catch (error) {
    logger.error(
      { error, ticketId },
      "Error fetching augmentation ticket with comments",
    );
    throw error;
  }
};

export const getAugmentationAgentTickets = async (agentId, since) => {
  try {
    return await getAgentTickets(agentId, since);
  } catch (error) {
    logger.error(
      { error, agentId, since },
      "Error fetching augmentation agent tickets",
    );
    throw error;
  }
};

