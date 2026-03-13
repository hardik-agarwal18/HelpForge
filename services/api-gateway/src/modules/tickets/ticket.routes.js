import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  createTicketController,
  getTicketByIdController,
  getTicketsController,
  updateTicketController,
} from "./ticket.controller.js";
import { createTicketSchema, updateTicketSchema } from "./ticket.validator.js";

const router = express.Router();

router.post("/", authenticate, validate(createTicketSchema), createTicketController);
router.get("/", authenticate, getTicketsController);
router.get("/:ticketId", authenticate, getTicketByIdController);
router.patch("/:ticketId", authenticate, validate(updateTicketSchema), updateTicketController);

export default router;
