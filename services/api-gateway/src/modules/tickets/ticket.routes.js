import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  assignTicketController,
  addTicketTagController,
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
} from "./ticket.controller.js";
import {
  addTicketTagSchema,
  assignTicketSchema,
  createTagSchema,
  createTicketAttachmentSchema,
  createTicketCommentSchema,
  createTicketSchema,
  updateTicketStatusSchema,
  updateTicketSchema,
} from "./ticket.validator.js";

const router = express.Router();

router.post("/tags", authenticate, validate(createTagSchema), createTagController);
router.get("/tags", authenticate, getTagsController);
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
router.post(
  "/:ticketId/tags",
  authenticate,
  validate(addTicketTagSchema),
  addTicketTagController,
);
router.delete(
  "/:ticketId/tags/:tagId",
  authenticate,
  deleteTicketTagController,
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
