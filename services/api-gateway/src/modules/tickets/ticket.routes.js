import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  createTicketController,
  getTicketsController,
} from "./ticket.controller.js";
import { createTicketSchema } from "./ticket.validator.js";

const router = express.Router();

router.post("/", authenticate, validate(createTicketSchema), createTicketController);
router.get("/", authenticate, getTicketsController);

export default router;
