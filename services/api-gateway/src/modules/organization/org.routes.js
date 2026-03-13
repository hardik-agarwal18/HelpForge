import express from "express";
import {
  createOrganizationController,
  deleteOrganizationController,
  getOrganizationByIdController,
  getOrganizationsByUserIdController,
  inviteMemberInOrganizationController,
  updateMemberFromOrganizationController,
  updateOrganizationController,
  viewAllMembersInOrganizationController,
} from "./org.controller.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "./org.validator.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  verifyOrganizationMembership,
  requireOwner,
  requireOwnerOrAdmin,
} from "./org.middleware.js";

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
  requireOwnerOrAdmin,
  validate(updateOrganizationSchema),
  updateOrganizationController,
);

router.delete(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  requireOwner,
  deleteOrganizationController,
);

//Organization Member Routes

router.post(
  "/:orgId/members",
  authenticate,
  verifyOrganizationMembership,
  requireOwnerOrAdmin,
  inviteMemberInOrganizationController,
);

router.get(
  "/:orgId/members",
  authenticate,
  verifyOrganizationMembership,
  viewAllMembersInOrganizationController,
);

router.patch(
  "/:orgId/members/:userId",
  authenticate,
  verifyOrganizationMembership,
  requireOwnerOrAdmin,
  updateMemberFromOrganizationController,
);

export default router;
