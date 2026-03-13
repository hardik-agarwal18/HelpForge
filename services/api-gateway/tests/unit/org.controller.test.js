import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ApiError } from "../../src/utils/errorHandler.js";

const mockCreateOrganizationService = jest.fn();
const mockGetOrganizationByUserIdService = jest.fn();
const mockUpdateOrganizationService = jest.fn();
const mockDeleteOrganizationService = jest.fn();
const mockInviteMemberInOrganizationService = jest.fn();
const mockUpdateMemberFromOrganizationService = jest.fn();
const mockViewAllMembersInOrganizationService = jest.fn();

// Mock the service
jest.unstable_mockModule(
  "../../src/modules/organization/org.service.js",
  () => ({
    createOrganizationService: mockCreateOrganizationService,
    getOrganizationByUserIdService: mockGetOrganizationByUserIdService,
    updateOrganizationService: mockUpdateOrganizationService,
    deleteOrganizationService: mockDeleteOrganizationService,
    inviteMemberInOrganizationService: mockInviteMemberInOrganizationService,
    updateMemberFromOrganizationService: mockUpdateMemberFromOrganizationService,
    viewAllMembersInOrganizationService: mockViewAllMembersInOrganizationService,
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
} = await import("../../src/modules/organization/org.controller.js");

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
      membership: { userId: "user-1", role: "OWNER" },
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

      expect(mockCreateOrganizationService).toHaveBeenCalledWith(
        "Test Org",
        "user-1",
      );
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
  });

  describe("updateOrganizationController", () => {
    it("should update organization and return 200", async () => {
      mockReq.params = { orgId: "org-1" };
      mockReq.body = { name: "Updated Org" };
      const mockUpdatedOrg = { id: "org-1", name: "Updated Org" };
      mockUpdateOrganizationService.mockResolvedValue(mockUpdatedOrg);

      await updateOrganizationController(mockReq, mockRes, mockNext);

      expect(mockUpdateOrganizationService).toHaveBeenCalledWith(
        "org-1",
        "Updated Org",
      );
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

      expect(mockDeleteOrganizationService).toHaveBeenCalledWith("org-1");
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
    it("should pass actor membership to the invite service", async () => {
      mockReq.params = { orgId: "org-1" };
      mockReq.body = { userId: "user-2", role: "agent" };
      const membership = { id: "membership-1", role: "AGENT" };
      mockInviteMemberInOrganizationService.mockResolvedValue(membership);

      await inviteMemberInOrganizationController(mockReq, mockRes, mockNext);

      expect(mockInviteMemberInOrganizationService).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        "agent",
        mockReq.membership,
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe("updateMemberFromOrganizationController", () => {
    it("should pass actor membership to the update service", async () => {
      mockReq.params = { orgId: "org-1", userId: "user-2" };
      mockReq.body = { role: "member" };
      const membership = { id: "membership-2", role: "MEMBER" };
      mockUpdateMemberFromOrganizationService.mockResolvedValue(membership);

      await updateMemberFromOrganizationController(mockReq, mockRes, mockNext);

      expect(mockUpdateMemberFromOrganizationService).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        "member",
        mockReq.membership,
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
