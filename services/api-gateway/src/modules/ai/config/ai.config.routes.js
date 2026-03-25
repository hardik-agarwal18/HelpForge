import express from "express";
import { authenticate } from "../../../middleware/auth.middleware.js";
import { validate } from "../../../middleware/validation.middleware.js";
import {
  verifyOrganizationMembership,
  requirePermission,
} from "../../organization/org.middleware.js";
import { PERMISSIONS } from "../../organization/org.constants.js";
import {
  getAIConfigController,
  createAIConfigController,
  updateAIConfigController,
} from "./ai.config.controller.js";
import {
  getAIConfigSchema,
  createAIConfigSchema,
  updateAIConfigSchema,
} from "./ai.config.validator.js";

const router = express.Router();

// GET  /api/ai/config/:orgId
router.get(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.AI_MANAGE_CONFIG),
  validate(getAIConfigSchema),
  getAIConfigController,
);

// POST /api/ai/config/:orgId
router.post(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.AI_MANAGE_CONFIG),
  validate(createAIConfigSchema),
  createAIConfigController,
);

// PATCH /api/ai/config/:orgId
router.patch(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.AI_MANAGE_CONFIG),
  validate(updateAIConfigSchema),
  updateAIConfigController,
);

export default router;
