import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ApiError } from "../../../src/utils/errorHandler.js";
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
const mockCreateOrganizationService = jest.fn();
const mockGetOrganizationByUserIdService = jest.fn();
const mockUpdateOrganizationService = jest.fn();
const mockDeleteOrganizationService = jest.fn();
const mockInviteMemberInOrganizationService = jest.fn();
const mockUpdateMemberFromOrganizationService = jest.fn();
const mockViewAllMembersInOrganizationService = jest.fn();
const mockGetRolesService = jest.fn();
const mockCreateRoleService = jest.fn();
const mockUpdateRoleService = jest.fn();
const mockDeleteRoleService = jest.fn();

// Mock the service
jest.unstable_mockModule(
  "../../../src/modules/organization/org.service.js",
  () => ({
    createOrganizationService: mockCreateOrganizationService,
    getOrganizationByUserIdService: mockGetOrganizationByUserIdService,
    updateOrganizationService: mockUpdateOrganizationService,
    deleteOrganizationService: mockDeleteOrganizationService,
    inviteMemberInOrganizationService: mockInviteMemberInOrganizationService,
    updateMemberFromOrganizationService: mockUpdateMemberFromOrganizationService,
    viewAllMembersInOrganizationService: mockViewAllMembersInOrganizationService,
    getRolesService: mockGetRolesService,
    createRoleService: mockCreateRoleService,
    updateRoleService: mockUpdateRoleService,
    deleteRoleService: mockDeleteRoleService,
  }),
);

// Import after mocking
const {
  createOrganizationController,
  getOrganizationsByUserIdController,
  getOrganizationByIdController,
  updateOrganizationController,
  deleteOrganizationController,
  inviteMemberInOrganizationController,
  updateMemberFromOrganizationController,
  viewAllMembersInOrganizationController,
} = await import("../../../src/modules/organization/org.controller.js");

