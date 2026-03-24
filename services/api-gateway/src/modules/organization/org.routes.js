import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
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
import {
  verifyOrganizationMembership,
  requireOwner,
  requireOwnerOrAdmin,
} from "./org.middleware.js";
import {
  createOrganizationSchema,
  deleteOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from "./org.validator.js";

const router = express.Router();

// Organization CRUD
router.get("/", authenticate, getOrganizationsByUserIdController);
router.post("/", authenticate, validate(createOrganizationSchema), createOrganizationController);

router.get("/:orgId", authenticate, verifyOrganizationMembership, getOrganizationByIdController);
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
  validate(deleteOrganizationSchema),
  deleteOrganizationController,
);

// Organization Member Routes
router.get(
  "/:orgId/members",
  authenticate,
  verifyOrganizationMembership,
  viewAllMembersInOrganizationController,
);
router.post(
  "/:orgId/members",
  authenticate,
  verifyOrganizationMembership,
  requireOwnerOrAdmin,
  validate(inviteMemberSchema),
  inviteMemberInOrganizationController,
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
