import express from "express";
import {
  createOrganizationController,
  deleteOrganizationController,
  updateOrganizationController,
} from "../controllers/org.Controller";
import {
  createOrganizationSchema,
  deleteOrganizationSchema,
  updateOrganizationSchema,
} from "../org.validator";
import { authenticate } from "../../../middleware/auth.middleware";
import { validate } from "../../../middleware/validation.middleware";
import { requireOwner, verifyOrganizationMembership } from "../org.middleware";

const router = express.Router();

router.post(
  "/",
  authenticate,
  validate(createOrganizationSchema),
  createOrganizationController,
);

router.patch(
  "/:orgId",
  authenticate,
  validate(updateOrganizationSchema),
  verifyOrganizationMembership,
  requireOwner,
  updateOrganizationController,
);

router.delete(
  "/:orgId",
  authenticate,
  validate(deleteOrganizationSchema),
  verifyOrganizationMembership,
  requireOwner,
  deleteOrganizationController,
);

export default router;
