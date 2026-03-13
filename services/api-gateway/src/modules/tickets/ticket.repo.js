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

export const getTicketById = async (ticketId) => {
  return await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      organization: true,
      createdBy: true,
      assignedTo: true,
      comments: {
        include: {
          author: true,
        },
      },
      attachments: true,
      tags: {
        include: {
          tag: true,
        },
      },
      activities: {
        include: {
          actor: true,
        },
      },
    },
  });
};

export const updateTicket = async (ticketId, ticketData, actorId) => {
  return await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...ticketData,
      activities: {
        create: {
          actorId,
          action: "TICKET_UPDATED",
        },
      },
    },
    include: {
      organization: true,
      createdBy: true,
      assignedTo: true,
      comments: {
        include: {
          author: true,
        },
      },
      attachments: true,
      tags: {
        include: {
          tag: true,
        },
      },
      activities: {
        include: {
          actor: true,
        },
      },
    },
  });
};
