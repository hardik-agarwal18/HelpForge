import prisma from "../../config/database.config.js";

export const getTicketOrganizationMembership = async (organizationId, userId) => {
  return await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });
};

export const createTicket = async (ticketData) => {
  return await prisma.ticket.create({
    data: {
      ...ticketData,
      activities: {
        create: {
          actorId: ticketData.createdById,
          action: "TICKET_CREATED",
          newValue: ticketData.title,
        },
      },
    },
    include: {
      organization: true,
      createdBy: true,
      assignedTo: true,
      activities: true,
    },
  });
};

export const getTickets = async (filters) => {
  return await prisma.ticket.findMany({
    where: filters,
    include: {
      organization: true,
      createdBy: true,
      assignedTo: true,
      activities: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};
