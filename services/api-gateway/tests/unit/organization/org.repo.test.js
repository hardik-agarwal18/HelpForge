import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
} from "../../../src/modules/organization/org.constants.js";

const rolePermissionInclude = {
  include: {
    rolePermissions: {
      include: {
        permission: true,
      },
    },
  },
};

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

const MEMBER_ROLE = {
  id: "role-member",
  name: "MEMBER",
  permissions: [PERMISSIONS.ORG_VIEW_MEMBERS],
  level: 10,
  isSystem: true,
  organizationId: "org-1",
};

const withRolePermissions = (role) => ({
  ...role,
  rolePermissions: role.permissions.map((name) => ({
    permission: {
      name,
    },
  })),
});

// ── Mocks ───────────────────────────────────────────────────────────
const mockOrganizationCreate = jest.fn();
const mockOrganizationFindMany = jest.fn();
const mockOrganizationFindFirst = jest.fn();
const mockOrganizationUpdate = jest.fn();
const mockOrganizationDelete = jest.fn();
const mockMembershipCreate = jest.fn();
const mockMembershipFindMany = jest.fn();
const mockMembershipFindFirst = jest.fn();
const mockMembershipFindUnique = jest.fn();
const mockMembershipUpdate = jest.fn();
const mockMembershipDeleteMany = jest.fn();
const mockOrgRoleDeleteMany = jest.fn();
const mockTransaction = jest.fn();
const mockInvalidateUserPermissionSnapshot = jest.fn();
const mockGetCachedOrganizationMembership = jest.fn();
const mockSetCachedOrganizationMembership = jest.fn();
const mockInvalidateOrganizationMembershipCache = jest.fn();
const mockInvalidateOrganizationMembershipCacheByOrg = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.repo.js", () => ({
  invalidateUserPermissionSnapshot: mockInvalidateUserPermissionSnapshot,
}));

jest.unstable_mockModule("../../../src/modules/organization/org.cache.js", () => ({
  getCachedOrganizationMembership: mockGetCachedOrganizationMembership,
  setCachedOrganizationMembership: mockSetCachedOrganizationMembership,
  invalidateOrganizationMembershipCache: mockInvalidateOrganizationMembershipCache,
  invalidateOrganizationMembershipCacheByOrg: mockInvalidateOrganizationMembershipCacheByOrg,
}));

jest.unstable_mockModule("../../../src/config/database.config.js", () => ({
  default: {
    read: {
      organization: {
        findMany: mockOrganizationFindMany,
        findFirst: mockOrganizationFindFirst,
      },
      membership: {
        findMany: mockMembershipFindMany,
        findFirst: mockMembershipFindFirst,
        findUnique: mockMembershipFindUnique,
      },
    },
    write: {
      organization: {
        create: mockOrganizationCreate,
        update: mockOrganizationUpdate,
        delete: mockOrganizationDelete,
      },
      membership: {
        create: mockMembershipCreate,
        update: mockMembershipUpdate,
        deleteMany: mockMembershipDeleteMany,
      },
      $transaction: mockTransaction,
    },
  },
}));

const {
  createOrganization,
  deleteOrganization,
  findOrganizationByOwner,
  getOrganizationMembersById,
  getOrganizationMembershipByUserId,
  getOrganizationsByUserId,
  getUserMembershipInOrganization,
  inviteMemberInOrganization,
  patchOrganization,
  updateMembershipRole,
} = await import("../../../src/modules/organization/org.repo.js");

