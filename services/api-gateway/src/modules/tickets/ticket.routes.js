import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import { createTicketController } from "./ticket.controller.js";
import { createTicketSchema } from "./ticket.validator.js";

const router = express.Router();

router.post("/", authenticate, validate(createTicketSchema), createTicketController);

export default router;
