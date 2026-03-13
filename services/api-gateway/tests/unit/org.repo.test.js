import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockOrganizationCreate = jest.fn();
const mockOrganizationFindMany = jest.fn();
const mockOrganizationUpdate = jest.fn();
const mockOrganizationDelete = jest.fn();
const mockMembershipCreate = jest.fn();
const mockMembershipFindMany = jest.fn();
const mockMembershipFindUnique = jest.fn();
const mockMembershipUpdate = jest.fn();
const mockMembershipDeleteMany = jest.fn();
const mockTransaction = jest.fn();

jest.unstable_mockModule("../../src/config/database.config.js", () => ({
  default: {
    organization: {
      create: mockOrganizationCreate,
      findMany: mockOrganizationFindMany,
      update: mockOrganizationUpdate,
      delete: mockOrganizationDelete,
    },
    membership: {
      create: mockMembershipCreate,
      findMany: mockMembershipFindMany,
      findUnique: mockMembershipFindUnique,
      update: mockMembershipUpdate,
      deleteMany: mockMembershipDeleteMany,
    },
    $transaction: mockTransaction,
  },
}));

const {
  createOrganization,
  deleteOrganization,
  getOrganizationMembersById,
  getOrganizationMembershipByUserId,
  getOrganizationsByUserId,
  inviteMemberInOrganization,
  patchOrganization,
  updateMembershipRole,
} = await import("../../src/modules/organization/org.repo.js");

describe("Organization Repo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create an organization with an owner membership", async () => {
    const created = { id: "org-1" };
    mockOrganizationCreate.mockResolvedValue(created);

    const result = await createOrganization("Test Org", "user-1");

    expect(mockOrganizationCreate).toHaveBeenCalledWith({
      data: {
        name: "Test Org",
        memberships: {
          create: {
            userId: "user-1",
            role: "OWNER",
          },
        },
      },
      include: {
        memberships: true,
      },
    });
    expect(result).toBe(created);
  });

  it("should get organizations by user id", async () => {
    const organizations = [{ id: "org-1" }];
    mockOrganizationFindMany.mockResolvedValue(organizations);

    const result = await getOrganizationsByUserId("user-1");

    expect(mockOrganizationFindMany).toHaveBeenCalledWith({
      where: {
        memberships: {
          some: {
            userId: "user-1",
          },
        },
      },
    });
    expect(result).toBe(organizations);
  });

  it("should patch an organization name", async () => {
    const updated = { id: "org-1", name: "Updated Org" };
    mockOrganizationUpdate.mockResolvedValue(updated);

    const result = await patchOrganization("org-1", "Updated Org");

    expect(mockOrganizationUpdate).toHaveBeenCalledWith({
      where: {
        id: "org-1",
      },
      data: {
        name: "Updated Org",
      },
    });
    expect(result).toBe(updated);
  });

  it("should delete an organization inside a transaction", async () => {
    const deleted = { id: "org-1" };
    mockMembershipDeleteMany.mockResolvedValue({ count: 2 });
    mockOrganizationDelete.mockResolvedValue(deleted);
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        membership: {
          deleteMany: mockMembershipDeleteMany,
        },
        organization: {
          delete: mockOrganizationDelete,
        },
      }),
    );

    const result = await deleteOrganization("org-1");

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockMembershipDeleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
    });
    expect(mockOrganizationDelete).toHaveBeenCalledWith({
      where: {
        id: "org-1",
      },
    });
    expect(result).toBe(deleted);
  });

  it("should invite a member with an explicit role", async () => {
    const membership = { id: "membership-1", role: "AGENT" };
    mockMembershipCreate.mockResolvedValue(membership);

    const result = await inviteMemberInOrganization("org-1", "user-2", "AGENT");

    expect(mockMembershipCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        userId: "user-2",
        role: "AGENT",
      },
    });
    expect(result).toBe(membership);
  });

  it("should default invited member role to MEMBER when role is missing", async () => {
    mockMembershipCreate.mockResolvedValue({ id: "membership-1", role: "MEMBER" });

    await inviteMemberInOrganization("org-1", "user-2");

    expect(mockMembershipCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        userId: "user-2",
        role: "MEMBER",
      },
    });
  });

  it("should get all members for an organization", async () => {
    const members = [{ id: "membership-1" }];
    mockMembershipFindMany.mockResolvedValue(members);

    const result = await getOrganizationMembersById("org-1");

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
      include: {
        user: true,
      },
    });
    expect(result).toBe(members);
  });

  it("should get one membership by organization and user id", async () => {
    const membership = { id: "membership-1" };
    mockMembershipFindUnique.mockResolvedValue(membership);

    const result = await getOrganizationMembershipByUserId("org-1", "user-2");

    expect(mockMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-2",
          organizationId: "org-1",
        },
      },
    });
    expect(result).toBe(membership);
  });

  it("should update a membership role", async () => {
    const membership = { id: "membership-1", role: "ADMIN" };
    mockMembershipUpdate.mockResolvedValue(membership);

    const result = await updateMembershipRole("org-1", "user-2", "ADMIN");

    expect(mockMembershipUpdate).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-2",
          organizationId: "org-1",
        },
      },
      data: { role: "ADMIN" },
    });
    expect(result).toBe(membership);
  });
});
