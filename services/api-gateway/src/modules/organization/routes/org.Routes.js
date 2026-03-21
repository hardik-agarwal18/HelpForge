import express from "express";
import {
  createOrganizationController,
  updateOrganizationController,
} from "../controllers/org.Controller";
import {
  createOrganizationSchema,
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
export default router;
