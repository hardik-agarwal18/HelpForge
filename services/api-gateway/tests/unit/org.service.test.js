import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ApiError } from "../../src/utils/errorHandler.js";

const mockCreateOrganization = jest.fn();
const mockGetOrganizationsByUserId = jest.fn();
const mockPatchOrganization = jest.fn();
const mockDeleteOrganization = jest.fn();
const mockInviteMemberInOrganization = jest.fn();
const mockGetOrganizationMembersById = jest.fn();
const mockGetOrganizationMembershipByUserId = jest.fn();
const mockUpdateMembershipRole = jest.fn();

// Mock the repository
jest.unstable_mockModule("../../src/modules/organization/org.repo.js", () => ({
  createOrganization: mockCreateOrganization,
  getOrganizationsByUserId: mockGetOrganizationsByUserId,
  patchOrganization: mockPatchOrganization,
  deleteOrganization: mockDeleteOrganization,
  inviteMemberInOrganization: mockInviteMemberInOrganization,
  getOrganizationMembersById: mockGetOrganizationMembersById,
  getOrganizationMembershipByUserId: mockGetOrganizationMembershipByUserId,
  updateMembershipRole: mockUpdateMembershipRole,
}));

// Import after mocking
const {
  createOrganizationService,
  inviteMemberInOrganizationService,
  getOrganizationByUserIdService,
  updateOrganizationService,
  deleteOrganizationService,
  updateMemberFromOrganizationService,
} = await import("../../src/modules/organization/org.service.js");

describe("Organization Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createOrganizationService", () => {
    it("should successfully create an organization", async () => {
      const mockOrg = { id: "org-1", name: "Test Org" };
      mockCreateOrganization.mockResolvedValue(mockOrg);

      const result = await createOrganizationService("Test Org", "user-1");

      expect(mockCreateOrganization).toHaveBeenCalledWith("Test Org", "user-1");
      expect(result).toEqual(mockOrg);
    });

    it("should throw ApiError if organization creation fails", async () => {
      mockCreateOrganization.mockResolvedValue(null);

      await expect(
        createOrganizationService("Test Org", "user-1"),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("getOrganizationByUserIdService", () => {
    it("should successfully retrieve organizations", async () => {
      const mockOrgs = [
        { id: "org-1", name: "Test Org" },
        { id: "org-2", name: "Test Org 2" },
      ];
      mockGetOrganizationsByUserId.mockResolvedValue(mockOrgs);

      const result = await getOrganizationByUserIdService("user-1");

      expect(mockGetOrganizationsByUserId).toHaveBeenCalledWith("user-1");
      expect(result).toEqual(mockOrgs);
    });

    it("should return an empty array if no organizations found", async () => {
      mockGetOrganizationsByUserId.mockResolvedValue(null);

      const result = await getOrganizationByUserIdService("user-1");

      expect(mockGetOrganizationsByUserId).toHaveBeenCalledWith("user-1");
      expect(result).toEqual([]);
    });
  });

  describe("updateOrganizationService", () => {
    it("should successfully update an organization", async () => {
      const mockUpdatedOrg = { id: "org-1", name: "Updated Org" };
      mockPatchOrganization.mockResolvedValue(mockUpdatedOrg);

      const result = await updateOrganizationService("org-1", "Updated Org");

      expect(mockPatchOrganization).toHaveBeenCalledWith(
        "org-1",
        "Updated Org",
      );
      expect(result).toEqual(mockUpdatedOrg);
    });

    it("should throw ApiError if organization update fails", async () => {
      mockPatchOrganization.mockResolvedValue(null);

      await expect(
        updateOrganizationService("org-1", "Updated Org"),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("deleteOrganizationService", () => {
    it("should successfully delete an organization", async () => {
      const mockDeletedOrg = { id: "org-1", name: "Deleted Org" };
      mockDeleteOrganization.mockResolvedValue(mockDeletedOrg);

      const result = await deleteOrganizationService("org-1");

      expect(mockDeleteOrganization).toHaveBeenCalledWith("org-1");
      expect(result).toEqual(mockDeletedOrg);
    });

    it("should throw ApiError if organization deletion fails", async () => {
      mockDeleteOrganization.mockResolvedValue(null);

      await expect(deleteOrganizationService("org-1")).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe("inviteMemberInOrganizationService", () => {
    it("should allow owner to invite an admin and normalize role", async () => {
      const mockMembership = { id: "membership-1", role: "ADMIN" };
      mockInviteMemberInOrganization.mockResolvedValue(mockMembership);

      const result = await inviteMemberInOrganizationService(
        "org-1",
        "user-2",
        "admin",
        { userId: "user-1", role: "OWNER" },
      );

      expect(mockInviteMemberInOrganization).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        "ADMIN",
      );
      expect(result).toEqual(mockMembership);
    });

    it("should reject admin inviting another admin", async () => {
      await expect(
        inviteMemberInOrganizationService(
          "org-1",
          "user-2",
          "ADMIN",
          { userId: "user-1", role: "ADMIN" },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to invite this role",
      });
    });
  });

  describe("updateMemberFromOrganizationService", () => {
    it("should allow owner to demote admin to agent", async () => {
      const targetMembership = {
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: "ADMIN",
      };
      const updatedMembership = { ...targetMembership, role: "AGENT" };
      mockGetOrganizationMembershipByUserId.mockResolvedValue(targetMembership);
      mockUpdateMembershipRole.mockResolvedValue(updatedMembership);

      const result = await updateMemberFromOrganizationService(
        "org-1",
        "user-2",
        "agent",
        { userId: "user-1", role: "OWNER" },
      );

      expect(mockGetOrganizationMembershipByUserId).toHaveBeenCalledWith(
        "org-1",
        "user-2",
      );
      expect(mockUpdateMembershipRole).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        "AGENT",
      );
      expect(result).toEqual(updatedMembership);
    });

    it("should reject owner changing their own role", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-1",
        userId: "user-1",
        organizationId: "org-1",
        role: "OWNER",
      });

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-1",
          "ADMIN",
          { userId: "user-1", role: "OWNER" },
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Owner cannot change their own role",
      });
    });

    it("should reject admin updating another admin", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: "ADMIN",
      });

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          "MEMBER",
          { userId: "user-1", role: "ADMIN" },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You can only update members with a lower role than yours",
      });
    });

    it("should reject admin promoting someone to admin", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: "AGENT",
      });

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          "ADMIN",
          { userId: "user-1", role: "ADMIN" },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You cannot promote a member to your role or higher",
      });
    });
  });
});
