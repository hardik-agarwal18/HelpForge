import prisma from "../../config/database.config.js";

export const getTicketOrganizationMembership = async (
  organizationId,
  userId,
) => {
  return await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });
};

export const getTicketMembershipsByUserId = async (userId) => {
  return await prisma.membership.findMany({
    where: {
      userId,
    },
  });
};

export const updateAgentAvailability = async (
  organizationId,
  userId,
  isAvailable,
) => {
  return await prisma.membership.update({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    data: {
      isAvailable,
    },
  });
};

export const getOrganizationAvailableAgents = async (organizationId) => {
  return await prisma.membership.findMany({
    where: {
      organizationId,
      role: "AGENT",
      isAvailable: true,
    },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
};

export const getOrganizationAgentWorkloads = async (organizationId) => {
  return await prisma.agentWorkload.findMany({
    where: {
      organizationId,
    },
  });
};

export const createTag = async (tagData) => {
  return await prisma.tag.create({
    data: tagData,
  });
};

export const getTags = async (organizationId) => {
  return await prisma.tag.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      name: "asc",
    },
  });
};

export const getTagById = async (tagId) => {
  return await prisma.tag.findUnique({
    where: {
      id: tagId,
    },
  });
};

export const getTagByName = async (organizationId, name) => {
  return await prisma.tag.findFirst({
    where: {
      organizationId,
      name,
    },
  });
};

export const createTicket = async (ticketData) => {
  return await prisma.ticket.create({
    data: ticketData,
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

export const getAgentTickets = async (filters) => {
  return await prisma.ticket.findMany({
    where: filters,
    include: {
      organization: true,
      createdBy: true,
      assignedTo: true,
      tags: {
        include: {
          tag: true,
        },
      },
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

export const autoAssignTicket = async (
  ticketId,
  organizationId,
  agentUserId,
) => {
  return await prisma.$transaction(async (tx) => {
    const now = new Date();

    await tx.agentWorkload.upsert({
      where: {
        userId_organizationId: {
          userId: agentUserId,
          organizationId,
        },
      },
      update: {
        assignedToday: {
          increment: 1,
        },
        assignedThisWeek: {
          increment: 1,
        },
      },
      create: {
        userId: agentUserId,
        organizationId,
        assignedToday: 1,
        assignedThisWeek: 1,
        lastDailyReset: now,
        lastWeeklyReset: now,
      },
    });

    await tx.ticketActivityLog.create({
      data: {
        ticketId,
        actorId: agentUserId,
        action: "TICKET_ASSIGNED",
        newValue: agentUserId,
      },
    });

    return await tx.ticket.update({
      where: { id: ticketId },
      data: {
        assignedToId: agentUserId,
        status: "IN_PROGRESS",
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
      authorType: "USER",
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

export const addTagToTicket = async (ticketId, tagId) => {
  return await prisma.ticketTag.create({
    data: {
      ticketId,
      tagId,
    },
    include: {
      tag: true,
      ticket: true,
    },
  });
};

export const getTicketTagById = async (ticketId, tagId) => {
  return await prisma.ticketTag.findUnique({
    where: {
      ticketId_tagId: {
        ticketId,
        tagId,
      },
    },
    include: {
      tag: true,
      ticket: true,
    },
  });
};

export const deleteTicketTag = async (ticketId, tagId) => {
  return await prisma.ticketTag.delete({
    where: {
      ticketId_tagId: {
        ticketId,
        tagId,
      },
    },
    include: {
      tag: true,
      ticket: true,
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

export const getTicketActivities = async (ticketId) => {
  return await prisma.ticketActivityLog.findMany({
    where: {
      ticketId,
    },
    include: {
      actor: true,
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

export const getTicketAttachmentById = async (attachmentId) => {
  return await prisma.ticketAttachment.findUnique({
    where: {
      id: attachmentId,
    },
    include: {
      uploader: true,
      ticket: true,
    },
  });
};

export const deleteTicketAttachment = async (attachmentId) => {
  return await prisma.ticketAttachment.delete({
    where: {
      id: attachmentId,
    },
    include: {
      uploader: true,
      ticket: true,
    },
  });
};

export const getOrganizationTicketsWithAIMetrics = async (
  organizationId,
  since,
) => {
  return prisma.ticket.findMany({
    where: {
      organizationId,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      status: true,
      comments: {
        where: { authorType: "AI" },
        select: { id: true },
      },
    },
  });
};
