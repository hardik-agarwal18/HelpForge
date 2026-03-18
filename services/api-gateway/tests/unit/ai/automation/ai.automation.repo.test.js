import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

const mockTicketFindUnique = jest.fn();
const mockTicketFindMany = jest.fn();
const mockTicketUpdate = jest.fn();

const mockTicketCommentFindMany = jest.fn();
const mockTicketCommentFindUnique = jest.fn();
const mockTicketCommentCreate = jest.fn();

const mockAgentWorkloadFindMany = jest.fn();
const mockAgentWorkloadFindUnique = jest.fn();

const mockMembershipFindMany = jest.fn();
const mockTransaction = jest.fn();

const mockPrisma = {
  ticket: {
    findUnique: mockTicketFindUnique,
    findMany: mockTicketFindMany,
    update: mockTicketUpdate,
  },
  ticketComment: {
    findMany: mockTicketCommentFindMany,
    findUnique: mockTicketCommentFindUnique,
    create: mockTicketCommentCreate,
  },
  agentWorkload: {
    findMany: mockAgentWorkloadFindMany,
    findUnique: mockAgentWorkloadFindUnique,
  },
  membership: {
    findMany: mockMembershipFindMany,
  },
  $transaction: mockTransaction,
};

jest.unstable_mockModule("../../../../src/config/logger.js", () => ({
  default: {
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

jest.unstable_mockModule("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const repo =
  await import("../../../../src/modules/ai/automation/ai.automation.repo.js");

describe("ai.automation.repo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("read operations", () => {
    it("gets ticket with comments and relations", async () => {
      const ticket = { id: "ticket-1" };
      mockTicketFindUnique.mockResolvedValue(ticket);

      const result = await repo.getTicketWithComments("ticket-1");

      expect(mockTicketFindUnique).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        include: {
          comments: {
            orderBy: { createdAt: "asc" },
          },
          createdBy: true,
          assignedTo: true,
          organization: true,
        },
      });
      expect(result).toBe(ticket);
    });

    it("gets ticket basic info", async () => {
      const ticket = { id: "ticket-2" };
      mockTicketFindUnique.mockResolvedValue(ticket);

      const result = await repo.getTicket("ticket-2");

      expect(mockTicketFindUnique).toHaveBeenCalledWith({
        where: { id: "ticket-2" },
      });
      expect(result).toBe(ticket);
    });

    it("gets ticket comments", async () => {
      const comments = [{ id: "comment-1" }];
      mockTicketCommentFindMany.mockResolvedValue(comments);

      const result = await repo.getTicketComments("ticket-3");

      expect(mockTicketCommentFindMany).toHaveBeenCalledWith({
        where: { ticketId: "ticket-3" },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(comments);
    });

    it("gets AI comments using default limit", async () => {
      const comments = [{ id: "comment-ai-1" }];
      mockTicketCommentFindMany.mockResolvedValue(comments);

      const result = await repo.getAIComments("ticket-4");

      expect(mockTicketCommentFindMany).toHaveBeenCalledWith({
        where: { ticketId: "ticket-4", authorType: "AI" },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      expect(result).toBe(comments);
    });

    it("gets AI comments using explicit limit", async () => {
      const comments = [{ id: "comment-ai-2" }];
      mockTicketCommentFindMany.mockResolvedValue(comments);

      const result = await repo.getAIComments("ticket-4", 3);

      expect(mockTicketCommentFindMany).toHaveBeenCalledWith({
        where: { ticketId: "ticket-4", authorType: "AI" },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      expect(result).toBe(comments);
    });

    it("gets one comment by id", async () => {
      const comment = { id: "comment-2" };
      mockTicketCommentFindUnique.mockResolvedValue(comment);

      const result = await repo.getComment("comment-2");

      expect(mockTicketCommentFindUnique).toHaveBeenCalledWith({
        where: { id: "comment-2" },
      });
      expect(result).toBe(comment);
    });

    it("gets available agents for organization", async () => {
      const agents = [{ user: { id: "agent-1" } }];
      mockAgentWorkloadFindMany.mockResolvedValue(agents);

      const result = await repo.getAvailableAgents("org-1");

      expect(mockAgentWorkloadFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          user: {
            memberships: {
              some: {
                isAvailable: true,
                role: { in: ["AGENT", "ADMIN"] },
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
      expect(result).toBe(agents);
    });

    it("gets agent workload", async () => {
      const workload = { userId: "agent-1", organizationId: "org-1" };
      mockAgentWorkloadFindUnique.mockResolvedValue(workload);

      const result = await repo.getAgentWorkload("agent-1", "org-1");

      expect(mockAgentWorkloadFindUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: "agent-1",
            organizationId: "org-1",
          },
        },
      });
      expect(result).toBe(workload);
    });

    it("gets tickets for agent since timestamp", async () => {
      const since = new Date("2026-01-01T00:00:00.000Z");
      const tickets = [{ id: "ticket-5" }];
      mockTicketFindMany.mockResolvedValue(tickets);

      const result = await repo.getAgentTickets("agent-2", since);

      expect(mockTicketFindMany).toHaveBeenCalledWith({
        where: {
          assignedToId: "agent-2",
          updatedAt: { gte: since },
        },
        include: {
          comments: true,
        },
      });
      expect(result).toBe(tickets);
    });

    it("gets organization tickets since timestamp", async () => {
      const since = new Date("2026-01-01T00:00:00.000Z");
      const tickets = [{ id: "ticket-6" }];
      mockTicketFindMany.mockResolvedValue(tickets);

      const result = await repo.getOrganizationTickets("org-2", since);

      expect(mockTicketFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-2",
          createdAt: { gte: since },
        },
        include: {
          comments: {
            where: { authorType: "AI" },
          },
        },
      });
      expect(result).toBe(tickets);
    });

    it("gets ticket AI metadata", async () => {
      const metadata = {
        id: "ticket-7",
        aiActive: true,
        aiMessageCount: 2,
        status: "OPEN",
        priority: "MEDIUM",
      };
      mockTicketFindUnique.mockResolvedValue(metadata);

      const result = await repo.getTicketAIMetadata("ticket-7");

      expect(mockTicketFindUnique).toHaveBeenCalledWith({
        where: { id: "ticket-7" },
        select: {
          id: true,
          aiActive: true,
          aiMessageCount: true,
          status: true,
          priority: true,
        },
      });
      expect(result).toBe(metadata);
    });

    it("gets organization members with agent roles", async () => {
      const members = [{ user: { id: "user-1" } }];
      mockMembershipFindMany.mockResolvedValue(members);

      const result = await repo.getOrganizationMembers("org-3");

      expect(mockMembershipFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-3",
          role: { in: ["AGENT", "ADMIN"] },
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
      expect(result).toBe(members);
    });

    it("gets all AI comments", async () => {
      const comments = [{ id: "comment-ai-3" }];
      mockTicketCommentFindMany.mockResolvedValue(comments);

      const result = await repo.getAllAIComments("ticket-8");

      expect(mockTicketCommentFindMany).toHaveBeenCalledWith({
        where: { ticketId: "ticket-8", authorType: "AI" },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(comments);
    });

    it("gets all user comments", async () => {
      const comments = [{ id: "comment-user-1" }];
      mockTicketCommentFindMany.mockResolvedValue(comments);

      const result = await repo.getUserComments("ticket-9");

      expect(mockTicketCommentFindMany).toHaveBeenCalledWith({
        where: { ticketId: "ticket-9", authorType: "USER" },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toBe(comments);
    });
  });

  describe("write operations", () => {
    it("creates comment with default values", async () => {
      const created = { id: "comment-created-1" };
      mockTicketCommentCreate.mockResolvedValue(created);

      const result = await repo.createComment({
        ticketId: "ticket-10",
        message: "hello",
      });

      expect(mockTicketCommentCreate).toHaveBeenCalledWith({
        data: {
          ticketId: "ticket-10",
          message: "hello",
          authorType: "USER",
          authorId: undefined,
          isInternal: false,
        },
      });
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        { commentId: "comment-created-1", ticketId: "ticket-10" },
        "Comment created",
      );
      expect(result).toBe(created);
    });

    it("creates comment with explicit author type and internal flag", async () => {
      const created = { id: "comment-created-2" };
      mockTicketCommentCreate.mockResolvedValue(created);

      await repo.createComment({
        ticketId: "ticket-11",
        message: "internal note",
        authorType: "AI",
        authorId: "ai-1",
        isInternal: true,
      });

      expect(mockTicketCommentCreate).toHaveBeenCalledWith({
        data: {
          ticketId: "ticket-11",
          message: "internal note",
          authorType: "AI",
          authorId: "ai-1",
          isInternal: true,
        },
      });
    });

    it("updates ticket and logs update keys", async () => {
      const updated = { id: "ticket-12", status: "IN_PROGRESS" };
      mockTicketUpdate.mockResolvedValue(updated);

      const result = await repo.updateTicket("ticket-12", {
        status: "IN_PROGRESS",
        assignedToId: "agent-7",
      });

      expect(mockTicketUpdate).toHaveBeenCalledWith({
        where: { id: "ticket-12" },
        data: {
          status: "IN_PROGRESS",
          assignedToId: "agent-7",
        },
      });
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        { ticketId: "ticket-12", updates: ["status", "assignedToId"] },
        "Ticket updated",
      );
      expect(result).toBe(updated);
    });

    it("increments AI message count", async () => {
      const updated = { id: "ticket-13", aiMessageCount: 3 };
      mockTicketUpdate.mockResolvedValue(updated);

      const result = await repo.incrementAIMessageCount("ticket-13");

      expect(mockTicketUpdate).toHaveBeenCalledWith({
        where: { id: "ticket-13" },
        data: {
          aiMessageCount: {
            increment: 1,
          },
        },
      });
      expect(result).toBe(updated);
    });

    it("bulk updates tickets and returns count", async () => {
      mockTicketUpdate.mockResolvedValue({});
      const updates = [
        { id: "ticket-14", data: { status: "IN_PROGRESS" } },
        { id: "ticket-15", data: { status: "RESOLVED" } },
      ];

      const result = await repo.bulkUpdateTickets(updates);

      expect(mockTicketUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: "ticket-14" },
        data: { status: "IN_PROGRESS" },
      });
      expect(mockTicketUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: "ticket-15" },
        data: { status: "RESOLVED" },
      });
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        { updateCount: 2 },
        "Bulk updated tickets",
      );
      expect(result).toBe(2);
    });

    it("returns zero count for empty bulk updates", async () => {
      const result = await repo.bulkUpdateTickets([]);

      expect(mockTicketUpdate).not.toHaveBeenCalled();
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        { updateCount: 0 },
        "Bulk updated tickets",
      );
      expect(result).toBe(0);
    });

    it("runs callback inside prisma transaction", async () => {
      mockTransaction.mockImplementation(async (callback) =>
        callback({ tx: true }),
      );

      const result = await repo.transaction(async (tx) => {
        expect(tx).toEqual({ tx: true });
        return "ok";
      });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(result).toBe("ok");
    });
  });

  describe("error handling", () => {
    const sampleError = new Error("db-failure");

    it("logs and rethrows for getTicketWithComments", async () => {
      mockTicketFindUnique.mockRejectedValue(sampleError);

      await expect(repo.getTicketWithComments("ticket-e1")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e1" },
        "Error fetching ticket with comments",
      );
    });

    it("logs and rethrows for getTicket", async () => {
      mockTicketFindUnique.mockRejectedValue(sampleError);

      await expect(repo.getTicket("ticket-e2")).rejects.toThrow(sampleError);
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e2" },
        "Error fetching ticket",
      );
    });

    it("logs and rethrows for getTicketComments", async () => {
      mockTicketCommentFindMany.mockRejectedValue(sampleError);

      await expect(repo.getTicketComments("ticket-e3")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e3" },
        "Error fetching comments",
      );
    });

    it("logs and rethrows for getAIComments", async () => {
      mockTicketCommentFindMany.mockRejectedValue(sampleError);

      await expect(repo.getAIComments("ticket-e4")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e4" },
        "Error fetching AI comments",
      );
    });

    it("logs and rethrows for getComment", async () => {
      mockTicketCommentFindUnique.mockRejectedValue(sampleError);

      await expect(repo.getComment("comment-e1")).rejects.toThrow(sampleError);
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, commentId: "comment-e1" },
        "Error fetching comment",
      );
    });

    it("logs and rethrows for createComment", async () => {
      const data = { ticketId: "ticket-e5", message: "x" };
      mockTicketCommentCreate.mockRejectedValue(sampleError);

      await expect(repo.createComment(data)).rejects.toThrow(sampleError);
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, data },
        "Error creating comment",
      );
    });

    it("logs and rethrows for updateTicket", async () => {
      const update = { status: "OPEN" };
      mockTicketUpdate.mockRejectedValue(sampleError);

      await expect(repo.updateTicket("ticket-e6", update)).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e6", data: update },
        "Error updating ticket",
      );
    });

    it("logs and rethrows for getAvailableAgents", async () => {
      mockAgentWorkloadFindMany.mockRejectedValue(sampleError);

      await expect(repo.getAvailableAgents("org-e1")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, organizationId: "org-e1" },
        "Error fetching available agents",
      );
    });

    it("logs and rethrows for getAgentWorkload", async () => {
      mockAgentWorkloadFindUnique.mockRejectedValue(sampleError);

      await expect(repo.getAgentWorkload("agent-e1", "org-e2")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, userId: "agent-e1", organizationId: "org-e2" },
        "Error fetching agent workload",
      );
    });

    it("logs and rethrows for getAgentTickets", async () => {
      mockTicketFindMany.mockRejectedValue(sampleError);
      const since = new Date("2026-01-02T00:00:00.000Z");

      await expect(repo.getAgentTickets("agent-e2", since)).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, agentId: "agent-e2" },
        "Error fetching agent tickets",
      );
    });

    it("logs and rethrows for getOrganizationTickets", async () => {
      mockTicketFindMany.mockRejectedValue(sampleError);

      await expect(
        repo.getOrganizationTickets("org-e3", new Date()),
      ).rejects.toThrow(sampleError);
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, organizationId: "org-e3" },
        "Error fetching org tickets",
      );
    });

    it("logs and rethrows for getTicketAIMetadata", async () => {
      mockTicketFindUnique.mockRejectedValue(sampleError);

      await expect(repo.getTicketAIMetadata("ticket-e7")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e7" },
        "Error fetching AI metadata",
      );
    });

    it("logs and rethrows for incrementAIMessageCount", async () => {
      mockTicketUpdate.mockRejectedValue(sampleError);

      await expect(repo.incrementAIMessageCount("ticket-e8")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e8" },
        "Error incrementing AI message count",
      );
    });

    it("logs and rethrows for bulkUpdateTickets", async () => {
      mockTicketUpdate.mockRejectedValue(sampleError);
      const updates = [{ id: "ticket-e9", data: { status: "OPEN" } }];

      await expect(repo.bulkUpdateTickets(updates)).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, updateCount: 1 },
        "Error in bulk update",
      );
    });

    it("logs and rethrows for getOrganizationMembers", async () => {
      mockMembershipFindMany.mockRejectedValue(sampleError);

      await expect(repo.getOrganizationMembers("org-e4")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, organizationId: "org-e4" },
        "Error fetching org members",
      );
    });

    it("logs and rethrows for getAllAIComments", async () => {
      mockTicketCommentFindMany.mockRejectedValue(sampleError);

      await expect(repo.getAllAIComments("ticket-e10")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e10" },
        "Error fetching all AI comments",
      );
    });

    it("logs and rethrows for getUserComments", async () => {
      mockTicketCommentFindMany.mockRejectedValue(sampleError);

      await expect(repo.getUserComments("ticket-e11")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError, ticketId: "ticket-e11" },
        "Error fetching user comments",
      );
    });

    it("logs and rethrows for transaction", async () => {
      mockTransaction.mockRejectedValue(sampleError);

      await expect(repo.transaction(async () => "unused")).rejects.toThrow(
        sampleError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: sampleError },
        "Transaction failed",
      );
    });
  });
});
