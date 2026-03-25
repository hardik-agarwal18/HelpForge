import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
} from "../../../src/modules/organization/org.constants.js";

// ── Test role fixtures ──────────────────────────────────────────────
const OWNER_ROLE = {
  id: "role-owner",
  name: "OWNER",
  permissions: ALL_PERMISSIONS,
  level: 100,
  isSystem: true,
  organizationId: "org-1",
};

const ADMIN_ROLE = {
  id: "role-admin",
  name: "ADMIN",
  permissions: [
    PERMISSIONS.ORG_UPDATE,
    PERMISSIONS.ORG_INVITE_MEMBER,
    PERMISSIONS.ORG_MANAGE_MEMBER,
    PERMISSIONS.ORG_VIEW_MEMBERS,
    PERMISSIONS.ROLE_CREATE,
    PERMISSIONS.ROLE_UPDATE,
    PERMISSIONS.ROLE_DELETE,
    PERMISSIONS.TICKET_VIEW_ALL,
    PERMISSIONS.TICKET_EDIT_ALL,
    PERMISSIONS.TICKET_ASSIGN,
    PERMISSIONS.TICKET_CREATE_INTERNAL_COMMENT,
    PERMISSIONS.TICKET_DELETE_ANY_COMMENT,
    PERMISSIONS.TICKET_DELETE_ANY_ATTACHMENT,
    PERMISSIONS.AI_MANAGE_CONFIG,
  ],
  level: 75,
  isSystem: true,
  organizationId: "org-1",
};

const AGENT_ROLE = {
  id: "role-agent",
  name: "AGENT",
  permissions: [
    PERMISSIONS.ORG_VIEW_MEMBERS,
    PERMISSIONS.TICKET_VIEW_ALL,
    PERMISSIONS.TICKET_EDIT_ALL,
    PERMISSIONS.TICKET_ASSIGN,
    PERMISSIONS.TICKET_CREATE_INTERNAL_COMMENT,
    PERMISSIONS.TICKET_DELETE_ANY_COMMENT,
    PERMISSIONS.TICKET_DELETE_ANY_ATTACHMENT,
    PERMISSIONS.AGENT_UPDATE_AVAILABILITY,
  ],
  level: 50,
  isSystem: true,
  organizationId: "org-1",
};

const MEMBER_ROLE = {
  id: "role-member",
  name: "MEMBER",
  permissions: [PERMISSIONS.ORG_VIEW_MEMBERS],
  level: 10,
  isSystem: true,
  organizationId: "org-1",
};

// ── Mocks ───────────────────────────────────────────────────────────
const mockGetUserMembershipInOrganization = jest.fn();

jest.unstable_mockModule("../../../src/modules/organization/org.repo.js", () => ({
  getUserMembershipInOrganization: mockGetUserMembershipInOrganization,
}));

// Import after mocking
const {
  verifyOrganizationMembership,
  requirePermission,
  requireOwnerOrAdmin,
  requireOwner,
} = await import("../../../src/modules/organization/org.middleware.js");

describe("Organization Middleware", () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { id: "user-1" },
      params: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe("verifyOrganizationMembership", () => {
    it("should return 400 if orgId is missing", async () => {
      await verifyOrganizationMembership(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "Organization ID is required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 403 if membership is not found", async () => {
      mockReq.params.orgId = "org-1";
      mockGetUserMembershipInOrganization.mockResolvedValue(null);

      await verifyOrganizationMembership(mockReq, mockRes, mockNext);

      expect(mockGetUserMembershipInOrganization).toHaveBeenCalledWith({
        userId: "user-1",
        orgId: "org-1",
      });
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "You do not have access to this organization",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should attach organization and membership and call next if found", async () => {
      mockReq.params.orgId = "org-1";
      const mockMembership = {
        id: "mem-1",
        userId: "user-1",
        organizationId: "org-1",
        role: MEMBER_ROLE,
        organization: { id: "org-1", name: "Test Org" },
      };

      mockGetUserMembershipInOrganization.mockResolvedValue(mockMembership);

      await verifyOrganizationMembership(mockReq, mockRes, mockNext);

      expect(mockReq.organization).toEqual(mockMembership.organization);
      expect(mockReq.membership).toEqual(mockMembership);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should call next with error if exception is thrown", async () => {
      mockReq.params.orgId = "org-1";
      const error = new Error("DB Error");
      mockGetUserMembershipInOrganization.mockRejectedValue(error);

      await verifyOrganizationMembership(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("requirePermission", () => {
    it("should return 500 if membership is not verified beforehand", () => {
      const middleware = requirePermission(PERMISSIONS.ORG_DELETE);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "Organization membership not verified",
      });
    });

    it("should return 403 if user does not have the required permission", () => {
      mockReq.membership = { role: MEMBER_ROLE };
      const middleware = requirePermission(PERMISSIONS.ORG_UPDATE);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "You do not have permission to perform this action",
      });
    });

    it("should call next if user has the required permission", () => {
      mockReq.membership = { role: ADMIN_ROLE };
      const middleware = requirePermission(PERMISSIONS.ORG_UPDATE);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should return 403 if user is missing one of multiple required permissions", () => {
      mockReq.membership = { role: MEMBER_ROLE };
      const middleware = requirePermission(PERMISSIONS.ORG_VIEW_MEMBERS, PERMISSIONS.ORG_UPDATE);

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it("should call next if user has all required permissions", () => {
      mockReq.membership = { role: OWNER_ROLE };
      const middleware = requirePermission(PERMISSIONS.ORG_UPDATE, PERMISSIONS.ORG_DELETE);

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("requireOwnerOrAdmin", () => {
    it("should pass for OWNER role (has org:update permission)", () => {
      mockReq.membership = { role: OWNER_ROLE };
      requireOwnerOrAdmin(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should pass for ADMIN role (has org:update permission)", () => {
      mockReq.membership = { role: ADMIN_ROLE };
      requireOwnerOrAdmin(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should fail for MEMBER role (lacks org:update permission)", () => {
      mockReq.membership = { role: MEMBER_ROLE };
      requireOwnerOrAdmin(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireOwner", () => {
    it("should pass for OWNER role (has org:delete permission)", () => {
      mockReq.membership = { role: OWNER_ROLE };
      requireOwner(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should fail for ADMIN role (lacks org:delete permission)", () => {
      mockReq.membership = { role: ADMIN_ROLE };
      requireOwner(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});
