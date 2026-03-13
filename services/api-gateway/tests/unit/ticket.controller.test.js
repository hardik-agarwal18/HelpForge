import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateTicketService = jest.fn();
const mockCreateTicketAttachmentService = jest.fn();
const mockCreateTicketCommentService = jest.fn();
const mockAssignTicketService = jest.fn();
const mockAddTicketTagService = jest.fn();
const mockCreateTagService = jest.fn();
const mockDeleteTicketTagService = jest.fn();
const mockDeleteTicketAttachmentService = jest.fn();
const mockDeleteTicketCommentService = jest.fn();
const mockGetTicketByIdService = jest.fn();
const mockGetTicketAttachmentsService = jest.fn();
const mockGetTicketCommentsService = jest.fn();
const mockGetTicketsService = jest.fn();
const mockGetTagsService = jest.fn();
const mockUpdateTicketStatusService = jest.fn();
const mockUpdateTicketService = jest.fn();

jest.unstable_mockModule("../../src/modules/tickets/ticket.service.js", () => ({
  addTicketTagService: mockAddTicketTagService,
  assignTicketService: mockAssignTicketService,
  createTagService: mockCreateTagService,
  createTicketCommentService: mockCreateTicketCommentService,
  createTicketAttachmentService: mockCreateTicketAttachmentService,
  createTicketService: mockCreateTicketService,
  deleteTicketTagService: mockDeleteTicketTagService,
  deleteTicketAttachmentService: mockDeleteTicketAttachmentService,
  deleteTicketCommentService: mockDeleteTicketCommentService,
  getTicketAttachmentsService: mockGetTicketAttachmentsService,
  getTicketByIdService: mockGetTicketByIdService,
  getTicketCommentsService: mockGetTicketCommentsService,
  getTicketsService: mockGetTicketsService,
  getTagsService: mockGetTagsService,
  updateTicketStatusService: mockUpdateTicketStatusService,
  updateTicketService: mockUpdateTicketService,
}));

