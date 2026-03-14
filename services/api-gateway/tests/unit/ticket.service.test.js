import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateTicket = jest.fn();
const mockCreateTicketAttachment = jest.fn();
const mockCreateTicketActivityLog = jest.fn();
const mockCreateTicketComment = jest.fn();
const mockAssignTicket = jest.fn();
const mockAddTagToTicket = jest.fn();
const mockCreateTag = jest.fn();
const mockDeleteTicketTag = jest.fn();
const mockDeleteTicketAttachment = jest.fn();
const mockDeleteTicketComment = jest.fn();
const mockGetTagById = jest.fn();
const mockGetTagByName = jest.fn();
const mockGetOrganizationAvailableAgents = jest.fn();
const mockGetOrganizationAgentWorkloads = jest.fn();
const mockGetTicketAttachmentById = jest.fn();
const mockGetTicketById = jest.fn();
const mockGetTicketCommentById = jest.fn();
const mockGetTicketTagById = jest.fn();
const mockGetTicketActivities = jest.fn();
const mockGetTicketAttachments = jest.fn();
const mockGetTicketComments = jest.fn();
const mockGetTicketOrganizationMembership = jest.fn();
const mockGetTicketMembershipsByUserId = jest.fn();
const mockGetTickets = jest.fn();
const mockGetAgentTickets = jest.fn();
const mockGetTags = jest.fn();
const mockUpdateAgentAvailability = jest.fn();
const mockAutoAssignTicket = jest.fn();
const mockUpdateTicketStatus = jest.fn();
const mockUpdateTicket = jest.fn();
const mockEventBusEmit = jest.fn();

jest.unstable_mockModule("../../src/modules/tickets/ticket.repo.js", () => ({
  addTagToTicket: mockAddTagToTicket,
  createTicketActivityLog: mockCreateTicketActivityLog,
  createTicketAttachment: mockCreateTicketAttachment,
  createTicketComment: mockCreateTicketComment,
  createTicket: mockCreateTicket,
  assignTicket: mockAssignTicket,
  autoAssignTicket: mockAutoAssignTicket,
  createTag: mockCreateTag,
  deleteTicketTag: mockDeleteTicketTag,
  deleteTicketAttachment: mockDeleteTicketAttachment,
  deleteTicketComment: mockDeleteTicketComment,
  getTagById: mockGetTagById,
  getTagByName: mockGetTagByName,
  getOrganizationAvailableAgents: mockGetOrganizationAvailableAgents,
  getOrganizationAgentWorkloads: mockGetOrganizationAgentWorkloads,
  getTicketAttachments: mockGetTicketAttachments,
  getTicketTagById: mockGetTicketTagById,
  getTicketActivities: mockGetTicketActivities,
  getTicketAttachmentById: mockGetTicketAttachmentById,
  getTicketById: mockGetTicketById,
  getTicketCommentById: mockGetTicketCommentById,
  getTicketComments: mockGetTicketComments,
  getTicketOrganizationMembership: mockGetTicketOrganizationMembership,
  getTicketMembershipsByUserId: mockGetTicketMembershipsByUserId,
  getTickets: mockGetTickets,
  getAgentTickets: mockGetAgentTickets,
  getTags: mockGetTags,
  updateAgentAvailability: mockUpdateAgentAvailability,
  updateTicketStatus: mockUpdateTicketStatus,
  updateTicket: mockUpdateTicket,
}));

jest.unstable_mockModule("../../src/events/eventBus.js", () => ({
  default: {
    emit: mockEventBusEmit,
  },
}));

const {
  addTicketTagService,
  autoAssignTicketService,
  createTicketAttachmentService,
  assignTicketService,
  createTagService,
  createTicketCommentService,
  createTicketService,
  deleteTicketTagService,
  deleteTicketAttachmentService,
  deleteTicketCommentService,
  getTicketByIdService,
  getTicketAttachmentsService,
  getTicketActivitiesService,
  getTicketCommentsService,
  getTicketsService,
  getTagsService,
  getMyAgentStatsService,
  getMyAgentTicketsService,
  updateMyAgentAvailabilityService,
  updateTicketStatusService,
  updateTicketService,
} = await import(
  "../../src/modules/tickets/ticket.service.js"
);

