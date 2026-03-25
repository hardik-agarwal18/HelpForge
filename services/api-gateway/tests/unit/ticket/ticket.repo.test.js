import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockMembershipFindMany = jest.fn();
const mockMembershipFindUnique = jest.fn();
const mockMembershipUpdate = jest.fn();
const mockAgentWorkloadFindMany = jest.fn();
const mockAgentWorkloadUpsert = jest.fn();
const mockTicketUpdate = jest.fn();
const mockTicketActivityLogCreate = jest.fn();
const mockTransaction = jest.fn();

jest.unstable_mockModule("../../../src/config/database.config.js", () => ({
  default: {
    read: {
      membership: {
        findMany: mockMembershipFindMany,
        findUnique: mockMembershipFindUnique,
      },
      tag: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      ticket: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      agentWorkload: {
        findMany: mockAgentWorkloadFindMany,
      },
      ticketComment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      ticketAttachment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      ticketActivityLog: {
        findMany: jest.fn(),
      },
      ticketTag: {
        findUnique: jest.fn(),
      },
    },
    write: {
      membership: {
        update: mockMembershipUpdate,
      },
      tag: {
        create: jest.fn(),
      },
      ticket: {
        create: jest.fn(),
        update: mockTicketUpdate,
      },
      agentWorkload: {
        upsert: mockAgentWorkloadUpsert,
      },
      ticketComment: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      ticketAttachment: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      ticketActivityLog: {
        create: mockTicketActivityLogCreate,
      },
      ticketTag: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: mockTransaction,
    },
  },
}));

const {
  autoAssignTicket,
  getOrganizationAgentWorkloads,
  getOrganizationAvailableAgents,
  updateAgentAvailability,
} = await import("../../../src/modules/tickets/ticket.repo.js");

describe("Ticket Repo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should update agent availability by organization and user id", async () => {
    const membership = {
      id: "membership-1",
      userId: "user-1",
      organizationId: "org-1",
      isAvailable: false,
    };
    mockMembershipUpdate.mockResolvedValue(membership);

    const result = await updateAgentAvailability("org-1", "user-1", false);

    expect(mockMembershipUpdate).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-1",
          organizationId: "org-1",
        },
      },
      data: {
        isAvailable: false,
      },
    });
    expect(result).toBe(membership);
  });

  it("should fetch only available organization agents", async () => {
    const memberships = [{ id: "membership-1", userId: "agent-1" }];
    mockMembershipFindMany.mockResolvedValue(memberships);

    const result = await getOrganizationAvailableAgents("org-1");

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        role: { name: "AGENT" },
        isAvailable: true,
      },
      include: {
        user: true,
        role: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    expect(result).toBe(memberships);
  });

  it("should fetch organization agent workloads", async () => {
    const workloads = [{ id: "workload-1", userId: "agent-1" }];
    mockAgentWorkloadFindMany.mockResolvedValue(workloads);

    const result = await getOrganizationAgentWorkloads("org-1");

    expect(mockAgentWorkloadFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
    });
    expect(result).toBe(workloads);
  });

  it("should auto-assign a ticket inside a transaction", async () => {
    const updatedTicket = { id: "ticket-1", assignedToId: "agent-1" };
    mockTicketUpdate.mockResolvedValue(updatedTicket);
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        agentWorkload: {
          upsert: mockAgentWorkloadUpsert,
        },
        ticketActivityLog: {
          create: mockTicketActivityLogCreate,
        },
        ticket: {
          update: mockTicketUpdate,
        },
      }),
    );

    const result = await autoAssignTicket("ticket-1", "org-1", "agent-1");

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockAgentWorkloadUpsert).toHaveBeenCalled();
    expect(mockTicketActivityLogCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        actorId: "agent-1",
        action: "TICKET_ASSIGNED",
        newValue: "agent-1",
      },
    });
    expect(mockTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-1" },
        data: {
          assignedToId: "agent-1",
          status: "IN_PROGRESS",
        },
      }),
    );
    expect(result).toBe(updatedTicket);
  });
});