const {
  addTicketTagController,
  assignTicketController,
  createTagController,
  createTicketAttachmentController,
  createTicketCommentController,
  createTicketController,
  deleteTicketTagController,
  deleteTicketAttachmentController,
  deleteTicketCommentController,
  getTicketByIdController,
  getTicketAttachmentsController,
  getTicketCommentsController,
  getTicketsController,
  getTagsController,
  updateTicketStatusController,
  updateTicketController,
} = await import(
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
      params: {},
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

  it("should create a tag and return 201", async () => {
    const tag = { id: "tag-1", name: "Bug" };
    req.body = { organizationId: "org-1", name: "Bug" };
    mockCreateTagService.mockResolvedValue(tag);

    await createTagController(req, res, next);

    expect(mockCreateTagService).toHaveBeenCalledWith(req.body, "user-1");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { tag },
    });
  });

  it("should return tags and 200", async () => {
    const tags = [{ id: "tag-1", name: "Bug" }];
    req.query = { organizationId: "org-1" };
    mockGetTagsService.mockResolvedValue(tags);

    await getTagsController(req, res, next);

    expect(mockGetTagsService).toHaveBeenCalledWith("org-1", "user-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { tags },
    });
  });

  it("should return a single ticket and 200", async () => {
    const ticket = { id: "ticket-1" };
    req.params = { ticketId: "ticket-1" };
    mockGetTicketByIdService.mockResolvedValue(ticket);

    await getTicketByIdController(req, res, next);

    expect(mockGetTicketByIdService).toHaveBeenCalledWith("ticket-1", "user-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ticket },
    });
  });

  it("should call next if get ticket by id service throws", async () => {
    const error = new Error("Get by id failed");
    req.params = { ticketId: "ticket-1" };
    mockGetTicketByIdService.mockRejectedValue(error);

    await getTicketByIdController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should update a ticket and return 200", async () => {
    const ticket = { id: "ticket-1", title: "Updated" };
    req.params = { ticketId: "ticket-1" };
    req.body = { title: "Updated" };
    mockUpdateTicketService.mockResolvedValue(ticket);

    await updateTicketController(req, res, next);

    expect(mockUpdateTicketService).toHaveBeenCalledWith(
      "ticket-1",
      { title: "Updated" },
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ticket },
    });
  });

  it("should call next if update ticket service throws", async () => {
    const error = new Error("Update failed");
    req.params = { ticketId: "ticket-1" };
    req.body = { title: "Updated" };
    mockUpdateTicketService.mockRejectedValue(error);

    await updateTicketController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should assign a ticket and return 200", async () => {
    const ticket = { id: "ticket-1", assignedToId: "user-2" };
    req.params = { ticketId: "ticket-1" };
    req.body = { assignedToId: "user-2" };
    mockAssignTicketService.mockResolvedValue(ticket);

    await assignTicketController(req, res, next);

    expect(mockAssignTicketService).toHaveBeenCalledWith(
      "ticket-1",
      "user-2",
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ticket },
    });
  });

  it("should call next if assign ticket service throws", async () => {
    const error = new Error("Assign failed");
    req.params = { ticketId: "ticket-1" };
    req.body = { assignedToId: "user-2" };
    mockAssignTicketService.mockRejectedValue(error);

    await assignTicketController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should update ticket status and return 200", async () => {
    const ticket = { id: "ticket-1", status: "RESOLVED" };
    req.params = { ticketId: "ticket-1" };
    req.body = { status: "resolved" };
    mockUpdateTicketStatusService.mockResolvedValue(ticket);

    await updateTicketStatusController(req, res, next);

    expect(mockUpdateTicketStatusService).toHaveBeenCalledWith(
      "ticket-1",
      "resolved",
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ticket },
    });
  });

  it("should call next if update ticket status service throws", async () => {
    const error = new Error("Status update failed");
    req.params = { ticketId: "ticket-1" };
    req.body = { status: "resolved" };
    mockUpdateTicketStatusService.mockRejectedValue(error);

    await updateTicketStatusController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should create a comment and return 201", async () => {
    const comment = { id: "comment-1", message: "Public reply" };
    req.params = { ticketId: "ticket-1" };
    req.body = { message: "Public reply" };
    mockCreateTicketCommentService.mockResolvedValue(comment);

    await createTicketCommentController(req, res, next);

    expect(mockCreateTicketCommentService).toHaveBeenCalledWith(
      "ticket-1",
      { message: "Public reply" },
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { comment },
    });
  });

  it("should call next if create comment service throws", async () => {
    const error = new Error("Comment failed");
    req.params = { ticketId: "ticket-1" };
    req.body = { message: "Public reply" };
    mockCreateTicketCommentService.mockRejectedValue(error);

    await createTicketCommentController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should return comments and 200", async () => {
    const comments = [{ id: "comment-1", message: "Hello" }];
    req.params = { ticketId: "ticket-1" };
    mockGetTicketCommentsService.mockResolvedValue(comments);

    await getTicketCommentsController(req, res, next);

    expect(mockGetTicketCommentsService).toHaveBeenCalledWith("ticket-1", "user-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { comments },
    });
  });

  it("should call next if get ticket comments service throws", async () => {
    const error = new Error("Comments failed");
    req.params = { ticketId: "ticket-1" };
    mockGetTicketCommentsService.mockRejectedValue(error);

    await getTicketCommentsController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should delete a comment and return 200", async () => {
    const comment = { id: "comment-1", message: "Removed" };
    req.params = { ticketId: "ticket-1", commentId: "comment-1" };
    mockDeleteTicketCommentService.mockResolvedValue(comment);

    await deleteTicketCommentController(req, res, next);

    expect(mockDeleteTicketCommentService).toHaveBeenCalledWith(
      "ticket-1",
      "comment-1",
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { comment },
    });
  });

  it("should call next if delete ticket comment service throws", async () => {
    const error = new Error("Delete comment failed");
    req.params = { ticketId: "ticket-1", commentId: "comment-1" };
    mockDeleteTicketCommentService.mockRejectedValue(error);

    await deleteTicketCommentController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should delete an attachment and return 200", async () => {
    const attachment = { id: "attachment-1", fileUrl: "https://example.com/file.pdf" };
    req.params = { ticketId: "ticket-1", id: "attachment-1" };
    mockDeleteTicketAttachmentService.mockResolvedValue(attachment);

    await deleteTicketAttachmentController(req, res, next);

    expect(mockDeleteTicketAttachmentService).toHaveBeenCalledWith(
      "ticket-1",
      "attachment-1",
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { attachment },
    });
  });

  it("should call next if delete ticket attachment service throws", async () => {
    const error = new Error("Delete attachment failed");
    req.params = { ticketId: "ticket-1", id: "attachment-1" };
    mockDeleteTicketAttachmentService.mockRejectedValue(error);

    await deleteTicketAttachmentController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should add a tag to a ticket and return 201", async () => {
    const ticketTag = { ticketId: "ticket-1", tagId: "tag-1" };
    req.params = { ticketId: "ticket-1" };
    req.body = { tagId: "tag-1" };
    mockAddTicketTagService.mockResolvedValue(ticketTag);

    await addTicketTagController(req, res, next);

    expect(mockAddTicketTagService).toHaveBeenCalledWith(
      "ticket-1",
      "tag-1",
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ticketTag },
    });
  });

  it("should delete a ticket tag and return 200", async () => {
    const ticketTag = { ticketId: "ticket-1", tagId: "tag-1" };
    req.params = { ticketId: "ticket-1", tagId: "tag-1" };
    mockDeleteTicketTagService.mockResolvedValue(ticketTag);

    await deleteTicketTagController(req, res, next);

    expect(mockDeleteTicketTagService).toHaveBeenCalledWith(
      "ticket-1",
      "tag-1",
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ticketTag },
    });
  });

  it("should create an attachment and return 201", async () => {
    const attachment = { id: "attachment-1" };
    req.params = { ticketId: "ticket-1" };
    req.body = {
      fileUrl: "https://example.com/file.pdf",
      fileType: "application/pdf",
      fileSize: 1024,
    };
    mockCreateTicketAttachmentService.mockResolvedValue(attachment);

    await createTicketAttachmentController(req, res, next);

    expect(mockCreateTicketAttachmentService).toHaveBeenCalledWith(
      "ticket-1",
      {
        fileUrl: "https://example.com/file.pdf",
        fileType: "application/pdf",
        fileSize: 1024,
      },
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { attachment },
    });
  });

  it("should call next if create attachment service throws", async () => {
    const error = new Error("Attachment failed");
    req.params = { ticketId: "ticket-1" };
    req.body = {
      fileUrl: "https://example.com/file.pdf",
      fileType: "application/pdf",
      fileSize: 1024,
    };
    mockCreateTicketAttachmentService.mockRejectedValue(error);

    await createTicketAttachmentController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("should return attachments and 200", async () => {
    const attachments = [{ id: "attachment-1" }];
    req.params = { ticketId: "ticket-1" };
    mockGetTicketAttachmentsService.mockResolvedValue(attachments);

    await getTicketAttachmentsController(req, res, next);

    expect(mockGetTicketAttachmentsService).toHaveBeenCalledWith(
      "ticket-1",
      "user-1",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { attachments },
    });
  });

  it("should call next if get ticket attachments service throws", async () => {
    const error = new Error("Attachment list failed");
    req.params = { ticketId: "ticket-1" };
    mockGetTicketAttachmentsService.mockRejectedValue(error);

    await getTicketAttachmentsController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
