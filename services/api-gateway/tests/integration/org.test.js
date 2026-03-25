import { describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import {
  cleanDatabase,
  disconnectDatabase,
  getTestPrisma,
} from "../helpers/dbHelper.js";

const prisma = getTestPrisma();

describe("Organization API Integration Tests", () => {
  let user1Token;
  let user1Id;
  let user2Token;
  let user2Id;

  const registerUser = async (email, name) => {
    const response = await request(app).post("/api/auth/register").send({
      email,
      password: "Password123!",
      name,
    });
    return { token: response.body.data.accessToken, id: response.body.data.user.id };
  };

  beforeEach(async () => {
    await cleanDatabase();

    // Create base users
    const u1 = await registerUser(
      `user1_${Date.now()}@example.com`,
      "User One",
    );
    user1Token = u1.token;
    user1Id = u1.id;

    const u2 = await registerUser(
      `user2_${Date.now()}@example.com`,
      "User Two",
    );
    user2Token = u2.token;
    user2Id = u2.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  describe("POST /api/organizations", () => {
    it("should return 401 without auth token", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .send({ name: "Unauth Org" })
        .expect(401);
      expect(response.body.success).toBe(false);
    });

    it("should return 400 if validation fails (e.g. no name)", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it("should create organization as OWNER and return 201", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ name: "User 1 Org" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.organization.name).toBe("User 1 Org");
      expect(response.body.data.organization.id).toBeDefined();

      // Ensure membership is OWNER
      const membership = await prisma.membership.findFirst({
        where: {
          userId: user1Id,
          organizationId: response.body.data.organization.id,
        },
        include: { role: true },
      });
      expect(membership.role.name).toBe("OWNER");
    });
  });

  describe("GET /api/organizations", () => {
    it("should retrieve empty list if user has no orgs", async () => {
      const response = await request(app)
        .get("/api/organizations")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.organizations).toHaveLength(0);
    });

    it("should retrieve ONLY user's organizations", async () => {
      // Create user 1 org
      await request(app)
        .post("/api/organizations")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ name: "Org 1" });

      // Create user 2 org
      await request(app)
        .post("/api/organizations")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({ name: "Org 2" });

      const response = await request(app)
        .get("/api/organizations")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.organizations).toHaveLength(1);
      expect(response.body.data.organizations[0].name).toBe("Org 1");
    });
  });

  describe("Single Organization Operations", () => {
    let orgId;
    let user3Token;
    let user3Id;
    let user4Token;
    let user4Id;
    let ownerRole;
    let adminRole;
    let agentRole;
    let memberRole;

    beforeEach(async () => {
      // User 1 creates an organization (is OWNER)
      const res = await request(app)
        .post("/api/organizations")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ name: "My Startup" });

      orgId = res.body.data.organization.id;

      // Look up roles created by the organization creation service
      const roles = await prisma.orgRole.findMany({
        where: { organizationId: orgId },
      });
      ownerRole = roles.find((r) => r.name === "OWNER");
      adminRole = roles.find((r) => r.name === "ADMIN");
      agentRole = roles.find((r) => r.name === "AGENT");
      memberRole = roles.find((r) => r.name === "MEMBER");

      const u3 = await registerUser(
        `user3_${Date.now()}@example.com`,
        "User Three",
      );
      user3Token = u3.token;
      user3Id = u3.id;

      const u4 = await registerUser(
        `user4_${Date.now()}@example.com`,
        "User Four",
      );
      user4Token = u4.token;
      user4Id = u4.id;
    });

    describe("GET /api/organizations/:orgId", () => {
      it("should return the organization if user is a member", async () => {
        const response = await request(app)
          .get(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.organization.name).toBe("My Startup");
      });

      it("should return 403 if user is not a member", async () => {
        const response = await request(app)
          .get(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });

    describe("PATCH /api/organizations/:orgId", () => {
      it("should allow OWNER to update the organization", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ name: "My Startup Updated" })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.organization.name).toBe("My Startup Updated");
      });

      it("should allow ADMIN to update the organization", async () => {
        // give user 2 ADMIN role via Prisma
        await prisma.membership.create({
          data: {
            userId: user2Id,
            organizationId: orgId,
            roleId: adminRole.id,
          },
        });

        const response = await request(app)
          .patch(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ name: "My Startup Admin Updated" })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.organization.name).toBe(
          "My Startup Admin Updated",
        );
      });

      it("should reject MEMBER from updating the organization with 403", async () => {
        // give user 3 MEMBER role
        await prisma.membership.create({
          data: {
            userId: user3Id,
            organizationId: orgId,
            roleId: memberRole.id,
          },
        });

        const response = await request(app)
          .patch(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user3Token}`)
          .send({ name: "Malicious Member Update" })
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });

    describe("DELETE /api/organizations/:orgId", () => {
      beforeEach(async () => {
        // attach user 2 as ADMIN, user 3 as MEMBER
        await prisma.membership.create({
          data: { userId: user2Id, organizationId: orgId, roleId: adminRole.id },
        });
        await prisma.membership.create({
          data: { userId: user3Id, organizationId: orgId, roleId: memberRole.id },
        });
      });

      it("should reject MEMBER from deleting", async () => {
        await request(app)
          .delete(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user3Token}`)
          .expect(403);
      });

      it("should reject ADMIN from deleting", async () => {
        await request(app)
          .delete(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .expect(403);
      });

      it("should allow OWNER to delete", async () => {
        const response = await request(app)
          .delete(`/api/organizations/${orgId}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .expect(200);

        expect(response.body.success).toBe(true);

        const checkOrg = await prisma.organization.findUnique({
          where: { id: orgId },
        });
        expect(checkOrg).toBeNull();
      });
    });

    describe("POST /api/organizations/:orgId/members", () => {
      it("should allow OWNER to invite an ADMIN", async () => {
        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ userId: user2Id, roleId: adminRole.id })
          .expect(201);

        expect(response.body.success).toBe(true);

        const membership = await prisma.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: user2Id,
              organizationId: orgId,
            },
          },
          include: { role: true },
        });

        expect(membership.role.name).toBe("ADMIN");
      });

      it("should allow ADMIN to invite an AGENT", async () => {
        await prisma.membership.create({
          data: {
            userId: user2Id,
            organizationId: orgId,
            roleId: adminRole.id,
          },
        });

        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ userId: user3Id, roleId: agentRole.id })
          .expect(201);

        expect(response.body.success).toBe(true);
      });

      it("should reject invalid payload with 400", async () => {
        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ roleId: adminRole.id })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation error");
      });

      it("should reject invalid roleId with 400", async () => {
        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ userId: user2Id, roleId: "not-a-uuid" })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation error");
      });

      it("should reject MEMBER from inviting with 403", async () => {
        await prisma.membership.create({
          data: {
            userId: user3Id,
            organizationId: orgId,
            roleId: memberRole.id,
          },
        });

        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user3Token}`)
          .send({ userId: user4Id, roleId: memberRole.id })
          .expect(403);

        expect(response.body.success).toBe(false);
      });

      it("should reject ADMIN inviting another ADMIN with 403", async () => {
        await prisma.membership.create({
          data: {
            userId: user2Id,
            organizationId: orgId,
            roleId: adminRole.id,
          },
        });

        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ userId: user3Id, roleId: adminRole.id })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
          "You cannot invite a member with a role equal to or higher than yours",
        );
      });
    });

    describe("GET /api/organizations/:orgId/members", () => {
      it("should return organization members for a member of the organization", async () => {
        await prisma.membership.createMany({
          data: [
            {
              userId: user2Id,
              organizationId: orgId,
              roleId: adminRole.id,
            },
            {
              userId: user3Id,
              organizationId: orgId,
              roleId: memberRole.id,
            },
          ],
        });

        const response = await request(app)
          .get(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user1Token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.members.length).toBe(3);
      });

      it("should reject non-member with 403", async () => {
        const response = await request(app)
          .get(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user2Token}`)
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });

    describe("PATCH /api/organizations/:orgId/members/:userId", () => {
      beforeEach(async () => {
        await prisma.membership.createMany({
          data: [
            {
              userId: user2Id,
              organizationId: orgId,
              roleId: adminRole.id,
            },
            {
              userId: user3Id,
              organizationId: orgId,
              roleId: agentRole.id,
            },
            {
              userId: user4Id,
              organizationId: orgId,
              roleId: memberRole.id,
            },
          ],
        });
      });

      it("should allow OWNER to update a member role", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user2Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ roleId: agentRole.id })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it("should allow ADMIN to update MEMBER to AGENT", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user4Id}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ roleId: agentRole.id })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it("should reject invalid roleId payload with 400", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user4Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ roleId: "not-a-uuid" })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation error");
      });

      it("should reject OWNER assigning OWNER role with 403", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user2Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ roleId: ownerRole.id })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
          "You cannot promote a member to your role level or higher",
        );
      });

      it("should reject OWNER changing their own role with 400", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user1Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ roleId: adminRole.id })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("You cannot change your own role");
      });

      it("should reject ADMIN updating another ADMIN with 403", async () => {
        // Promote user3 to ADMIN so we have two ADMINs
        await prisma.membership.update({
          where: { userId_organizationId: { userId: user3Id, organizationId: orgId } },
          data: { roleId: adminRole.id },
        });

        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user3Id}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ roleId: memberRole.id })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
          "You can only update members with a lower role than yours",
        );
      });

      it("should reject ADMIN promoting someone to ADMIN with 403", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user3Id}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ roleId: adminRole.id })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
          "You cannot promote a member to your role level or higher",
        );
      });

      it("should reject MEMBER from updating roles with 403", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user3Id}`)
          .set("Authorization", `Bearer ${user4Token}`)
          .send({ roleId: memberRole.id })
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });
  });
});
