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
const mockCreateOrganization = jest.fn();
const mockGetOrganizationsByUserId = jest.fn();
const mockPatchOrganization = jest.fn();
const mockDeleteOrganization = jest.fn();
const mockInviteMemberInOrganization = jest.fn();
const mockGetOrganizationMembersById = jest.fn();
const mockGetOrganizationMembershipByUserId = jest.fn();
const mockUpdateMembershipRole = jest.fn();
const mockFindOrganizationByOwner = jest.fn();
const mockGetOrgRoleById = jest.fn();
const mockGetOrgRoleByName = jest.fn();
const mockCreateOrgRoles = jest.fn();

const mockOrganizationCreate = jest.fn();
const mockMembershipCreate = jest.fn();
const mockOrganizationFindUnique = jest.fn();

// Mock the repository
jest.unstable_mockModule("../../../src/modules/organization/org.repo.js", () => ({
  createOrganization: mockCreateOrganization,
  getOrganizationsByUserId: mockGetOrganizationsByUserId,
  patchOrganization: mockPatchOrganization,
  deleteOrganization: mockDeleteOrganization,
  findOrganizationByOwner: mockFindOrganizationByOwner,
  inviteMemberInOrganization: mockInviteMemberInOrganization,
  getOrganizationMembersById: mockGetOrganizationMembersById,
  getOrganizationMembershipByUserId: mockGetOrganizationMembershipByUserId,
  updateMembershipRole: mockUpdateMembershipRole,
  getOrgRoleById: mockGetOrgRoleById,
  getOrgRoleByName: mockGetOrgRoleByName,
  getOrgRoles: jest.fn(),
  createOrgRoles: mockCreateOrgRoles,
  createOrgRole: jest.fn(),
  updateOrgRole: jest.fn(),
  deleteOrgRole: jest.fn(),
}));

// Mock the database config (used directly by createOrganizationService internals)
jest.unstable_mockModule("../../../src/config/database.config.js", () => ({
  default: {
    read: {
      organization: {
        findUnique: mockOrganizationFindUnique,
      },
    },
    write: {
      organization: {
        create: mockOrganizationCreate,
      },
      membership: {
        create: mockMembershipCreate,
      },
    },
  },
}));

// Import after mocking
const {
  createOrganizationService,
  inviteMemberInOrganizationService,
  getOrganizationByUserIdService,
  updateOrganizationService,
  deleteOrganizationService,
  viewAllMembersInOrganizationService,
  updateMemberFromOrganizationService,
} = await import("../../../src/modules/organization/org.service.js");

