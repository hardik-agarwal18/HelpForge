import db from "../../config/database.config.js";
import { normalizeMembershipRole } from "../organization/org.utils.js";

const rolePermissionInclude = {
  rolePermissions: {
    include: {
      permission: true,
    },
  },
};

export const getTicketOrganizationMembership = async (
  organizationId,
  userId,
) => {
  const membership = await db.read.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    include: {
      role: {
        include: rolePermissionInclude,
      },
    },
  });

  return normalizeMembershipRole(membership);
};

export const getTicketMembershipsByUserId = async (userId) => {
  const memberships = await db.read.membership.findMany({
    where: {
      userId,
    },
    include: {
      role: {
        include: rolePermissionInclude,
      },
    },
  });

  return memberships.map(normalizeMembershipRole);
};

export const updateAgentAvailability = async (
  organizationId,
  userId,
  isAvailable,
) => {
  return await db.write.membership.update({
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
  const memberships = await db.read.membership.findMany({
    where: {
      organizationId,
      role: { name: "AGENT" },
      isAvailable: true,
    },
    include: {
      user: true,
      role: {
        include: rolePermissionInclude,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return memberships.map(normalizeMembershipRole);
};

export const getOrganizationAgentWorkloads = async (organizationId) => {
  return await db.read.agentWorkload.findMany({
    where: {
      organizationId,
    },
  });
};

export const createTag = async (tagData) => {
  return await db.write.tag.create({
    data: tagData,
  });
};

export const getTags = async (organizationId) => {
  return await db.read.tag.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      name: "asc",
    },
  });
};

export const getTagById = async (tagId) => {
  return await db.read.tag.findUnique({
    where: {
      id: tagId,
    },
  });
};

export const getTagByName = async (organizationId, name) => {
  return await db.read.tag.findFirst({
    where: {
      organizationId,
      name,
    },
  });
};

export const createTicket = async (ticketData) => {
  return await db.write.ticket.create({
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
  return await db.read.ticket.findMany({
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
  return await db.read.ticket.findMany({
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
  return await db.read.ticket.findUnique({
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
  return await db.write.ticket.update({
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
  return await db.write.ticket.update({
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
  return await db.write.$transaction(async (tx) => {
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
  return await db.write.ticket.update({
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
  return await db.write.ticketComment.create({
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
  return await db.write.ticketActivityLog.create({
    data: {
      ticketId,
      ...activityData,
    },
  });
};

export const addTagToTicket = async (ticketId, tagId) => {
  return await db.write.ticketTag.create({
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
  return await db.read.ticketTag.findUnique({
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
  return await db.write.ticketTag.delete({
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
  return await db.read.ticketComment.findMany({
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
  return await db.read.ticketActivityLog.findMany({
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
  return await db.read.ticketComment.findUnique({
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
  return await db.write.ticketComment.delete({
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
  return await db.write.ticketAttachment.create({
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
  return await db.read.ticketAttachment.findMany({
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
  return await db.read.ticketAttachment.findUnique({
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
  return await db.write.ticketAttachment.delete({
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
  return db.read.ticket.findMany({
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
