import {
  assignTicketService,
  addTicketTagService,
  createTagService,
  createTicketAttachmentService,
  createTicketCommentService,
  createTicketService,
  deleteTicketTagService,
  deleteTicketCommentService,
  deleteTicketAttachmentService,
  getTicketByIdService,
  getTicketAttachmentsService,
  getTicketCommentsService,
  getTicketsService,
  getTagsService,
  updateTicketStatusService,
  updateTicketService,
} from "./ticket.service.js";

export const createTicketController = async (req, res, next) => {
  try {
    const ticket = await createTicketService(req.body, req.user.id);

    return res.status(201).json({
      success: true,
      data: { ticket },
    });
  } catch (error) {
    next(error);
  }
};

export const getTicketsController = async (req, res, next) => {
  try {
    const tickets = await getTicketsService(req.query, req.user.id);

    return res.status(200).json({
      success: true,
      data: { tickets },
    });
  } catch (error) {
    next(error);
  }
};

export const createTagController = async (req, res, next) => {
  try {
    const tag = await createTagService(req.body, req.user.id);

    return res.status(201).json({
      success: true,
      data: { tag },
    });
  } catch (error) {
    next(error);
  }
};

export const getTagsController = async (req, res, next) => {
  try {
    const tags = await getTagsService(req.query.organizationId, req.user.id);

    return res.status(200).json({
      success: true,
      data: { tags },
    });
  } catch (error) {
    next(error);
  }
};

export const getTicketByIdController = async (req, res, next) => {
  try {
    const ticket = await getTicketByIdService(req.params.ticketId, req.user.id);

    return res.status(200).json({
      success: true,
      data: { ticket },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTicketController = async (req, res, next) => {
  try {
    const ticket = await updateTicketService(
      req.params.ticketId,
      req.body,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { ticket },
    });
  } catch (error) {
    next(error);
  }
};

export const assignTicketController = async (req, res, next) => {
  try {
    const ticket = await assignTicketService(
      req.params.ticketId,
      req.body.assignedToId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { ticket },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTicketStatusController = async (req, res, next) => {
  try {
    const ticket = await updateTicketStatusService(
      req.params.ticketId,
      req.body.status,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { ticket },
    });
  } catch (error) {
    next(error);
  }
};

export const createTicketCommentController = async (req, res, next) => {
  try {
    const comment = await createTicketCommentService(
      req.params.ticketId,
      req.body,
      req.user.id,
    );

    return res.status(201).json({
      success: true,
      data: { comment },
    });
  } catch (error) {
    next(error);
  }
};

export const getTicketCommentsController = async (req, res, next) => {
  try {
    const comments = await getTicketCommentsService(
      req.params.ticketId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { comments },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTicketCommentController = async (req, res, next) => {
  try {
    const comment = await deleteTicketCommentService(
      req.params.ticketId,
      req.params.commentId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { comment },
    });
  } catch (error) {
    next(error);
  }
};

export const createTicketAttachmentController = async (req, res, next) => {
  try {
    const attachment = await createTicketAttachmentService(
      req.params.ticketId,
      req.body,
      req.user.id,
    );

    return res.status(201).json({
      success: true,
      data: { attachment },
    });
  } catch (error) {
    next(error);
  }
};

export const getTicketAttachmentsController = async (req, res, next) => {
  try {
    const attachments = await getTicketAttachmentsService(
      req.params.ticketId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { attachments },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTicketAttachmentController = async (req, res, next) => {
  try {
    const attachment = await deleteTicketAttachmentService(
      req.params.ticketId,
      req.params.id,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { attachment },
    });
  } catch (error) {
    next(error);
  }
};

export const addTicketTagController = async (req, res, next) => {
  try {
    const ticketTag = await addTicketTagService(
      req.params.ticketId,
      req.body.tagId,
      req.user.id,
    );

    return res.status(201).json({
      success: true,
      data: { ticketTag },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTicketTagController = async (req, res, next) => {
  try {
    const ticketTag = await deleteTicketTagService(
      req.params.ticketId,
      req.params.tagId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { ticketTag },
    });
  } catch (error) {
    next(error);
  }
};
