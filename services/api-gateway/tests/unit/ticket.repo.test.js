import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockMembershipFindMany = jest.fn();
const mockMembershipFindUnique = jest.fn();
const mockMembershipUpdate = jest.fn();

jest.unstable_mockModule("../../src/config/database.config.js", () => ({
  default: {
    membership: {
      findMany: mockMembershipFindMany,
      findUnique: mockMembershipFindUnique,
      update: mockMembershipUpdate,
    },
    tag: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    ticket: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ticketComment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    ticketAttachment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    ticketActivityLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    ticketTag: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const {
  getOrganizationAgentsWithLoad,
  updateAgentAvailability,
} = await import("../../src/modules/tickets/ticket.repo.js");

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

  it("should fetch only available organization agents with org-scoped active load", async () => {
    const memberships = [{ id: "membership-1", userId: "agent-1" }];
    mockMembershipFindMany.mockResolvedValue(memberships);

    const result = await getOrganizationAgentsWithLoad("org-1", [
      "OPEN",
      "IN_PROGRESS",
    ]);

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        role: "AGENT",
        isAvailable: true,
      },
      include: {
        user: {
          include: {
            assignedTickets: {
              where: {
                organizationId: "org-1",
                status: {
                  in: ["OPEN", "IN_PROGRESS"],
                },
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    expect(result).toBe(memberships);
  });
});
