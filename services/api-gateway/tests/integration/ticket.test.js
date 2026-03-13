import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../../src/app.js";
import config from "../../src/config/index.js";
import {
  cleanDatabase,
  createTestUser,
  disconnectDatabase,
  getTestPrisma,
} from "../helpers/dbHelper.js";

const prisma = getTestPrisma();

describe("Ticket API Integration Tests", () => {
  let user1;
  let user2;
  let user3;
  let user1Token;
  let user2Token;
  let user3Token;
  let organization;

  const signToken = (user) =>
    jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, {
      expiresIn: "7d",
    });

  beforeEach(async () => {
    await cleanDatabase();

    user1 = await createTestUser({
      email: `owner_${Date.now()}@example.com`,
      name: "Owner User",
    });
    user2 = await createTestUser({
      email: `agent_${Date.now()}@example.com`,
      name: "Agent User",
    });
    user3 = await createTestUser({
      email: `external_${Date.now()}@example.com`,
      name: "External User",
    });

    user1Token = signToken(user1);
    user2Token = signToken(user2);
    user3Token = signToken(user3);

    organization = await prisma.organization.create({
      data: {
        name: `Org_${Date.now()}`,
        memberships: {
          create: [
            {
              userId: user1.id,
              role: "OWNER",
            },
            {
              userId: user2.id,
              role: "AGENT",
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  describe("POST /api/tickets", () => {
    it("should create a ticket for an organization member", async () => {
      const response = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          organizationId: organization.id,
          title: "Login issue",
          description: "Customer cannot log in",
          priority: "high",
          source: "web",
          assignedToId: user2.id,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.title).toBe("Login issue");
      expect(response.body.data.ticket.priority).toBe("HIGH");
      expect(response.body.data.ticket.source).toBe("WEB");

      const ticket = await prisma.ticket.findUnique({
        where: { id: response.body.data.ticket.id },
        include: { activities: true },
      });

      expect(ticket).not.toBeNull();
      expect(ticket.createdById).toBe(user1.id);
      expect(ticket.assignedToId).toBe(user2.id);
      expect(ticket.activities).toHaveLength(1);
      expect(ticket.activities[0].action).toBe("TICKET_CREATED");
    });

    it("should return 400 for invalid payload", async () => {
      const response = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          organizationId: organization.id,
          priority: "critical",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation error");
    });

    it("should return 403 for a user outside the organization", async () => {
      const response = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${user3Token}`)
        .send({
          organizationId: organization.id,
          title: "Login issue",
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to create tickets for this organization",
      );
    });

    it("should return 400 when assigned user is outside the organization", async () => {
      const response = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          organizationId: organization.id,
          title: "Login issue",
          assignedToId: user3.id,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Assigned user must be a member of the organization",
      );
    });
  });
});
