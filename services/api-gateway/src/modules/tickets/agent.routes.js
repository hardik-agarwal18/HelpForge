import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  getMyAgentStatsController,
  getMyAgentTicketsController,
  updateMyAgentAvailabilityController,
} from "./ticket.controller.js";
import { updateAgentAvailabilitySchema } from "./ticket.validator.js";

const router = express.Router();

router.get("/me/tickets", authenticate, getMyAgentTicketsController);
router.get("/me/stats", authenticate, getMyAgentStatsController);
router.patch(
  "/me/availability",
  authenticate,
  validate(updateAgentAvailabilitySchema),
  updateMyAgentAvailabilityController,
);

export default router;
