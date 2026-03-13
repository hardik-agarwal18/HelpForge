import {
  createTicketAttachmentService,
  createTicketCommentService,
  createTicketService,
  deleteTicketCommentService,
  getTicketByIdService,
  getTicketAttachmentsService,
  getTicketCommentsService,
  getTicketsService,
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
