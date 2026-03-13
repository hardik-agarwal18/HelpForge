import express from "express";
import {
  createOrganizationController,
  getOrganizationByIdController,
  getOrganizationsByUserIdController,
  updateOrganizationController,
} from "./org.controller.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "./org.validator.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { verifyOrganizationMembership } from "./org.middleware.js";

const router = express.Router();

router.post(
  "/",
  authenticate,
  validate(createOrganizationSchema),
  createOrganizationController,
);
router.get("/", authenticate, getOrganizationsByUserIdController);
router.get(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  getOrganizationByIdController,
);
router.patch(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  validate(updateOrganizationSchema),
  updateOrganizationController,
);

export default router;
