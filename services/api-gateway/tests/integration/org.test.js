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
  });
});
