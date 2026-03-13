import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ApiError } from "../../src/utils/errorHandler.js";

const mockCreateOrganization = jest.fn();
const mockGetOrganizationsByUserId = jest.fn();
const mockPatchOrganization = jest.fn();
const mockDeleteOrganization = jest.fn();

// Mock the repository
jest.unstable_mockModule("../../src/modules/organization/org.repo.js", () => ({
  createOrganization: mockCreateOrganization,
  getOrganizationsByUserId: mockGetOrganizationsByUserId,
  patchOrganization: mockPatchOrganization,
  deleteOrganization: mockDeleteOrganization,
}));

// Import after mocking
const {
  createOrganizationService,
  getOrganizationByUserIdService,
  updateOrganizationService,
  deleteOrganizationService,
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
});
