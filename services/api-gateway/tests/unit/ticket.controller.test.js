import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateTicketService = jest.fn();
const mockGetTicketsService = jest.fn();

jest.unstable_mockModule("../../src/modules/tickets/ticket.service.js", () => ({
  createTicketService: mockCreateTicketService,
  getTicketsService: mockGetTicketsService,
}));

const { createTicketController, getTicketsController } = await import(
  "../../src/modules/tickets/ticket.controller.js"
);

describe("Ticket Controller", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {
        organizationId: "org-1",
        title: "Login issue",
      },
      query: {},
      user: { id: "user-1" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it("should create a ticket and return 201", async () => {
    const ticket = { id: "ticket-1", title: "Login issue" };
    mockCreateTicketService.mockResolvedValue(ticket);

    await createTicketController(req, res, next);

    expect(mockCreateTicketService).toHaveBeenCalledWith(req.body, "user-1");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ticket },
    });
  });

  it("should call next if the service throws", async () => {
    const error = new Error("Create failed");
    mockCreateTicketService.mockRejectedValue(error);

    await createTicketController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should return tickets and 200", async () => {
    const tickets = [{ id: "ticket-1" }, { id: "ticket-2" }];
    req.query = { organizationId: "org-1" };
    mockGetTicketsService.mockResolvedValue(tickets);

    await getTicketsController(req, res, next);

    expect(mockGetTicketsService).toHaveBeenCalledWith(
      { organizationId: "org-1" },
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { tickets },
    });
  });

  it("should call next if get tickets service throws", async () => {
    const error = new Error("List failed");
    req.query = { organizationId: "org-1" };
    mockGetTicketsService.mockRejectedValue(error);

    await getTicketsController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