describe("Ticket Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create a ticket when the user belongs to the organization", async () => {
    mockGetTicketOrganizationMembership
      .mockResolvedValueOnce({ id: "membership-1", role: "MEMBER" })
      .mockResolvedValueOnce({ id: "membership-2", role: "AGENT" });
    mockCreateTicket.mockResolvedValue({
      id: "ticket-1",
      title: "Login issue",
      assignedToId: "user-2",
    });

    const result = await createTicketService(
      {
        organizationId: "org-1",
        title: "Login issue",
        assignedToId: "user-2",
      },
      "user-1",
    );

    expect(mockCreateTicket).toHaveBeenCalledWith({
      organizationId: "org-1",
      title: "Login issue",
      assignedToId: "user-2",
      createdById: "user-1",
    });
    expect(mockEventBusEmit).toHaveBeenCalledWith("ticket.created", {
      ticketId: "ticket-1",
      organizationId: undefined,
      actorId: "user-1",
      metadata: {
        title: "Login issue",
      },
    });
    expect(result).toEqual({
      id: "ticket-1",
      title: "Login issue",
      assignedToId: "user-2",
    });
  });

  it("should auto-assign a newly created ticket to the least-loaded agent", async () => {
    mockGetTicketOrganizationMembership.mockResolvedValue({
      id: "membership-1",
      role: "MEMBER",
    });
    mockCreateTicket.mockResolvedValue({
      id: "ticket-1",
      organizationId: "org-1",
      title: "Login issue",
      assignedToId: null,
    });
    mockGetOrganizationAvailableAgents.mockResolvedValue([
      {
        userId: "agent-1",
        maxTicketsPerDay: 10,
        maxTicketsPerWeek: 50,
      },
      {
        userId: "agent-2",
        maxTicketsPerDay: 10,
        maxTicketsPerWeek: 50,
      },
    ]);
    mockGetOrganizationAgentWorkloads.mockResolvedValue([
      {
        userId: "agent-1",
        assignedToday: 2,
        assignedThisWeek: 5,
        lastDailyReset: new Date(),
        lastWeeklyReset: new Date(),
      },
      {
        userId: "agent-2",
        assignedToday: 1,
        assignedThisWeek: 4,
        lastDailyReset: new Date(),
        lastWeeklyReset: new Date(),
      },
    ]);
    mockAutoAssignTicket.mockResolvedValue({
      id: "ticket-1",
      organizationId: "org-1",
      title: "Login issue",
      assignedToId: "agent-2",
      status: "IN_PROGRESS",
    });

    const result = await createTicketService(
      {
        organizationId: "org-1",
        title: "Login issue",
      },
      "user-1",
    );

    expect(mockAutoAssignTicket).toHaveBeenCalledWith(
      "ticket-1",
      "org-1",
      "agent-2",
    );
    expect(result.assignedToId).toBe("agent-2");
  });

  it("should respect per-agent workload limits during auto-assignment", async () => {
    mockGetTicketOrganizationMembership.mockResolvedValue({
      id: "membership-1",
      role: "MEMBER",
    });
    mockCreateTicket.mockResolvedValue({
      id: "ticket-1",
      organizationId: "org-1",
      title: "Login issue",
      assignedToId: null,
    });
    mockGetOrganizationAvailableAgents.mockResolvedValue([
      {
        userId: "agent-1",
        maxTicketsPerDay: 1,
        maxTicketsPerWeek: 50,
      },
      {
        userId: "agent-2",
        maxTicketsPerDay: 10,
        maxTicketsPerWeek: 50,
      },
    ]);
    mockGetOrganizationAgentWorkloads.mockResolvedValue([
      {
        userId: "agent-1",
        assignedToday: 1,
        assignedThisWeek: 3,
        lastDailyReset: new Date(),
        lastWeeklyReset: new Date(),
      },
      {
        userId: "agent-2",
        assignedToday: 0,
        assignedThisWeek: 2,
        lastDailyReset: new Date(),
        lastWeeklyReset: new Date(),
      },
    ]);
    mockAutoAssignTicket.mockResolvedValue({
      id: "ticket-1",
      organizationId: "org-1",
      title: "Login issue",
      assignedToId: "agent-2",
    });

    const result = await createTicketService(
      {
        organizationId: "org-1",
        title: "Login issue",
      },
      "user-1",
    );

    expect(mockGetOrganizationAvailableAgents).toHaveBeenCalledWith("org-1");
    expect(result.assignedToId).toBe("agent-2");
  });

  it("should leave the ticket unassigned when no agent has capacity", async () => {
    mockGetTicketOrganizationMembership.mockResolvedValue({
      id: "membership-1",
      role: "MEMBER",
    });
    mockCreateTicket.mockResolvedValue({
      id: "ticket-1",
      organizationId: "org-1",
      title: "Login issue",
      assignedToId: null,
    });
    mockGetOrganizationAvailableAgents.mockResolvedValue([
      {
        userId: "agent-1",
        maxTicketsPerDay: 1,
        maxTicketsPerWeek: 1,
      },
    ]);
    mockGetOrganizationAgentWorkloads.mockResolvedValue([
      {
        userId: "agent-1",
        assignedToday: 1,
        assignedThisWeek: 1,
        lastDailyReset: new Date(),
        lastWeeklyReset: new Date(),
      },
    ]);

    const result = await createTicketService(
      {
        organizationId: "org-1",
        title: "Login issue",
      },
      "user-1",
    );

    expect(mockAutoAssignTicket).not.toHaveBeenCalled();
    expect(result.assignedToId).toBeNull();
  });

  it("should ignore stale workload counters from a previous period", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 8);

    mockGetTicketOrganizationMembership.mockResolvedValue({
      id: "membership-1",
      role: "MEMBER",
    });
    mockCreateTicket.mockResolvedValue({
      id: "ticket-1",
      organizationId: "org-1",
      title: "Login issue",
      assignedToId: null,
    });
    mockGetOrganizationAvailableAgents.mockResolvedValue([
      {
        userId: "agent-1",
        maxTicketsPerDay: 1,
        maxTicketsPerWeek: 1,
      },
    ]);
    mockGetOrganizationAgentWorkloads.mockResolvedValue([
      {
        userId: "agent-1",
        assignedToday: 10,
        assignedThisWeek: 10,
        lastDailyReset: yesterday,
        lastWeeklyReset: lastWeek,
      },
    ]);
    mockAutoAssignTicket.mockResolvedValue({
      id: "ticket-1",
      organizationId: "org-1",
      assignedToId: "agent-1",
    });

    const result = await createTicketService(
      {
        organizationId: "org-1",
        title: "Login issue",
      },
      "user-1",
    );

    expect(mockAutoAssignTicket).toHaveBeenCalledWith(
      "ticket-1",
      "org-1",
      "agent-1",
    );
    expect(result.assignedToId).toBe("agent-1");
  });

  it("should reject users outside the organization", async () => {
    mockGetTicketOrganizationMembership.mockResolvedValue(null);

    await expect(
      createTicketService(
        {
          organizationId: "org-1",
          title: "Login issue",
        },
        "user-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You do not have permission to create tickets for this organization",
    });
  });

  it("should reject assignees outside the organization", async () => {
    mockGetTicketOrganizationMembership
      .mockResolvedValueOnce({ id: "membership-1", role: "OWNER" })
      .mockResolvedValueOnce(null);

    await expect(
      createTicketService(
        {
          organizationId: "org-1",
          title: "Login issue",
          assignedToId: "user-2",
        },
        "user-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Assigned user must be a member of the organization",
    });
  });

  it("should throw when the ticket is not created", async () => {
    mockGetTicketOrganizationMembership.mockResolvedValue({
      id: "membership-1",
      role: "MEMBER",
    });
    mockCreateTicket.mockResolvedValue(null);

    await expect(
      createTicketService(
        {
          organizationId: "org-1",
          title: "Login issue",
        },
        "user-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Failed to create ticket",
    });
  });

  describe("getTicketsService", () => {
    it("should return all matching tickets for elevated roles", async () => {
      const tickets = [{ id: "ticket-1" }, { id: "ticket-2" }];
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockGetTickets.mockResolvedValue(tickets);

      const result = await getTicketsService(
        {
          organizationId: "org-1",
          status: "open",
          priority: "high",
        },
        "user-1",
      );

      expect(mockGetTickets).toHaveBeenCalledWith({
        organizationId: "org-1",
        status: "OPEN",
        priority: "HIGH",
      });
      expect(result).toEqual(tickets);
    });

    it("should restrict members to their created or assigned tickets", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockGetTickets.mockResolvedValue([{ id: "ticket-1" }]);

      await getTicketsService(
        {
          organizationId: "org-1",
        },
        "user-1",
      );

      expect(mockGetTickets).toHaveBeenCalledWith({
        organizationId: "org-1",
        OR: [{ createdById: "user-1" }, { assignedToId: "user-1" }],
      });
    });

    it("should support assignedTo=me filter", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockGetTickets.mockResolvedValue([{ id: "ticket-1" }]);

      await getTicketsService(
        {
          organizationId: "org-1",
          assignedTo: "me",
        },
        "user-1",
      );

      expect(mockGetTickets).toHaveBeenCalledWith({
        organizationId: "org-1",
        assignedToId: "user-1",
      });
    });

    it("should support tag and date range filters", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "OWNER",
      });
      mockGetTickets.mockResolvedValue([{ id: "ticket-1" }]);

      await getTicketsService(
        {
          organizationId: "org-1",
          tag: "Bug",
          dateFrom: "2026-03-01T00:00:00.000Z",
          dateTo: "2026-03-31T23:59:59.999Z",
        },
        "user-1",
      );

      expect(mockGetTickets).toHaveBeenCalledWith({
        organizationId: "org-1",
        tags: {
          some: {
            tag: {
              name: "Bug",
            },
          },
        },
        createdAt: {
          gte: new Date("2026-03-01T00:00:00.000Z"),
          lte: new Date("2026-03-31T23:59:59.999Z"),
        },
      });
    });

    it("should reject missing organizationId", async () => {
      await expect(getTicketsService({}, "user-1")).rejects.toMatchObject({
        statusCode: 400,
        message: "Organization ID is required",
      });
    });

    it("should reject invalid status", async () => {
      await expect(
        getTicketsService(
          {
            organizationId: "org-1",
            status: "pending",
          },
          "user-1",
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid status",
      });
    });

    it("should reject non-members from viewing tickets", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue(null);

      await expect(
        getTicketsService(
          {
            organizationId: "org-1",
          },
          "user-1",
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view tickets for this organization",
      });
    });

    it("should return an empty array when no tickets are found", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockGetTickets.mockResolvedValue(null);

      const result = await getTicketsService(
        {
          organizationId: "org-1",
        },
        "user-1",
      );

      expect(result).toEqual([]);
    });

    it("should reject invalid date ranges", async () => {
      await expect(
        getTicketsService(
          {
            organizationId: "org-1",
            dateFrom: "2026-03-10T00:00:00.000Z",
            dateTo: "2026-03-01T00:00:00.000Z",
          },
          "user-1",
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "dateFrom cannot be after dateTo",
      });
    });
  });

  describe("getMyAgentTicketsService", () => {
    it("should return assigned tickets for staff memberships", async () => {
      mockGetTicketMembershipsByUserId.mockResolvedValue([
        { organizationId: "org-1", role: "AGENT" },
      ]);
      mockGetAgentTickets.mockResolvedValue([{ id: "ticket-1" }]);

      const result = await getMyAgentTicketsService(
        { status: "open" },
        "user-1",
      );

      expect(mockGetAgentTickets).toHaveBeenCalledWith({
        organizationId: { in: ["org-1"] },
        status: "OPEN",
        assignedToId: "user-1",
      });
      expect(result).toEqual([{ id: "ticket-1" }]);
    });

    it("should reject users without staff memberships", async () => {
      mockGetTicketMembershipsByUserId.mockResolvedValue([
        { organizationId: "org-1", role: "MEMBER" },
      ]);

      await expect(
        getMyAgentTicketsService({}, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view assigned agent tickets",
      });
    });
  });

  describe("getMyAgentStatsService", () => {
    it("should return assigned ticket stats", async () => {
      mockGetTicketMembershipsByUserId.mockResolvedValue([
        { organizationId: "org-1", role: "AGENT" },
      ]);
      mockGetAgentTickets.mockResolvedValue([
        { id: "ticket-1", status: "OPEN", priority: "HIGH" },
        { id: "ticket-2", status: "RESOLVED", priority: "LOW" },
      ]);

      const result = await getMyAgentStatsService({}, "user-1");

      expect(result).toEqual({
        totalAssigned: 2,
        byStatus: {
          OPEN: 1,
          IN_PROGRESS: 0,
          RESOLVED: 1,
          CLOSED: 0,
        },
        byPriority: {
          LOW: 1,
          MEDIUM: 0,
          HIGH: 1,
          URGENT: 0,
        },
      });
    });
  });

  describe("updateMyAgentAvailabilityService", () => {
    it("should update availability for an agent membership", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockUpdateAgentAvailability.mockResolvedValue({
        id: "membership-1",
        organizationId: "org-1",
        userId: "user-1",
        role: "AGENT",
        isAvailable: false,
      });

      const result = await updateMyAgentAvailabilityService(
        "org-1",
        false,
        "user-1",
      );

      expect(mockUpdateAgentAvailability).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        false,
      );
      expect(result.isAvailable).toBe(false);
    });

    it("should reject non-members from updating availability", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue(null);

      await expect(
        updateMyAgentAvailabilityService("org-1", false, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message:
          "You do not have permission to update agent availability for this organization",
      });
    });

    it("should reject non-agents from updating availability", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        updateMyAgentAvailabilityService("org-1", false, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "Only agents can update their availability",
      });
    });

    it("should throw when availability update fails", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockUpdateAgentAvailability.mockResolvedValue(null);

      await expect(
        updateMyAgentAvailabilityService("org-1", false, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed to update agent availability",
      });
    });
  });

  describe("createTagService", () => {
    it("should allow elevated roles to create tags", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "ADMIN",
      });
      mockGetTagByName.mockResolvedValue(null);
      mockCreateTag.mockResolvedValue({
        id: "tag-1",
        organizationId: "org-1",
        name: "Bug",
      });

      const result = await createTagService(
        { organizationId: "org-1", name: " Bug " },
        "user-1",
      );

      expect(mockCreateTag).toHaveBeenCalledWith({
        organizationId: "org-1",
        name: "Bug",
      });
      expect(result.id).toBe("tag-1");
    });

    it("should reject non-staff from creating tags", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        createTagService({ organizationId: "org-1", name: "Bug" }, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to create tags",
      });
    });

    it("should reject duplicate tags in the same organization", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "OWNER",
      });
      mockGetTagByName.mockResolvedValue({
        id: "tag-1",
      });

      await expect(
        createTagService({ organizationId: "org-1", name: "Bug" }, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Tag already exists in this organization",
      });
    });
  });

  describe("getTagsService", () => {
    it("should return tags for organization members", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockGetTags.mockResolvedValue([{ id: "tag-1", name: "Bug" }]);

      const result = await getTagsService("org-1", "user-1");

      expect(mockGetTags).toHaveBeenCalledWith("org-1");
      expect(result).toEqual([{ id: "tag-1", name: "Bug" }]);
    });

    it("should reject non-members from viewing tags", async () => {
      mockGetTicketOrganizationMembership.mockResolvedValue(null);

      await expect(getTagsService("org-1", "user-1")).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view tags",
      });
    });
  });

  describe("getTicketByIdService", () => {
    it("should return a ticket for elevated roles", async () => {
      const ticket = {
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      };
      mockGetTicketById.mockResolvedValue(ticket);
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });

      const result = await getTicketByIdService("ticket-1", "user-1");

      expect(mockGetTicketById).toHaveBeenCalledWith("ticket-1");
      expect(result).toEqual(ticket);
    });

    it("should reject when the ticket is not found", async () => {
      mockGetTicketById.mockResolvedValue(null);

      await expect(getTicketByIdService("ticket-1", "user-1")).rejects.toMatchObject({
        statusCode: 404,
        message: "Ticket not found",
      });
    });

    it("should reject users outside the organization from viewing a ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue(null);

      await expect(getTicketByIdService("ticket-1", "user-1")).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view this ticket",
      });
    });

    it("should reject members who neither created nor were assigned the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(getTicketByIdService("ticket-1", "user-1")).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view this ticket",
      });
    });

    it("should hide internal comments from members who can view the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
        comments: [
          { id: "comment-1", isInternal: false },
          { id: "comment-2", isInternal: true },
        ],
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      const result = await getTicketByIdService("ticket-1", "user-1");

      expect(result.comments).toEqual([{ id: "comment-1", isInternal: false }]);
    });
  });

  describe("updateTicketService", () => {
    it("should allow elevated roles to update any ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "ADMIN",
      });
      mockUpdateTicket.mockResolvedValue({
        id: "ticket-1",
        title: "Updated title",
      });

      const result = await updateTicketService(
        "ticket-1",
        { status: "resolved", assignedToId: "user-2" },
        "user-1",
      );

      expect(mockUpdateTicket).toHaveBeenCalledWith(
        "ticket-1",
        { status: "RESOLVED", assignedToId: "user-2" },
        "user-1",
      );
      expect(result).toEqual({ id: "ticket-1", title: "Updated title" });
    });

    it("should allow members to update limited fields on their own tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockUpdateTicket.mockResolvedValue({
        id: "ticket-1",
        title: "Updated title",
      });

      await updateTicketService("ticket-1", { priority: "high" }, "user-1");

      expect(mockUpdateTicket).toHaveBeenCalledWith(
        "ticket-1",
        { priority: "HIGH" },
        "user-1",
      );
    });

    it("should reject members updating tickets they do not own", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        updateTicketService("ticket-1", { title: "Updated" }, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to update this ticket",
      });
    });

    it("should reject members changing restricted fields", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        updateTicketService("ticket-1", { status: "CLOSED" }, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message:
          "Members can only update title, description, and priority on their own tickets",
      });
    });

    it("should reject when the ticket is not found", async () => {
      mockGetTicketById.mockResolvedValue(null);

      await expect(
        updateTicketService("ticket-1", { title: "Updated" }, "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Ticket not found",
      });
    });
  });

  describe("assignTicketService", () => {
    it("should allow elevated roles to assign tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        assignedToId: "user-2",
      });
      mockGetTicketOrganizationMembership
        .mockResolvedValueOnce({ id: "membership-1", role: "AGENT" })
        .mockResolvedValueOnce({ id: "membership-2", role: "MEMBER" });
      mockAssignTicket.mockResolvedValue({
        id: "ticket-1",
        assignedToId: "user-3",
      });

      const result = await assignTicketService("ticket-1", "user-3", "user-1");

      expect(mockAssignTicket).toHaveBeenCalledWith(
        "ticket-1",
        "user-3",
        "user-1",
        "user-2",
      );
      expect(mockEventBusEmit).toHaveBeenCalledWith("ticket.assigned", {
        ticketId: "ticket-1",
        organizationId: undefined,
        actorId: "user-1",
        metadata: {
          previousAssignedToId: "user-2",
          assignedToId: "user-3",
        },
      });
      expect(result).toEqual({
        id: "ticket-1",
        assignedToId: "user-3",
      });
    });

    it("should reject missing tickets", async () => {
      mockGetTicketById.mockResolvedValue(null);

      await expect(
        assignTicketService("ticket-1", "user-2", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Ticket not found",
      });
    });

    it("should reject members from assigning tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        assignTicketService("ticket-1", "user-2", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to assign this ticket",
      });
    });

    it("should reject assignees outside the organization", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership
        .mockResolvedValueOnce({ id: "membership-1", role: "ADMIN" })
        .mockResolvedValueOnce(null);

      await expect(
        assignTicketService("ticket-1", "user-3", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Assigned user must be a member of the organization",
      });
    });

    it("should throw when assignment fails", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership
        .mockResolvedValueOnce({ id: "membership-1", role: "OWNER" })
        .mockResolvedValueOnce({ id: "membership-2", role: "AGENT" });
      mockAssignTicket.mockResolvedValue(null);

      await expect(
        assignTicketService("ticket-1", "user-2", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed to assign ticket",
      });
    });
  });

  describe("autoAssignTicketService", () => {
    it("should auto-assign a ticket for staff users", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockGetOrganizationAvailableAgents.mockResolvedValue([
        {
          userId: "agent-1",
          maxTicketsPerDay: 10,
          maxTicketsPerWeek: 50,
        },
        {
          userId: "agent-2",
          maxTicketsPerDay: 10,
          maxTicketsPerWeek: 50,
        },
      ]);
      mockGetOrganizationAgentWorkloads.mockResolvedValue([
        {
          userId: "agent-1",
          assignedToday: 1,
          assignedThisWeek: 3,
          lastDailyReset: new Date(),
          lastWeeklyReset: new Date(),
        },
        {
          userId: "agent-2",
          assignedToday: 0,
          assignedThisWeek: 2,
          lastDailyReset: new Date(),
          lastWeeklyReset: new Date(),
        },
      ]);
      mockAutoAssignTicket.mockResolvedValue({
        id: "ticket-1",
        assignedToId: "agent-2",
        status: "IN_PROGRESS",
      });

      const result = await autoAssignTicketService("ticket-1", "user-1");

      expect(mockAutoAssignTicket).toHaveBeenCalledWith(
        "ticket-1",
        "org-1",
        "agent-2",
      );
      expect(result.assignedToId).toBe("agent-2");
    });

    it("should reject when the ticket does not exist", async () => {
      mockGetTicketById.mockResolvedValue(null);

      await expect(
        autoAssignTicketService("ticket-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Ticket not found",
      });
    });

    it("should reject members from auto-assigning tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        autoAssignTicketService("ticket-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to auto-assign this ticket",
      });
    });

    it("should reject when no available agent can take the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "ADMIN",
      });
      mockGetOrganizationAvailableAgents.mockResolvedValue([]);
      mockGetOrganizationAgentWorkloads.mockResolvedValue([]);

      await expect(
        autoAssignTicketService("ticket-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "No available agent found for auto-assignment",
      });
    });

    it("should throw when auto-assignment persistence fails", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        assignedToId: "agent-0",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "OWNER",
      });
      mockGetOrganizationAvailableAgents.mockResolvedValue([
        {
          userId: "agent-2",
          maxTicketsPerDay: 10,
          maxTicketsPerWeek: 50,
        },
      ]);
      mockGetOrganizationAgentWorkloads.mockResolvedValue([]);
      mockAutoAssignTicket.mockResolvedValue(null);

      await expect(
        autoAssignTicketService("ticket-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed to auto-assign ticket",
      });
    });
  });

  describe("updateTicketStatusService", () => {
    it("should allow elevated roles to update ticket status", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        status: "OPEN",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "ADMIN",
      });
      mockUpdateTicketStatus.mockResolvedValue({
        id: "ticket-1",
        status: "RESOLVED",
      });

      const result = await updateTicketStatusService(
        "ticket-1",
        "resolved",
        "user-1",
      );

      expect(mockUpdateTicketStatus).toHaveBeenCalledWith(
        "ticket-1",
        "RESOLVED",
        "user-1",
        "OPEN",
      );
      expect(mockEventBusEmit).toHaveBeenCalledWith("ticket.status.changed", {
        ticketId: "ticket-1",
        organizationId: undefined,
        actorId: "user-1",
        metadata: {
          previousStatus: "OPEN",
          status: "RESOLVED",
        },
      });
      expect(result).toEqual({
        id: "ticket-1",
        status: "RESOLVED",
      });
    });

    it("should reject missing tickets", async () => {
      mockGetTicketById.mockResolvedValue(null);

      await expect(
        updateTicketStatusService("ticket-1", "OPEN", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Ticket not found",
      });
    });

    it("should reject members from updating ticket status", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        status: "OPEN",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        updateTicketStatusService("ticket-1", "RESOLVED", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to update this ticket status",
      });
    });

    it("should throw when status update fails", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        status: "OPEN",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "OWNER",
      });
      mockUpdateTicketStatus.mockResolvedValue(null);

      await expect(
        updateTicketStatusService("ticket-1", "RESOLVED", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed to update ticket status",
      });
    });
  });

  describe("createTicketCommentService", () => {
    it("should allow elevated roles to create internal comments", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockCreateTicketComment.mockResolvedValue({
        id: "comment-1",
        message: "Internal note",
        isInternal: true,
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await createTicketCommentService(
        "ticket-1",
        { message: "Internal note", isInternal: true },
        "user-1",
      );

      expect(mockCreateTicketComment).toHaveBeenCalledWith("ticket-1", {
        authorId: "user-1",
        message: "Internal note",
        isInternal: true,
      });
      expect(result).toEqual({
        id: "comment-1",
        message: "Internal note",
        isInternal: true,
      });
    });

    it("should allow members to comment on their own tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockCreateTicketComment.mockResolvedValue({
        id: "comment-1",
        message: "Public reply",
        isInternal: false,
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await createTicketCommentService(
        "ticket-1",
        { message: "Public reply" },
        "user-1",
      );

      expect(result.message).toBe("Public reply");
    });

    it("should reject members creating internal comments", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        createTicketCommentService(
          "ticket-1",
          { message: "Hidden", isInternal: true },
          "user-1",
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to create internal comments",
      });
    });

    it("should reject users who cannot access the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        createTicketCommentService(
          "ticket-1",
          { message: "Blocked" },
          "user-1",
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to comment on this ticket",
      });
    });
  });

  describe("getTicketCommentsService", () => {
    it("should return all comments for elevated roles", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockGetTicketComments.mockResolvedValue([
        { id: "comment-1", isInternal: false },
        { id: "comment-2", isInternal: true },
      ]);

      const result = await getTicketCommentsService("ticket-1", "user-1");

      expect(result).toHaveLength(2);
    });

    it("should hide internal comments from members", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockGetTicketComments.mockResolvedValue([
        { id: "comment-1", isInternal: false },
        { id: "comment-2", isInternal: true },
      ]);

      const result = await getTicketCommentsService("ticket-1", "user-1");

      expect(result).toEqual([{ id: "comment-1", isInternal: false }]);
    });

    it("should reject unrelated members from viewing comments", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(getTicketCommentsService("ticket-1", "user-1")).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view comments on this ticket",
      });
    });
  });

  describe("getTicketActivitiesService", () => {
    it("should return activities for elevated roles", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockGetTicketActivities.mockResolvedValue([{ id: "activity-1" }]);

      const result = await getTicketActivitiesService("ticket-1", "user-1");

      expect(mockGetTicketActivities).toHaveBeenCalledWith("ticket-1");
      expect(result).toEqual([{ id: "activity-1" }]);
    });

    it("should allow members to view activity on accessible tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockGetTicketActivities.mockResolvedValue([{ id: "activity-1" }]);

      const result = await getTicketActivitiesService("ticket-1", "user-1");

      expect(result).toEqual([{ id: "activity-1" }]);
    });

    it("should reject unrelated members from viewing activity", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        getTicketActivitiesService("ticket-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view activity on this ticket",
      });
    });
  });

  describe("createTicketAttachmentService", () => {
    it("should allow elevated roles to add attachments", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockCreateTicketAttachment.mockResolvedValue({
        id: "attachment-1",
        fileUrl: "https://example.com/file.pdf",
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await createTicketAttachmentService(
        "ticket-1",
        {
          fileUrl: "https://example.com/file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        },
        "user-1",
      );

      expect(mockCreateTicketAttachment).toHaveBeenCalledWith("ticket-1", {
        uploadedBy: "user-1",
        fileUrl: "https://example.com/file.pdf",
        fileType: "application/pdf",
        fileSize: 1024,
      });
      expect(result).toEqual({
        id: "attachment-1",
        fileUrl: "https://example.com/file.pdf",
      });
    });

    it("should allow members to add attachments to their own tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockCreateTicketAttachment.mockResolvedValue({
        id: "attachment-1",
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      await createTicketAttachmentService(
        "ticket-1",
        {
          fileUrl: "https://example.com/file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        },
        "user-1",
      );

      expect(mockCreateTicketAttachment).toHaveBeenCalled();
    });

    it("should reject unrelated members from adding attachments", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        createTicketAttachmentService(
          "ticket-1",
          {
            fileUrl: "https://example.com/file.pdf",
            fileType: "application/pdf",
            fileSize: 1024,
          },
          "user-1",
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to add attachments to this ticket",
      });
    });
  });

  describe("deleteTicketCommentService", () => {
    it("should allow elevated roles to delete any comment on the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketCommentById.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-1",
        authorId: "user-7",
        message: "Internal note",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockDeleteTicketComment.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-1",
        authorId: "user-7",
        message: "Internal note",
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await deleteTicketCommentService(
        "ticket-1",
        "comment-1",
        "user-1",
      );

      expect(mockDeleteTicketComment).toHaveBeenCalledWith("comment-1");
      expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-1", {
        actorId: "user-1",
        action: "COMMENT_DELETED",
        oldValue: "Internal note",
      });
      expect(result.id).toBe("comment-1");
    });

    it("should allow members to delete their own comments on accessible tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketCommentById.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-1",
        authorId: "user-1",
        message: "Own comment",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockDeleteTicketComment.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-1",
        authorId: "user-1",
        message: "Own comment",
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await deleteTicketCommentService(
        "ticket-1",
        "comment-1",
        "user-1",
      );

      expect(result.message).toBe("Own comment");
    });

    it("should reject when the ticket does not exist", async () => {
      mockGetTicketById.mockResolvedValue(null);

      await expect(
        deleteTicketCommentService("ticket-1", "comment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Ticket not found",
      });
    });

    it("should reject when the comment does not exist for the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketCommentById.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-2",
      });

      await expect(
        deleteTicketCommentService("ticket-1", "comment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Comment not found",
      });
    });

    it("should reject users outside the organization", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketCommentById.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-1",
        authorId: "user-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue(null);

      await expect(
        deleteTicketCommentService("ticket-1", "comment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to delete comments on this ticket",
      });
    });

    it("should reject members deleting another user's comment", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketCommentById.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-1",
        authorId: "user-2",
        message: "Other comment",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        deleteTicketCommentService("ticket-1", "comment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to delete this comment",
      });
    });

    it("should reject unrelated members even for their own comment", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketCommentById.mockResolvedValue({
        id: "comment-1",
        ticketId: "ticket-1",
        authorId: "user-1",
        message: "Own but inaccessible",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        deleteTicketCommentService("ticket-1", "comment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to delete this comment",
      });
    });
  });

  describe("getTicketAttachmentsService", () => {
    it("should return attachments for elevated roles", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "ADMIN",
      });
      mockGetTicketAttachments.mockResolvedValue([{ id: "attachment-1" }]);

      const result = await getTicketAttachmentsService("ticket-1", "user-1");

      expect(result).toEqual([{ id: "attachment-1" }]);
    });

    it("should allow members to view attachments on accessible tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockGetTicketAttachments.mockResolvedValue([{ id: "attachment-1" }]);

      const result = await getTicketAttachmentsService("ticket-1", "user-1");

      expect(result).toEqual([{ id: "attachment-1" }]);
    });

    it("should reject unrelated members from viewing attachments", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(getTicketAttachmentsService("ticket-1", "user-1")).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to view attachments on this ticket",
      });
    });
  });

  describe("deleteTicketAttachmentService", () => {
    it("should allow elevated roles to delete any attachment on the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-9",
        assignedToId: "user-8",
      });
      mockGetTicketAttachmentById.mockResolvedValue({
        id: "attachment-1",
        ticketId: "ticket-1",
        uploadedBy: "user-7",
        fileUrl: "https://example.com/file.pdf",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockDeleteTicketAttachment.mockResolvedValue({
        id: "attachment-1",
        ticketId: "ticket-1",
        uploadedBy: "user-7",
        fileUrl: "https://example.com/file.pdf",
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await deleteTicketAttachmentService(
        "ticket-1",
        "attachment-1",
        "user-1",
      );

      expect(mockDeleteTicketAttachment).toHaveBeenCalledWith("attachment-1");
      expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-1", {
        actorId: "user-1",
        action: "ATTACHMENT_DELETED",
        oldValue: "https://example.com/file.pdf",
      });
      expect(result.id).toBe("attachment-1");
    });

    it("should allow members to delete their own attachments on accessible tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketAttachmentById.mockResolvedValue({
        id: "attachment-1",
        ticketId: "ticket-1",
        uploadedBy: "user-1",
        fileUrl: "https://example.com/file.pdf",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });
      mockDeleteTicketAttachment.mockResolvedValue({
        id: "attachment-1",
        ticketId: "ticket-1",
        uploadedBy: "user-1",
        fileUrl: "https://example.com/file.pdf",
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await deleteTicketAttachmentService(
        "ticket-1",
        "attachment-1",
        "user-1",
      );

      expect(result.fileUrl).toBe("https://example.com/file.pdf");
    });

    it("should reject when the ticket does not exist", async () => {
      mockGetTicketById.mockResolvedValue(null);

      await expect(
        deleteTicketAttachmentService("ticket-1", "attachment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Ticket not found",
      });
    });

    it("should reject when the attachment does not exist for the ticket", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketAttachmentById.mockResolvedValue({
        id: "attachment-1",
        ticketId: "ticket-2",
      });

      await expect(
        deleteTicketAttachmentService("ticket-1", "attachment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Attachment not found",
      });
    });

    it("should reject users outside the organization", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketAttachmentById.mockResolvedValue({
        id: "attachment-1",
        ticketId: "ticket-1",
        uploadedBy: "user-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue(null);

      await expect(
        deleteTicketAttachmentService("ticket-1", "attachment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to delete attachments on this ticket",
      });
    });

    it("should reject members deleting another user's attachment", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: null,
      });
      mockGetTicketAttachmentById.mockResolvedValue({
        id: "attachment-1",
        ticketId: "ticket-1",
        uploadedBy: "user-2",
        fileUrl: "https://example.com/file.pdf",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        deleteTicketAttachmentService("ticket-1", "attachment-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to delete this attachment",
      });
    });
  });

  describe("addTicketTagService", () => {
    it("should allow elevated roles to add tags to tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "AGENT",
      });
      mockGetTagById.mockResolvedValue({
        id: "tag-1",
        organizationId: "org-1",
      });
      mockGetTicketTagById.mockResolvedValue(null);
      mockAddTagToTicket.mockResolvedValue({
        ticketId: "ticket-1",
        tagId: "tag-1",
        tag: { name: "Bug" },
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await addTicketTagService("ticket-1", "tag-1", "user-1");

      expect(mockAddTagToTicket).toHaveBeenCalledWith("ticket-1", "tag-1");
      expect(result.tagId).toBe("tag-1");
    });

    it("should reject non-staff from tagging tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "MEMBER",
      });

      await expect(
        addTicketTagService("ticket-1", "tag-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to tag this ticket",
      });
    });

    it("should reject tags outside the ticket organization", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "OWNER",
      });
      mockGetTagById.mockResolvedValue({
        id: "tag-1",
        organizationId: "org-2",
      });

      await expect(
        addTicketTagService("ticket-1", "tag-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Tag not found",
      });
    });
  });

  describe("deleteTicketTagService", () => {
    it("should allow elevated roles to remove tags from tickets", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "ADMIN",
      });
      mockGetTicketTagById.mockResolvedValue({
        ticketId: "ticket-1",
        tagId: "tag-1",
        tag: { name: "Bug" },
      });
      mockDeleteTicketTag.mockResolvedValue({
        ticketId: "ticket-1",
        tagId: "tag-1",
        tag: { name: "Bug" },
      });
      mockCreateTicketActivityLog.mockResolvedValue({ id: "activity-1" });

      const result = await deleteTicketTagService("ticket-1", "tag-1", "user-1");

      expect(mockDeleteTicketTag).toHaveBeenCalledWith("ticket-1", "tag-1");
      expect(result.tagId).toBe("tag-1");
    });

    it("should reject missing ticket tags", async () => {
      mockGetTicketById.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
      });
      mockGetTicketOrganizationMembership.mockResolvedValue({
        id: "membership-1",
        role: "OWNER",
      });
      mockGetTicketTagById.mockResolvedValue(null);

      await expect(
        deleteTicketTagService("ticket-1", "tag-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Tag not found on this ticket",
      });
    });
  });
});