describe("Organization Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createOrganizationService", () => {
    it("should successfully create an organization with seeded roles", async () => {
      const mockOrg = {
        id: "org-1",
        name: "Test Org",
        memberships: [{ userId: "user-1", role: OWNER_ROLE }],
        roles: [OWNER_ROLE, ADMIN_ROLE, AGENT_ROLE, MEMBER_ROLE],
      };
      mockFindOrganizationByOwner.mockResolvedValue(null);
      mockOrganizationCreate.mockResolvedValue({ id: "org-1" });
      mockCreateOrgRoles.mockResolvedValue({ count: 4 });
      mockGetOrgRoleByName.mockResolvedValue(OWNER_ROLE);
      mockMembershipCreate.mockResolvedValue({ id: "mem-1" });
      mockOrganizationFindUnique.mockResolvedValue(mockOrg);

      const result = await createOrganizationService({ name: "Test Org", userId: "user-1" });

      expect(result).toEqual(mockOrg);
    });

    it("should throw ApiError if organization creation fails", async () => {
      mockFindOrganizationByOwner.mockResolvedValue(null);
      mockOrganizationCreate.mockResolvedValue({ id: "org-1" });
      mockCreateOrgRoles.mockResolvedValue({ count: 4 });
      mockGetOrgRoleByName.mockResolvedValue(OWNER_ROLE);
      mockMembershipCreate.mockResolvedValue({ id: "mem-1" });
      mockOrganizationFindUnique.mockResolvedValue(null);

      await expect(
        createOrganizationService({ name: "Test Org", userId: "user-1" }),
      ).rejects.toThrow(ApiError);
    });

    it("should throw ApiError if user already owns an organization", async () => {
      mockFindOrganizationByOwner.mockResolvedValue({ id: "existing-org" });

      await expect(
        createOrganizationService({ name: "Test Org", userId: "user-1" }),
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

      const result = await updateOrganizationService({ orgId: "org-1", name: "Updated Org" });

      expect(mockPatchOrganization).toHaveBeenCalledWith({ orgId: "org-1", name: "Updated Org" });
      expect(result).toEqual(mockUpdatedOrg);
    });

    it("should throw ApiError if organization update fails", async () => {
      mockPatchOrganization.mockResolvedValue(null);

      await expect(
        updateOrganizationService({ orgId: "org-1", name: "Updated Org" }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("deleteOrganizationService", () => {
    it("should successfully delete an organization", async () => {
      const mockDeletedOrg = { id: "org-1", name: "Deleted Org" };
      mockDeleteOrganization.mockResolvedValue(mockDeletedOrg);

      const result = await deleteOrganizationService({ orgId: "org-1" });

      expect(mockDeleteOrganization).toHaveBeenCalledWith({ orgId: "org-1" });
      expect(result).toEqual(mockDeletedOrg);
    });

    it("should throw ApiError if organization deletion fails", async () => {
      mockDeleteOrganization.mockResolvedValue(null);

      await expect(deleteOrganizationService({ orgId: "org-1" })).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe("inviteMemberInOrganizationService", () => {
    it("should allow owner to invite with a valid role", async () => {
      const mockMembership = { id: "membership-1", role: AGENT_ROLE };
      mockGetOrgRoleById.mockResolvedValue(AGENT_ROLE);
      mockInviteMemberInOrganization.mockResolvedValue(mockMembership);

      const result = await inviteMemberInOrganizationService(
        "org-1",
        "user-2",
        AGENT_ROLE.id,
        { userId: "user-1", role: OWNER_ROLE },
      );

      expect(mockGetOrgRoleById).toHaveBeenCalledWith(AGENT_ROLE.id);
      expect(mockInviteMemberInOrganization).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        AGENT_ROLE.id,
      );
      expect(result).toEqual(mockMembership);
    });

    it("should reject when roleId points to a role not in this organization", async () => {
      const foreignRole = { ...AGENT_ROLE, organizationId: "org-other" };
      mockGetOrgRoleById.mockResolvedValue(foreignRole);

      await expect(
        inviteMemberInOrganizationService(
          "org-1",
          "user-2",
          foreignRole.id,
          { userId: "user-1", role: OWNER_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid role for this organization",
      });
    });

    it("should reject when roleId does not exist", async () => {
      mockGetOrgRoleById.mockResolvedValue(null);

      await expect(
        inviteMemberInOrganizationService(
          "org-1",
          "user-2",
          "nonexistent-role-id",
          { userId: "user-1", role: OWNER_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid role for this organization",
      });
    });

    it("should reject admin inviting a role of equal or higher level", async () => {
      mockGetOrgRoleById.mockResolvedValue(ADMIN_ROLE);

      await expect(
        inviteMemberInOrganizationService(
          "org-1",
          "user-2",
          ADMIN_ROLE.id,
          { userId: "user-1", role: ADMIN_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("should reject agent trying to invite (lacks org:invite_member permission)", async () => {
      mockGetOrgRoleById.mockResolvedValue(MEMBER_ROLE);

      await expect(
        inviteMemberInOrganizationService(
          "org-1",
          "user-2",
          MEMBER_ROLE.id,
          { userId: "user-1", role: AGENT_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("should throw when invite repository call returns no membership", async () => {
      mockGetOrgRoleById.mockResolvedValue(MEMBER_ROLE);
      mockInviteMemberInOrganization.mockResolvedValue(null);

      await expect(
        inviteMemberInOrganizationService(
          "org-1",
          "user-2",
          MEMBER_ROLE.id,
          { userId: "user-1", role: OWNER_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed to invite member to organization",
      });
    });
  });

  describe("viewAllMembersInOrganizationService", () => {
    it("should return members when found", async () => {
      const members = [{ id: "membership-1" }, { id: "membership-2" }];
      mockGetOrganizationMembersById.mockResolvedValue(members);

      const result = await viewAllMembersInOrganizationService("org-1");

      expect(mockGetOrganizationMembersById).toHaveBeenCalledWith("org-1");
      expect(result).toEqual(members);
    });

    it("should return an empty array when repository returns null", async () => {
      mockGetOrganizationMembersById.mockResolvedValue(null);

      const result = await viewAllMembersInOrganizationService("org-1");

      expect(mockGetOrganizationMembersById).toHaveBeenCalledWith("org-1");
      expect(result).toEqual([]);
    });
  });

  describe("updateMemberFromOrganizationService", () => {
    it("should allow owner to demote admin to agent", async () => {
      const targetMembership = {
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: ADMIN_ROLE,
      };
      const updatedMembership = { ...targetMembership, role: AGENT_ROLE };
      mockGetOrganizationMembershipByUserId.mockResolvedValue(targetMembership);
      mockGetOrgRoleById.mockResolvedValue(AGENT_ROLE);
      mockUpdateMembershipRole.mockResolvedValue(updatedMembership);

      const result = await updateMemberFromOrganizationService(
        "org-1",
        "user-2",
        AGENT_ROLE.id,
        { userId: "user-1", role: OWNER_ROLE },
      );

      expect(mockGetOrganizationMembershipByUserId).toHaveBeenCalledWith(
        "org-1",
        "user-2",
      );
      expect(mockUpdateMembershipRole).toHaveBeenCalledWith(
        "org-1",
        "user-2",
        AGENT_ROLE.id,
      );
      expect(result).toEqual(updatedMembership);
    });

    it("should reject owner changing their own role", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-1",
        userId: "user-1",
        organizationId: "org-1",
        role: OWNER_ROLE,
      });
      mockGetOrgRoleById.mockResolvedValue(ADMIN_ROLE);

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-1",
          ADMIN_ROLE.id,
          { userId: "user-1", role: OWNER_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "You cannot change your own role",
      });
    });

    it("should reject agent updating any role (lacks org:manage_member permission)", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: MEMBER_ROLE,
      });
      mockGetOrgRoleById.mockResolvedValue(AGENT_ROLE);

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          AGENT_ROLE.id,
          { userId: "user-1", role: AGENT_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not have permission to update roles",
      });
    });

    it("should reject admin updating another admin (same level)", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: ADMIN_ROLE,
      });
      mockGetOrgRoleById.mockResolvedValue(MEMBER_ROLE);

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          MEMBER_ROLE.id,
          { userId: "user-1", role: ADMIN_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You can only update members with a lower role than yours",
      });
    });

    it("should reject assigning OWNER role through member update", async () => {
      // OWNER_ROLE has level 100, same as actor, so the level check fires first
      // with a 403 "You cannot promote a member to your role level or higher"
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: ADMIN_ROLE,
      });
      mockGetOrgRoleById.mockResolvedValue(OWNER_ROLE);

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          OWNER_ROLE.id,
          { userId: "user-1", role: OWNER_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You cannot promote a member to your role level or higher",
      });
    });

    it("should reject admin promoting someone to admin level or higher", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: AGENT_ROLE,
      });
      mockGetOrgRoleById.mockResolvedValue(ADMIN_ROLE);

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          ADMIN_ROLE.id,
          { userId: "user-1", role: ADMIN_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You cannot promote a member to your role level or higher",
      });
    });

    it("should reject when target membership is not found", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue(null);

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          MEMBER_ROLE.id,
          { userId: "user-1", role: OWNER_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Member not found in organization",
      });
    });

    it("should throw when updated membership is missing after repo update", async () => {
      mockGetOrganizationMembershipByUserId.mockResolvedValue({
        id: "membership-2",
        userId: "user-2",
        organizationId: "org-1",
        role: AGENT_ROLE,
      });
      mockGetOrgRoleById.mockResolvedValue(MEMBER_ROLE);
      mockUpdateMembershipRole.mockResolvedValue(null);

      await expect(
        updateMemberFromOrganizationService(
          "org-1",
          "user-2",
          MEMBER_ROLE.id,
          { userId: "user-1", role: OWNER_ROLE },
        ),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed to update member in organization",
      });
    });
  });
});
