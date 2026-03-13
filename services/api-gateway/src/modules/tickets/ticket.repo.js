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

export const assignTicket = async (
  ticketId,
  assignedToId,
  actorId,
  previousAssignedToId,
) => {
  return await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedToId,
      activities: {
        create: {
          actorId,
          action: "TICKET_ASSIGNED",
          oldValue: previousAssignedToId,
          newValue: assignedToId,
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

export const updateTicketStatus = async (
  ticketId,
  status,
  actorId,
  previousStatus,
) => {
  return await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status,
      activities: {
        create: {
          actorId,
          action: "TICKET_STATUS_UPDATED",
          oldValue: previousStatus,
          newValue: status,
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

export const createTicketComment = async (ticketId, commentData) => {
  return await prisma.ticketComment.create({
    data: {
      ticketId,
      ...commentData,
    },
    include: {
      author: true,
      ticket: true,
    },
  });
};

export const createTicketActivityLog = async (ticketId, activityData) => {
  return await prisma.ticketActivityLog.create({
    data: {
      ticketId,
      ...activityData,
    },
  });
};

export const getTicketComments = async (ticketId) => {
  return await prisma.ticketComment.findMany({
    where: {
      ticketId,
    },
    include: {
      author: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
};

export const getTicketCommentById = async (commentId) => {
  return await prisma.ticketComment.findUnique({
    where: {
      id: commentId,
    },
    include: {
      author: true,
      ticket: true,
    },
  });
};

export const deleteTicketComment = async (commentId) => {
  return await prisma.ticketComment.delete({
    where: {
      id: commentId,
    },
    include: {
      author: true,
      ticket: true,
    },
  });
};

export const createTicketAttachment = async (ticketId, attachmentData) => {
  return await prisma.ticketAttachment.create({
    data: {
      ticketId,
      ...attachmentData,
    },
    include: {
      uploader: true,
      ticket: true,
    },
  });
};

export const getTicketAttachments = async (ticketId) => {
  return await prisma.ticketAttachment.findMany({
    where: {
      ticketId,
    },
    include: {
      uploader: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
};
