import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateTicket = jest.fn();
const mockGetTicketOrganizationMembership = jest.fn();

jest.unstable_mockModule("../../src/modules/tickets/ticket.repo.js", () => ({
  createTicket: mockCreateTicket,
  getTicketOrganizationMembership: mockGetTicketOrganizationMembership,
}));

const { createTicketService } = await import(
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
    mockCreateTicket.mockResolvedValue({ id: "ticket-1", title: "Login issue" });

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
    expect(result).toEqual({ id: "ticket-1", title: "Login issue" });
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
});