describe("Organization Controller", () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      body: {},
      user: { id: "user-1" },
      params: {},
      organization: undefined,
      membership: { userId: "user-1", role: OWNER_ROLE },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe("createOrganizationController", () => {
    it("should create an organization and return 201", async () => {
      mockReq.body = { name: "Test Org" };
      const mockOrg = { id: "org-1", name: "Test Org" };
      mockCreateOrganizationService.mockResolvedValue(mockOrg);

      await createOrganizationController(mockReq, mockRes, mockNext);

      expect(mockCreateOrganizationService).toHaveBeenCalledWith({
        name: "Test Org",
        userId: "user-1",
      });
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { organization: mockOrg },
      });
    });

    it("should call next with ApiError if creation fails", async () => {
      mockReq.body = { name: "Test Org" };
      const error = new ApiError(500, "Failed to create organization");
      mockCreateOrganizationService.mockRejectedValue(error);

      await createOrganizationController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it("should return 201 even when service returns null (service validates internally)", async () => {
      mockReq.body = { name: "Test Org" };
      mockCreateOrganizationService.mockResolvedValue(null);

      await createOrganizationController(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { organization: null },
      });
    });
  });

  describe("getOrganizationsByUserIdController", () => {
    it("should get organizations and return 200", async () => {
      const mockOrgs = [{ id: "org-1", name: "Test Org" }];
      mockGetOrganizationByUserIdService.mockResolvedValue(mockOrgs);

      await getOrganizationsByUserIdController(mockReq, mockRes, mockNext);

      expect(mockGetOrganizationByUserIdService).toHaveBeenCalledWith("user-1");
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { organizations: mockOrgs },
      });
    });

    it("should call next with error if service throws", async () => {
      const error = new Error("Database error");
      mockGetOrganizationByUserIdService.mockRejectedValue(error);

      await getOrganizationsByUserIdController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("getOrganizationByIdController", () => {
    it("should return the organization from req object with 200", async () => {
      const mockOrg = { id: "org-1", name: "Test Org" };
      mockReq.organization = mockOrg;

      await getOrganizationByIdController(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { organization: mockOrg },
      });
    });

    it("should call next when response building throws", async () => {
      const error = new Error("Response failed");
      mockReq.organization = { id: "org-1", name: "Test Org" };
      mockRes.status.mockImplementation(() => {
        throw error;
      });

      await getOrganizationByIdController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("updateOrganizationController", () => {
    it("should update organization and return 200", async () => {
      mockReq.params = { orgId: "org-1" };
      mockReq.body = { name: "Updated Org" };
      const mockUpdatedOrg = { id: "org-1", name: "Updated Org" };
      mockUpdateOrganizationService.mockResolvedValue(mockUpdatedOrg);

      await updateOrganizationController(mockReq, mockRes, mockNext);

      expect(mockUpdateOrganizationService).toHaveBeenCalledWith({
        orgId: "org-1",
        name: "Updated Org",
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { organization: mockUpdatedOrg },
      });
    });

    it("should call next with error if update fails", async () => {
      mockReq.params = { orgId: "org-1" };
      mockReq.body = { name: "Updated Org" };
      const error = new Error("Database error");
      mockUpdateOrganizationService.mockRejectedValue(error);

      await updateOrganizationController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("deleteOrganizationController", () => {
    it("should delete organization and return 200", async () => {
      mockReq.params = { orgId: "org-1" };
      const mockDeletedOrg = { id: "org-1", name: "Deleted Org" };
      mockDeleteOrganizationService.mockResolvedValue(mockDeletedOrg);

      await deleteOrganizationController(mockReq, mockRes, mockNext);

      expect(mockDeleteOrganizationService).toHaveBeenCalledWith({ orgId: "org-1" });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: "Organization deleted successfully",
        data: { organization: mockDeletedOrg },
      });
    });

    it("should call next with error if delete fails", async () => {
      mockReq.params = { orgId: "org-1" };
      const error = new Error("Database error");
      mockDeleteOrganizationService.mockRejectedValue(error);

      await deleteOrganizationController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("inviteMemberInOrganizationController", () => {
    it("should pass actor membership and roleId to the invite service", async () => {
      mockReq.params = { orgId: "org-1" };
      mockReq.body = { userId: "user-2", roleId: AGENT_ROLE.id };
      const membership = { id: "membership-1", role: AGENT_ROLE };
      mockInviteMemberInOrganizationService.mockResolvedValue(membership);

      await inviteMemberInOrganizationController(mockReq, mockRes, mockNext);

      expect(mockInviteMemberInOrganizationService).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        AGENT_ROLE.id,
        mockReq.membership,
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it("should call next if invite service throws", async () => {
      mockReq.params = { orgId: "org-1" };
      mockReq.body = { userId: "user-2", roleId: AGENT_ROLE.id };
      const error = new Error("Invite failed");
      mockInviteMemberInOrganizationService.mockRejectedValue(error);

      await inviteMemberInOrganizationController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("viewAllMembersInOrganizationController", () => {
    it("should return members and 200", async () => {
      mockReq.params = { orgId: "org-1" };
      const members = [{ id: "membership-1" }, { id: "membership-2" }];
      mockViewAllMembersInOrganizationService.mockResolvedValue(members);

      await viewAllMembersInOrganizationController(mockReq, mockRes, mockNext);

      expect(mockViewAllMembersInOrganizationService).toHaveBeenCalledWith(
        "org-1",
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { members },
      });
    });

    it("should call next if view members service throws", async () => {
      mockReq.params = { orgId: "org-1" };
      const error = new Error("Members failed");
      mockViewAllMembersInOrganizationService.mockRejectedValue(error);

      await viewAllMembersInOrganizationController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("updateMemberFromOrganizationController", () => {
    it("should pass actor membership and roleId to the update service", async () => {
      mockReq.params = { orgId: "org-1", userId: "user-2" };
      mockReq.body = { roleId: MEMBER_ROLE.id };
      const membership = { id: "membership-2", role: MEMBER_ROLE };
      mockUpdateMemberFromOrganizationService.mockResolvedValue(membership);

      await updateMemberFromOrganizationController(mockReq, mockRes, mockNext);

      expect(mockUpdateMemberFromOrganizationService).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        MEMBER_ROLE.id,
        mockReq.membership,
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should call next if update member service throws", async () => {
      mockReq.params = { orgId: "org-1", userId: "user-2" };
      mockReq.body = { roleId: MEMBER_ROLE.id };
      const error = new Error("Update member failed");
      mockUpdateMemberFromOrganizationService.mockRejectedValue(error);

      await updateMemberFromOrganizationController(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