describe("Organization Repo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedOrganizationMembership.mockResolvedValue(null);
  });

  it("should create an organization with an owner membership using roleId", async () => {
    const created = {
      id: "org-1",
      memberships: [{ role: withRolePermissions(OWNER_ROLE) }],
    };
    mockOrganizationCreate.mockResolvedValue(created);

    const result = await createOrganization({
      name: "Test Org",
      userId: "user-1",
      ownerRoleId: OWNER_ROLE.id,
    });

    expect(mockOrganizationCreate).toHaveBeenCalledWith({
      data: {
        name: "Test Org",
        memberships: {
          create: {
            userId: "user-1",
            roleId: OWNER_ROLE.id,
          },
        },
      },
      include: {
        memberships: { include: { role: rolePermissionInclude } },
      },
    });
    expect(result).toEqual({
      ...created,
      memberships: [{ role: OWNER_ROLE }],
    });
  });

  it("should get organizations by user id", async () => {
    const memberships = [
      { organization: { id: "org-1" } },
      { organization: { id: "org-2" } },
    ];
    mockMembershipFindMany.mockResolvedValue(memberships);

    const result = await getOrganizationsByUserId("user-1");

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
      },
      select: {
        organization: true,
      },
    });
    expect(result).toEqual([{ id: "org-1" }, { id: "org-2" }]);
  });

  it("should patch an organization name and include memberships with roles", async () => {
    const updated = {
      id: "org-1",
      name: "Updated Org",
      memberships: [{ role: withRolePermissions(OWNER_ROLE) }],
    };
    mockOrganizationUpdate.mockResolvedValue(updated);

    const result = await patchOrganization({ orgId: "org-1", name: "Updated Org" });

    expect(mockOrganizationUpdate).toHaveBeenCalledWith({
      where: {
        id: "org-1",
      },
      data: {
        name: "Updated Org",
      },
      include: { memberships: { include: { role: rolePermissionInclude } } },
    });
    expect(result).toEqual({
      ...updated,
      memberships: [{ role: OWNER_ROLE }],
    });
  });

  it("should find organization by owner using role relation filter", async () => {
    const membership = {
      organization: { id: "org-1" },
    };
    mockMembershipFindFirst.mockResolvedValue(membership);

    const result = await findOrganizationByOwner({ userId: "user-1" });

    expect(mockMembershipFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        role: { name: "OWNER", isSystem: true },
      },
      select: {
        organization: true,
      },
    });
    expect(result).toEqual({ id: "org-1" });
  });

  it("should delete an organization inside a transaction (memberships + roles + org)", async () => {
    const deleted = { id: "org-1" };
    const memberships = [{ userId: "user-1" }, { userId: "user-2" }];
    mockMembershipFindMany.mockResolvedValue(memberships);
    mockMembershipDeleteMany.mockResolvedValue({ count: 2 });
    mockOrgRoleDeleteMany.mockResolvedValue({ count: 4 });
    mockOrganizationDelete.mockResolvedValue(deleted);
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        membership: {
          findMany: mockMembershipFindMany,
          deleteMany: mockMembershipDeleteMany,
        },
        orgRole: {
          deleteMany: mockOrgRoleDeleteMany,
        },
        organization: {
          delete: mockOrganizationDelete,
        },
      }),
    );

    const result = await deleteOrganization({ orgId: "org-1" });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
      select: {
        userId: true,
      },
    });
    expect(mockMembershipDeleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
    });
    expect(mockOrgRoleDeleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
    });
    expect(mockOrganizationDelete).toHaveBeenCalledWith({
      where: {
        id: "org-1",
      },
    });
    expect(mockInvalidateOrganizationMembershipCacheByOrg).toHaveBeenCalledWith("org-1");
    expect(mockInvalidateUserPermissionSnapshot).toHaveBeenCalledTimes(2);
    expect(mockInvalidateUserPermissionSnapshot).toHaveBeenNthCalledWith(
      1,
      "user-1",
    );
    expect(mockInvalidateUserPermissionSnapshot).toHaveBeenNthCalledWith(
      2,
      "user-2",
    );
    expect(result).toBe(deleted);
  });

  it("should invite a member with a roleId", async () => {
    const membership = {
      id: "membership-1",
      role: withRolePermissions(AGENT_ROLE),
    };
    mockMembershipCreate.mockResolvedValue(membership);

    const result = await inviteMemberInOrganization("org-1", "user-2", AGENT_ROLE.id);

    expect(mockMembershipCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        userId: "user-2",
        roleId: AGENT_ROLE.id,
      },
      include: { role: rolePermissionInclude },
    });
    expect(result).toEqual({
      ...membership,
      role: AGENT_ROLE,
    });
  });

  it("should get all members for an organization including role", async () => {
    const members = [{ id: "membership-1", role: withRolePermissions(OWNER_ROLE) }];
    mockMembershipFindMany.mockResolvedValue(members);

    const result = await getOrganizationMembersById("org-1");

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
      include: {
        user: true,
        role: rolePermissionInclude,
      },
    });
    expect(result).toEqual([{ id: "membership-1", role: OWNER_ROLE }]);
  });

  it("should get one membership by organization and user id including role", async () => {
    const membership = { id: "membership-1", role: withRolePermissions(AGENT_ROLE) };
    mockMembershipFindUnique.mockResolvedValue(membership);

    const result = await getOrganizationMembershipByUserId("org-1", "user-2");

    expect(mockMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-2",
          organizationId: "org-1",
        },
      },
      include: { role: rolePermissionInclude },
    });
    expect(result).toEqual({ id: "membership-1", role: AGENT_ROLE });
  });

  it("should get user membership in organization including organization and role", async () => {
    const membership = {
      id: "membership-1",
      role: withRolePermissions(MEMBER_ROLE),
      organization: { id: "org-1", name: "Test Org" },
    };
    mockMembershipFindUnique.mockResolvedValue(membership);

    const result = await getUserMembershipInOrganization({
      userId: "user-1",
      orgId: "org-1",
    });

    expect(mockMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-1",
          organizationId: "org-1",
        },
      },
      include: { organization: true, role: rolePermissionInclude },
    });
    expect(result).toEqual({
      id: "membership-1",
      role: MEMBER_ROLE,
      organization: { id: "org-1", name: "Test Org" },
    });
  });

  it("should update a membership role using roleId", async () => {
    const membership = { id: "membership-1", role: withRolePermissions(ADMIN_ROLE) };
    mockMembershipUpdate.mockResolvedValue(membership);

    const result = await updateMembershipRole("org-1", "user-2", ADMIN_ROLE.id);

    expect(mockMembershipUpdate).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-2",
          organizationId: "org-1",
        },
      },
      data: { roleId: ADMIN_ROLE.id },
      include: { role: rolePermissionInclude },
    });
    expect(result).toEqual({ id: "membership-1", role: ADMIN_ROLE });
  });
});
