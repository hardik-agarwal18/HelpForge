import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  createOrganizationController,
  createRoleController,
  deleteOrganizationController,
  deleteRoleController,
  getOrganizationByIdController,
  getOrganizationsByUserIdController,
  getRolesController,
  inviteMemberInOrganizationController,
  updateMemberFromOrganizationController,
  updateOrganizationController,
  updateRoleController,
  viewAllMembersInOrganizationController,
} from "./org.controller.js";
import {
  verifyOrganizationMembership,
  requirePermission,
} from "./org.middleware.js";
import {
  createOrganizationSchema,
  createRoleSchema,
  deleteOrganizationSchema,
  deleteRoleSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  updateRoleSchema,
} from "./org.validator.js";
import { PERMISSIONS } from "./org.constants.js";

const router = express.Router();

// Organization CRUD
router.get("/", authenticate, getOrganizationsByUserIdController);
router.post("/", authenticate, validate(createOrganizationSchema), createOrganizationController);

router.get("/:orgId", authenticate, verifyOrganizationMembership, getOrganizationByIdController);
router.patch(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.ORG_UPDATE),
  validate(updateOrganizationSchema),
  updateOrganizationController,
);
router.delete(
  "/:orgId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.ORG_DELETE),
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
  requirePermission(PERMISSIONS.ORG_INVITE_MEMBER),
  validate(inviteMemberSchema),
  inviteMemberInOrganizationController,
);
router.patch(
  "/:orgId/members/:userId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.ORG_MANAGE_MEMBER),
  validate(updateMemberRoleSchema),
  updateMemberFromOrganizationController,
);

// Organization Role Routes
router.get(
  "/:orgId/roles",
  authenticate,
  verifyOrganizationMembership,
  getRolesController,
);
router.post(
  "/:orgId/roles",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.ROLE_CREATE),
  validate(createRoleSchema),
  createRoleController,
);
router.patch(
  "/:orgId/roles/:roleId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  validate(updateRoleSchema),
  updateRoleController,
);
router.delete(
  "/:orgId/roles/:roleId",
  authenticate,
  verifyOrganizationMembership,
  requirePermission(PERMISSIONS.ROLE_DELETE),
  validate(deleteRoleSchema),
  deleteRoleController,
);

export default router;
