import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Setup mocks first
const mockFindUnique = jest.fn();

// Mock prisma properly for ES modules
jest.unstable_mockModule("../../src/config/database.config.js", () => ({
  default: {
    membership: {
      findUnique: mockFindUnique,
    },
  },
}));

// Import after mocking
const {
  verifyOrganizationMembership,
  requireRole,
  requireOwnerOrAdmin,
  requireOwner,
} = await import("../../src/modules/organization/org.middleware.js");

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
      mockFindUnique.mockResolvedValue(null);

      await verifyOrganizationMembership(mockReq, mockRes, mockNext);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: "user-1",
            organizationId: "org-1",
          },
        },
        include: {
          organization: true,
        },
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
        role: "MEMBER",
        organization: { id: "org-1", name: "Test Org" },
      };
      
      mockFindUnique.mockResolvedValue(mockMembership);

      await verifyOrganizationMembership(mockReq, mockRes, mockNext);

      expect(mockReq.organization).toEqual(mockMembership.organization);
      expect(mockReq.membership).toEqual(mockMembership);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should call next with error if exception is thrown", async () => {
      mockReq.params.orgId = "org-1";
      const error = new Error("DB Error");
      mockFindUnique.mockRejectedValue(error);

      await verifyOrganizationMembership(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("requireRole", () => {
    it("should return 500 if membership is not verified beforehand", () => {
      const middleware = requireRole("OWNER");
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "Organization membership not verified",
      });
    });

    it("should return 403 if user role is not allowed", () => {
      mockReq.membership = { role: "MEMBER" };
      const middleware = requireRole("ADMIN", "OWNER");
      
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "You do not have permission to perform this action",
      });
    });

    it("should call next if user has an allowed role", () => {
      mockReq.membership = { role: "ADMIN" };
      const middleware = requireRole("ADMIN", "OWNER");
      
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("requireOwnerOrAdmin", () => {
    it("should pass for OWNER role", () => {
      mockReq.membership = { role: "OWNER" };
      requireOwnerOrAdmin(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should pass for ADMIN role", () => {
      mockReq.membership = { role: "ADMIN" };
      requireOwnerOrAdmin(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should fail for MEMBER role", () => {
      mockReq.membership = { role: "MEMBER" };
      requireOwnerOrAdmin(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireOwner", () => {
    it("should pass for OWNER role", () => {
      mockReq.membership = { role: "OWNER" };
      requireOwner(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should fail for ADMIN role", () => {
      mockReq.membership = { role: "ADMIN" };
      requireOwner(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});
