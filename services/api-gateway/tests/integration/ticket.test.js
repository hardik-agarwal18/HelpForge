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
  let user4;
  let user1Token;
  let user2Token;
  let user3Token;
  let user4Token;
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
    user4 = await createTestUser({
      email: `member_${Date.now()}@example.com`,
      name: "Member User",
    });

    user1Token = signToken(user1);
    user2Token = signToken(user2);
    user3Token = signToken(user3);
    user4Token = signToken(user4);

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
            {
              userId: user4.id,
              role: "MEMBER",
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

  describe("GET /api/tickets", () => {
    let ticket1;
    let ticket2;

    beforeEach(async () => {
      ticket1 = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Login issue",
          priority: "HIGH",
          status: "OPEN",
          source: "WEB",
          createdById: user1.id,
          assignedToId: user2.id,
        },
      });

      ticket2 = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Billing bug",
          priority: "LOW",
          status: "RESOLVED",
          source: "EMAIL",
          createdById: user1.id,
        },
      });
    });

    it("should return all tickets for elevated roles", async () => {
      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .query({ organizationId: organization.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tickets).toHaveLength(2);
    });

    it("should only return created or assigned tickets for members", async () => {
      await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Member created ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
        },
      });

      await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Member assigned ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user1.id,
          assignedToId: user4.id,
        },
      });

      await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Hidden from member",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user1.id,
          assignedToId: user2.id,
        },
      });

      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user4Token}`)
        .query({ organizationId: organization.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tickets).toHaveLength(2);
      expect(response.body.data.tickets.every((ticket) =>
        ["Member created ticket", "Member assigned ticket"].includes(ticket.title),
      )).toBe(true);
    });

    it("should filter tickets by query params", async () => {
      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .query({
          organizationId: organization.id,
          status: "open",
          priority: "high",
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tickets).toHaveLength(1);
      expect(response.body.data.tickets[0].id).toBe(ticket1.id);
    });

    it("should return 400 when organizationId is missing", async () => {
      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Organization ID is required");
    });

    it("should return 400 for invalid filters", async () => {
      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .query({
          organizationId: organization.id,
          status: "pending",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Invalid status");
    });

    it("should return 403 for a user outside the organization", async () => {
      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user3Token}`)
        .query({ organizationId: organization.id })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to view tickets for this organization",
      );
    });
  });

  describe("GET /api/tickets/:ticketId", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Single ticket lookup",
          description: "Fetch this ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user1.id,
          assignedToId: user2.id,
          comments: {
            create: {
              authorId: user1.id,
              message: "Initial note",
            },
          },
        },
      });
    });

    it("should return a ticket for elevated roles", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.id).toBe(ticket.id);
      expect(response.body.data.ticket.comments).toHaveLength(1);
    });

    it("should allow members to view tickets they created and hide internal comments", async () => {
      const memberTicket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Member ticket",
          description: "Created by member",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          comments: {
            create: [
              {
                authorId: user1.id,
                message: "Public note",
                isInternal: false,
              },
              {
                authorId: user1.id,
                message: "Internal note",
                isInternal: true,
              },
            ],
          },
        },
      });

      const response = await request(app)
        .get(`/api/tickets/${memberTicket.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.comments).toHaveLength(1);
      expect(response.body.data.ticket.comments[0].message).toBe("Public note");
    });

    it("should allow members to view tickets assigned to them", async () => {
      const assignedTicket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Assigned to member",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user1.id,
          assignedToId: user4.id,
        },
      });

      const response = await request(app)
        .get(`/api/tickets/${assignedTicket.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.id).toBe(assignedTicket.id);
    });

    it("should reject members from viewing unrelated tickets", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to view this ticket",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .get("/api/tickets/non-existent-ticket-id")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });

    it("should return 403 for a user outside the organization", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}`)
        .set("Authorization", `Bearer ${user3Token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to view this ticket",
      );
    });
  });
});
