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
    return { token: response.body.data.token, id: response.body.data.user.id };
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
      });
      expect(membership.role).toBe("OWNER");
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

    beforeEach(async () => {
      // User 1 creates an organization (is OWNER)
      const res = await request(app)
        .post("/api/organizations")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ name: "My Startup" });

      orgId = res.body.data.organization.id;

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
            role: "ADMIN",
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
            role: "MEMBER",
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
          data: { userId: user2Id, organizationId: orgId, role: "ADMIN" },
        });
        await prisma.membership.create({
          data: { userId: user3Id, organizationId: orgId, role: "MEMBER" },
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
          .send({ userId: user2Id, role: "admin" })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.membership.role).toBe("ADMIN");

        const membership = await prisma.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: user2Id,
              organizationId: orgId,
            },
          },
        });

        expect(membership.role).toBe("ADMIN");
      });

      it("should allow ADMIN to invite an AGENT", async () => {
        await prisma.membership.create({
          data: {
            userId: user2Id,
            organizationId: orgId,
            role: "ADMIN",
          },
        });

        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ userId: user3Id, role: "agent" })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.membership.role).toBe("AGENT");
      });

      it("should reject invalid payload with 400", async () => {
        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ role: "ADMIN" })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation error");
      });

      it("should reject invalid role with 400", async () => {
        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ userId: user2Id, role: "viewer" })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation error");
      });

      it("should reject MEMBER from inviting with 403", async () => {
        await prisma.membership.create({
          data: {
            userId: user3Id,
            organizationId: orgId,
            role: "MEMBER",
          },
        });

        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user3Token}`)
          .send({ userId: user4Id, role: "MEMBER" })
          .expect(403);

        expect(response.body.success).toBe(false);
      });

      it("should reject ADMIN inviting another ADMIN with 403", async () => {
        await prisma.membership.create({
          data: {
            userId: user2Id,
            organizationId: orgId,
            role: "ADMIN",
          },
        });

        const response = await request(app)
          .post(`/api/organizations/${orgId}/members`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ userId: user3Id, role: "ADMIN" })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
          "You do not have permission to invite this role",
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
              role: "ADMIN",
            },
            {
              userId: user3Id,
              organizationId: orgId,
              role: "MEMBER",
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
              role: "ADMIN",
            },
            {
              userId: user3Id,
              organizationId: orgId,
              role: "AGENT",
            },
            {
              userId: user4Id,
              organizationId: orgId,
              role: "MEMBER",
            },
          ],
        });
      });

      it("should allow OWNER to update a member role", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user2Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ role: "agent" })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.membership.role).toBe("AGENT");
      });

      it("should allow ADMIN to update MEMBER to AGENT", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user4Id}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ role: "agent" })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.membership.role).toBe("AGENT");
      });

      it("should reject invalid role payload with 400", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user4Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ role: "viewer" })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Validation error");
      });

      it("should reject OWNER assigning OWNER with 400", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user2Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ role: "OWNER" })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
          "Cannot assign OWNER role to a member",
        );
      });

      it("should reject OWNER changing their own role with 400", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user1Id}`)
          .set("Authorization", `Bearer ${user1Token}`)
          .send({ role: "ADMIN" })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Owner cannot change their own role");
      });

      it("should reject ADMIN updating another ADMIN with 403", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user2Id}`)
          .set("Authorization", `Bearer ${user2Token}`)
          .send({ role: "MEMBER" })
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
          .send({ role: "ADMIN" })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe(
          "You cannot promote a member to your role or higher",
        );
      });

      it("should reject MEMBER from updating roles with 403", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${orgId}/members/${user3Id}`)
          .set("Authorization", `Bearer ${user4Token}`)
          .send({ role: "MEMBER" })
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });
  });
});
