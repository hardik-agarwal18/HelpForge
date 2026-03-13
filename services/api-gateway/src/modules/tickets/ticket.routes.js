import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  assignTicketController,
  createTicketAttachmentController,
  createTicketCommentController,
  createTicketController,
  deleteTicketAttachmentController,
  deleteTicketCommentController,
  getTicketByIdController,
  getTicketAttachmentsController,
  getTicketCommentsController,
  getTicketsController,
  updateTicketStatusController,
  updateTicketController,
} from "./ticket.controller.js";
import {
  assignTicketSchema,
  createTicketAttachmentSchema,
  createTicketCommentSchema,
  createTicketSchema,
  updateTicketStatusSchema,
  updateTicketSchema,
} from "./ticket.validator.js";

const router = express.Router();

router.post("/", authenticate, validate(createTicketSchema), createTicketController);
router.get("/", authenticate, getTicketsController);
router.get("/:ticketId", authenticate, getTicketByIdController);
router.patch(
  "/:ticketId/assign",
  authenticate,
  validate(assignTicketSchema),
  assignTicketController,
);
router.patch(
  "/:ticketId/status",
  authenticate,
  validate(updateTicketStatusSchema),
  updateTicketStatusController,
);
router.patch("/:ticketId", authenticate, validate(updateTicketSchema), updateTicketController);
router.get("/:ticketId/comments", authenticate, getTicketCommentsController);
router.delete(
  "/:ticketId/comments/:commentId",
  authenticate,
  deleteTicketCommentController,
);
router.delete(
  "/:ticketId/attachments/:id",
  authenticate,
  deleteTicketAttachmentController,
);
router.get("/:ticketId/attachments", authenticate, getTicketAttachmentsController);
router.post(
  "/:ticketId/attachments",
  authenticate,
  validate(createTicketAttachmentSchema),
  createTicketAttachmentController,
);
router.post(
  "/:ticketId/comments",
  authenticate,
  validate(createTicketCommentSchema),
  createTicketCommentController,
);

export default router;
