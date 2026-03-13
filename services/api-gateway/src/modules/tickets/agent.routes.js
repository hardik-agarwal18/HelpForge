import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  getMyAgentStatsController,
  getMyAgentTicketsController,
} from "./ticket.controller.js";

const router = express.Router();

router.get("/me/tickets", authenticate, getMyAgentTicketsController);
router.get("/me/stats", authenticate, getMyAgentStatsController);

export default router;
