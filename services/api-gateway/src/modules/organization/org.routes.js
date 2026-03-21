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
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from "./org.validator.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  verifyOrganizationMembership,
  requireOwner,
  requireOwnerOrAdmin,
} from "./org.middleware.js";

const router = express.Router();

router.get("/", authenticate, getOrganizationsByUserIdController);
router.get(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  getOrganizationByIdController,
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
  validate(inviteMemberSchema),
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
  validate(updateMemberRoleSchema),
  updateMemberFromOrganizationController,
);

export default router;
