import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import crypto from "crypto";
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

const waitFor = async (
  assertion,
  { timeoutMs = 1500, intervalMs = 25 } = {},
) => {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    }
  }

  throw lastError;
};

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
    jwt.sign({ sub: user.id, type: "access", jti: crypto.randomUUID(), iat: Math.floor(Date.now() / 1000) }, config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: "15m",
      issuer: "helpforge-api",
      audience: "helpforge-users",
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

      await waitFor(async () => {
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
    });

    it("should auto-assign a new unassigned ticket to the least-loaded agent", async () => {
      const secondAgent = await createTestUser({
        email: `agent2_${Date.now()}@example.com`,
        name: "Second Agent",
      });
      await prisma.membership.create({
        data: {
          userId: secondAgent.id,
          organizationId: organization.id,
          role: "AGENT",
        },
      });
      await prisma.agentWorkload.createMany({
        data: [
          {
            userId: user2.id,
            organizationId: organization.id,
            assignedToday: 3,
            assignedThisWeek: 8,
            lastDailyReset: new Date(),
            lastWeeklyReset: new Date(),
          },
          {
            userId: secondAgent.id,
            organizationId: organization.id,
            assignedToday: 1,
            assignedThisWeek: 2,
            lastDailyReset: new Date(),
            lastWeeklyReset: new Date(),
          },
        ],
      });

      const response = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          organizationId: organization.id,
          title: "Auto assign me",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.assignedToId).toBe(secondAgent.id);
      expect(response.body.data.ticket.status).toBe("IN_PROGRESS");
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

  describe("GET /api/agents/me/tickets", () => {
    beforeEach(async () => {
      await prisma.ticket.createMany({
        data: [
          {
            organizationId: organization.id,
            title: "Assigned to agent",
            priority: "HIGH",
            status: "OPEN",
            source: "WEB",
            createdById: user1.id,
            assignedToId: user2.id,
          },
          {
            organizationId: organization.id,
            title: "Unassigned elsewhere",
            priority: "LOW",
            status: "RESOLVED",
            source: "EMAIL",
            createdById: user1.id,
          },
        ],
      });
    });

    it("should return tickets assigned to the current agent", async () => {
      const response = await request(app)
        .get("/api/agents/me/tickets")
        .set("Authorization", `Bearer ${user2Token}`)
        .query({ status: "OPEN" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tickets).toHaveLength(1);
      expect(response.body.data.tickets[0].assignedToId).toBe(user2.id);
    });

    it("should reject non-staff users", async () => {
      const response = await request(app)
        .get("/api/agents/me/tickets")
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to view assigned agent tickets",
      );
    });
  });

  describe("GET /api/agents/me/stats", () => {
    beforeEach(async () => {
      await prisma.ticket.createMany({
        data: [
          {
            organizationId: organization.id,
            title: "Assigned open",
            priority: "HIGH",
            status: "OPEN",
            source: "WEB",
            createdById: user1.id,
            assignedToId: user2.id,
          },
          {
            organizationId: organization.id,
            title: "Assigned resolved",
            priority: "LOW",
            status: "RESOLVED",
            source: "EMAIL",
            createdById: user1.id,
            assignedToId: user2.id,
          },
        ],
      });
    });

    it("should return stats for the current agent", async () => {
      const response = await request(app)
        .get("/api/agents/me/stats")
        .set("Authorization", `Bearer ${user2Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stats.totalAssigned).toBe(2);
      expect(response.body.data.stats.byStatus.OPEN).toBe(1);
      expect(response.body.data.stats.byStatus.RESOLVED).toBe(1);
    });
  });

  describe("PATCH /api/agents/me/availability", () => {
    it("should allow an agent to update their availability for an organization", async () => {
      const response = await request(app)
        .patch("/api/agents/me/availability")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          organizationId: organization.id,
          isAvailable: false,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.membership.isAvailable).toBe(false);

      const membership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: user2.id,
            organizationId: organization.id,
          },
        },
      });

      expect(membership.isAvailable).toBe(false);
    });

    it("should reject users without membership in the provided organization", async () => {
      const otherOrganization = await prisma.organization.create({
        data: {
          name: `Other_Org_${Date.now()}`,
        },
      });

      const response = await request(app)
        .patch("/api/agents/me/availability")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          organizationId: otherOrganization.id,
          isAvailable: false,
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to update agent availability for this organization",
      );
    });

    it("should reject non-agents from updating availability", async () => {
      const response = await request(app)
        .patch("/api/agents/me/availability")
        .set("Authorization", `Bearer ${user4Token}`)
        .send({
          organizationId: organization.id,
          isAvailable: false,
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Only agents can update their availability",
      );
    });

    it("should reject invalid availability payloads", async () => {
      const response = await request(app)
        .patch("/api/agents/me/availability")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          isAvailable: false,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation error");
    });

    it("should exclude unavailable agents from auto-assignment", async () => {
      const secondAgent = await createTestUser({
        email: `agent3_${Date.now()}@example.com`,
        name: "Third Agent",
      });
      await prisma.membership.create({
        data: {
          userId: secondAgent.id,
          organizationId: organization.id,
          role: "AGENT",
        },
      });
      await prisma.agentWorkload.create({
        data: {
          userId: secondAgent.id,
          organizationId: organization.id,
          assignedToday: 0,
          assignedThisWeek: 0,
          lastDailyReset: new Date(),
          lastWeeklyReset: new Date(),
        },
      });

      await request(app)
        .patch("/api/agents/me/availability")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          organizationId: organization.id,
          isAvailable: false,
        })
        .expect(200);

      const response = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          organizationId: organization.id,
          title: "Availability aware auto assign",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.assignedToId).toBe(secondAgent.id);
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
      expect(
        response.body.data.tickets.every((ticket) =>
          ["Member created ticket", "Member assigned ticket"].includes(
            ticket.title,
          ),
        ),
      ).toBe(true);
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

    it("should filter tickets by assignedTo=me", async () => {
      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user2Token}`)
        .query({
          organizationId: organization.id,
          assignedTo: "me",
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tickets).toHaveLength(1);
      expect(response.body.data.tickets[0].id).toBe(ticket1.id);
    });

    it("should filter tickets by tag and date range", async () => {
      const tag = await prisma.tag.create({
        data: {
          organizationId: organization.id,
          name: "Bug",
        },
      });

      await prisma.ticketTag.create({
        data: {
          ticketId: ticket1.id,
          tagId: tag.id,
        },
      });

      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .query({
          organizationId: organization.id,
          tag: "Bug",
          dateFrom: "2026-03-01T00:00:00.000Z",
          dateTo: "2026-03-31T23:59:59.999Z",
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

    it("should return 400 for invalid date ranges", async () => {
      const response = await request(app)
        .get("/api/tickets")
        .set("Authorization", `Bearer ${user1Token}`)
        .query({
          organizationId: organization.id,
          dateFrom: "2026-03-10T00:00:00.000Z",
          dateTo: "2026-03-01T00:00:00.000Z",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("dateFrom cannot be after dateTo");
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

  describe("POST /api/tickets/tags", () => {
    it("should allow elevated roles to create tags", async () => {
      const response = await request(app)
        .post("/api/tickets/tags")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          organizationId: organization.id,
          name: "Bug",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tag.name).toBe("Bug");
    });

    it("should reject members from creating tags", async () => {
      const response = await request(app)
        .post("/api/tickets/tags")
        .set("Authorization", `Bearer ${user4Token}`)
        .send({
          organizationId: organization.id,
          name: "Bug",
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to create tags",
      );
    });
  });

  describe("GET /api/tickets/tags", () => {
    beforeEach(async () => {
      await prisma.tag.createMany({
        data: [
          {
            organizationId: organization.id,
            name: "Bug",
          },
          {
            organizationId: organization.id,
            name: "Billing",
          },
        ],
      });
    });

    it("should return tags for organization members", async () => {
      const response = await request(app)
        .get("/api/tickets/tags")
        .set("Authorization", `Bearer ${user4Token}`)
        .query({ organizationId: organization.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tags).toHaveLength(2);
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
              authorType: "USER",
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
                authorType: "USER",
                isInternal: false,
              },
              {
                authorId: user1.id,
                message: "Internal note",
                authorType: "USER",
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

  describe("PATCH /api/tickets/:ticketId", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Ticket to update",
          description: "Original",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
        },
      });
    });

    it("should allow elevated roles to update any ticket", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ status: "resolved", assignedToId: user2.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.status).toBe("RESOLVED");
    });

    it("should allow members to update title/description/priority on their own tickets", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ priority: "high", title: "Updated by member" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.priority).toBe("HIGH");
      expect(response.body.data.ticket.title).toBe("Updated by member");
    });

    it("should reject member updates on unrelated tickets", async () => {
      const unrelatedTicket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Not member owned",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user1.id,
        },
      });

      const response = await request(app)
        .patch(`/api/tickets/${unrelatedTicket.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ title: "Blocked" })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to update this ticket",
      );
    });

    it("should reject member updates to restricted fields", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ status: "closed" })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Members can only update title, description, and priority on their own tickets",
      );
    });

    it("should reject invalid payloads with 400", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation error");
    });

    it("should return 404 when the ticket does not exist", async () => {
      const response = await request(app)
        .patch("/api/tickets/non-existent-ticket-id")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ title: "Updated" })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("PATCH /api/tickets/:ticketId/assign", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Ticket to assign",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
        },
      });
    });

    it("should allow elevated roles to assign a ticket", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}/assign`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({ assignedToId: user1.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.assignedToId).toBe(user1.id);

      await waitFor(async () => {
        const updatedTicket = await prisma.ticket.findUnique({
          where: { id: ticket.id },
          include: { activities: true },
        });

        expect(updatedTicket.assignedToId).toBe(user1.id);
        expect(
          updatedTicket.activities.some(
            (activity) => activity.action === "TICKET_ASSIGNED",
          ),
        ).toBe(true);
      });
    });

    it("should reject members from assigning tickets", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}/assign`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ assignedToId: user2.id })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to assign this ticket",
      );
    });

    it("should reject assignees outside the organization", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}/assign`)
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ assignedToId: user3.id })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Assigned user must be a member of the organization",
      );
    });

    it("should reject invalid payloads", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}/assign`)
        .set("Authorization", `Bearer ${user1Token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation error");
    });

    it("should return 404 when the ticket does not exist", async () => {
      const response = await request(app)
        .patch("/api/tickets/non-existent-ticket-id/assign")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ assignedToId: user2.id })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("POST /api/tickets/:ticketId/auto-assign", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Needs routing",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user1.id,
        },
      });
    });

    it("should auto-assign the ticket to the least-loaded available agent", async () => {
      const secondAgent = await createTestUser({
        email: `agent_auto_${Date.now()}@example.com`,
        name: "Auto Assign Agent",
      });
      await prisma.membership.create({
        data: {
          userId: secondAgent.id,
          organizationId: organization.id,
          role: "AGENT",
        },
      });
      await prisma.agentWorkload.createMany({
        data: [
          {
            userId: user2.id,
            organizationId: organization.id,
            assignedToday: 4,
            assignedThisWeek: 10,
            lastDailyReset: new Date(),
            lastWeeklyReset: new Date(),
          },
          {
            userId: secondAgent.id,
            organizationId: organization.id,
            assignedToday: 1,
            assignedThisWeek: 3,
            lastDailyReset: new Date(),
            lastWeeklyReset: new Date(),
          },
        ],
      });

      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/auto-assign`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.assignedToId).toBe(secondAgent.id);
      expect(response.body.data.ticket.status).toBe("IN_PROGRESS");
    });

    it("should reject members from auto-assigning tickets", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/auto-assign`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to auto-assign this ticket",
      );
    });

    it("should return 409 when no available agent can take the ticket", async () => {
      await request(app)
        .patch("/api/agents/me/availability")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          organizationId: organization.id,
          isAvailable: false,
        })
        .expect(200);

      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/auto-assign`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "No available agent found for auto-assignment",
      );
    });

    it("should return 404 when the ticket does not exist", async () => {
      const response = await request(app)
        .post("/api/tickets/non-existent-ticket-id/auto-assign")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("PATCH /api/tickets/:ticketId/status", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Ticket status update",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
        },
      });
    });

    it("should allow elevated roles to update ticket status", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({ status: "resolved" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticket.status).toBe("RESOLVED");

      await waitFor(async () => {
        const updatedTicket = await prisma.ticket.findUnique({
          where: { id: ticket.id },
          include: { activities: true },
        });

        expect(updatedTicket.status).toBe("RESOLVED");
        expect(
          updatedTicket.activities.some(
            (activity) => activity.action === "TICKET_STATUS_UPDATED",
          ),
        ).toBe(true);
      });
    });

    it("should reject members from updating ticket status", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ status: "resolved" })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to update this ticket status",
      );
    });

    it("should reject invalid payloads", async () => {
      const response = await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ status: "pending" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation error");
    });

    it("should return 404 when the ticket does not exist", async () => {
      const response = await request(app)
        .patch("/api/tickets/non-existent-ticket-id/status")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ status: "resolved" })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("POST /api/tickets/:ticketId/comments", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Commentable ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
        },
      });
    });

    it("should allow elevated roles to create internal comments", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({ message: "Internal investigation note", isInternal: true })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.comment.isInternal).toBe(true);
    });

    it("should allow members to create public comments on their own tickets", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ message: "Customer follow-up" })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.comment.message).toBe("Customer follow-up");
      expect(response.body.data.comment.isInternal).toBe(false);
    });

    it("should reject members creating internal comments", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ message: "Secret", isInternal: true })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to create internal comments",
      );
    });

    it("should reject unrelated members from commenting", async () => {
      const unrelatedMember = await createTestUser({
        email: `member2_${Date.now()}@example.com`,
        name: "Another Member",
      });
      const unrelatedMemberToken = signToken(unrelatedMember);
      await prisma.membership.create({
        data: {
          userId: unrelatedMember.id,
          organizationId: organization.id,
          role: "MEMBER",
        },
      });

      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set("Authorization", `Bearer ${unrelatedMemberToken}`)
        .send({ message: "Blocked comment" })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to comment on this ticket",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .post("/api/tickets/non-existent-ticket-id/comments")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({ message: "Missing ticket" })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("GET /api/tickets/:ticketId/comments", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Comments listing ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
          comments: {
            create: [
              {
                authorId: user1.id,
                message: "Public note",
                authorType: "USER",
                isInternal: false,
              },
              {
                authorId: user2.id,
                message: "Internal note",
                authorType: "USER",
                isInternal: true,
              },
            ],
          },
        },
      });
    });

    it("should return all comments for elevated roles", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/comments`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.comments).toHaveLength(2);
    });

    it("should hide internal comments from members", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/comments`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.comments).toHaveLength(1);
      expect(response.body.data.comments[0].message).toBe("Public note");
    });

    it("should reject unrelated members from viewing comments", async () => {
      const unrelatedMember = await createTestUser({
        email: `member3_${Date.now()}@example.com`,
        name: "Third Member",
      });
      const unrelatedMemberToken = signToken(unrelatedMember);
      await prisma.membership.create({
        data: {
          userId: unrelatedMember.id,
          organizationId: organization.id,
          role: "MEMBER",
        },
      });

      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/comments`)
        .set("Authorization", `Bearer ${unrelatedMemberToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to view comments on this ticket",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .get("/api/tickets/non-existent-ticket-id/comments")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("GET /api/tickets/:ticketId/activity", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Activity ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
        },
      });

      await prisma.ticketActivityLog.createMany({
        data: [
          {
            ticketId: ticket.id,
            actorId: user1.id,
            action: "TICKET_CREATED",
            newValue: "Activity ticket",
          },
          {
            ticketId: ticket.id,
            actorId: user2.id,
            action: "TICKET_STATUS_UPDATED",
            oldValue: "OPEN",
            newValue: "RESOLVED",
          },
        ],
      });
    });

    it("should return activity for elevated roles", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/activity`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.activities).toHaveLength(2);
    });

    it("should allow members to view activity on accessible tickets", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/activity`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.activities).toHaveLength(2);
    });

    it("should reject unrelated members from viewing activity", async () => {
      const unrelatedMember = await createTestUser({
        email: `member7_${Date.now()}@example.com`,
        name: "Seventh Member",
      });
      const unrelatedMemberToken = signToken(unrelatedMember);
      await prisma.membership.create({
        data: {
          userId: unrelatedMember.id,
          organizationId: organization.id,
          role: "MEMBER",
        },
      });

      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/activity`)
        .set("Authorization", `Bearer ${unrelatedMemberToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to view activity on this ticket",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .get("/api/tickets/non-existent-ticket-id/activity")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("DELETE /api/tickets/:ticketId/comments/:commentId", () => {
    let ticket;
    let ownMemberComment;
    let agentComment;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Comment deletion ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
        },
      });

      ownMemberComment = await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: user4.id,
          message: "Member comment",
          authorType: "USER",
        },
      });

      agentComment = await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: user2.id,
          message: "Agent comment",
          authorType: "USER",
          isInternal: true,
        },
      });
    });

    it("should allow elevated roles to delete any comment", async () => {
      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/comments/${ownMemberComment.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.comment.id).toBe(ownMemberComment.id);

      const deletedComment = await prisma.ticketComment.findUnique({
        where: { id: ownMemberComment.id },
      });
      expect(deletedComment).toBeNull();
    });

    it("should allow members to delete their own comments on accessible tickets", async () => {
      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/comments/${ownMemberComment.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.comment.id).toBe(ownMemberComment.id);
    });

    it("should reject members deleting other users' comments", async () => {
      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/comments/${agentComment.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to delete this comment",
      );
    });

    it("should reject unrelated members from deleting comments", async () => {
      const unrelatedMember = await createTestUser({
        email: `member5_${Date.now()}@example.com`,
        name: "Fifth Member",
      });
      const unrelatedMemberToken = signToken(unrelatedMember);
      await prisma.membership.create({
        data: {
          userId: unrelatedMember.id,
          organizationId: organization.id,
          role: "MEMBER",
        },
      });
      const unrelatedComment = await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: unrelatedMember.id,
          message: "Own but unrelated",
          authorType: "USER",
        },
      });

      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/comments/${unrelatedComment.id}`)
        .set("Authorization", `Bearer ${unrelatedMemberToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to delete this comment",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .delete(
          `/api/tickets/non-existent-ticket-id/comments/${ownMemberComment.id}`,
        )
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });

    it("should return 404 when comment does not exist for the ticket", async () => {
      const otherTicket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Other ticket",
          priority: "LOW",
          status: "OPEN",
          source: "EMAIL",
          createdById: user1.id,
        },
      });
      const otherComment = await prisma.ticketComment.create({
        data: {
          ticketId: otherTicket.id,
          authorId: user1.id,
          message: "Different ticket comment",
          authorType: "USER",
        },
      });

      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/comments/${otherComment.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Comment not found");
    });
  });

  describe("POST /api/tickets/:ticketId/attachments", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Attachment ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
        },
      });
    });

    it("should allow elevated roles to add attachments", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          fileUrl: "https://example.com/file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.attachment.fileUrl).toBe(
        "https://example.com/file.pdf",
      );
    });

    it("should allow members to add attachments to their own tickets", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({
          fileUrl: "https://example.com/file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it("should reject invalid attachment payloads", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          fileUrl: "not-a-url",
          fileType: "",
          fileSize: -1,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation error");
    });

    it("should reject unrelated members from adding attachments", async () => {
      const unrelatedMember = await createTestUser({
        email: `member4_${Date.now()}@example.com`,
        name: "Fourth Member",
      });
      const unrelatedMemberToken = signToken(unrelatedMember);
      await prisma.membership.create({
        data: {
          userId: unrelatedMember.id,
          organizationId: organization.id,
          role: "MEMBER",
        },
      });

      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set("Authorization", `Bearer ${unrelatedMemberToken}`)
        .send({
          fileUrl: "https://example.com/file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to add attachments to this ticket",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .post("/api/tickets/non-existent-ticket-id/attachments")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          fileUrl: "https://example.com/file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("GET /api/tickets/:ticketId/attachments", () => {
    let ticket;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Attachment listing ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
        },
      });

      await prisma.ticketAttachment.createMany({
        data: [
          {
            ticketId: ticket.id,
            uploadedBy: user2.id,
            fileUrl: "https://example.com/file-1.pdf",
            fileType: "application/pdf",
            fileSize: 1024,
          },
          {
            ticketId: ticket.id,
            uploadedBy: user4.id,
            fileUrl: "https://example.com/file-2.pdf",
            fileType: "application/pdf",
            fileSize: 2048,
          },
        ],
      });
    });

    it("should return attachments for elevated roles", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.attachments).toHaveLength(2);
    });

    it("should allow members to view attachments on accessible tickets", async () => {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.attachments).toHaveLength(2);
    });

    it("should reject unrelated members from viewing attachments", async () => {
      const unrelatedMember = await createTestUser({
        email: `member6_${Date.now()}@example.com`,
        name: "Sixth Member",
      });
      const unrelatedMemberToken = signToken(unrelatedMember);
      await prisma.membership.create({
        data: {
          userId: unrelatedMember.id,
          organizationId: organization.id,
          role: "MEMBER",
        },
      });

      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments`)
        .set("Authorization", `Bearer ${unrelatedMemberToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to view attachments on this ticket",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .get("/api/tickets/non-existent-ticket-id/attachments")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });
  });

  describe("DELETE /api/tickets/:ticketId/attachments/:id", () => {
    let ticket;
    let ownMemberAttachment;
    let agentAttachment;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Attachment deletion ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
          assignedToId: user2.id,
        },
      });

      ownMemberAttachment = await prisma.ticketAttachment.create({
        data: {
          ticketId: ticket.id,
          uploadedBy: user4.id,
          fileUrl: "https://example.com/member-file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        },
      });

      agentAttachment = await prisma.ticketAttachment.create({
        data: {
          ticketId: ticket.id,
          uploadedBy: user2.id,
          fileUrl: "https://example.com/agent-file.pdf",
          fileType: "application/pdf",
          fileSize: 2048,
        },
      });
    });

    it("should allow elevated roles to delete any attachment", async () => {
      const response = await request(app)
        .delete(
          `/api/tickets/${ticket.id}/attachments/${ownMemberAttachment.id}`,
        )
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.attachment.id).toBe(ownMemberAttachment.id);

      const deletedAttachment = await prisma.ticketAttachment.findUnique({
        where: { id: ownMemberAttachment.id },
      });
      expect(deletedAttachment).toBeNull();
    });

    it("should allow members to delete their own attachments on accessible tickets", async () => {
      const response = await request(app)
        .delete(
          `/api/tickets/${ticket.id}/attachments/${ownMemberAttachment.id}`,
        )
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.attachment.id).toBe(ownMemberAttachment.id);
    });

    it("should reject members deleting other users' attachments", async () => {
      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/attachments/${agentAttachment.id}`)
        .set("Authorization", `Bearer ${user4Token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to delete this attachment",
      );
    });

    it("should return 404 when ticket does not exist", async () => {
      const response = await request(app)
        .delete(
          `/api/tickets/non-existent-ticket-id/attachments/${ownMemberAttachment.id}`,
        )
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Ticket not found");
    });

    it("should return 404 when attachment does not exist for the ticket", async () => {
      const otherTicket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Other attachment ticket",
          priority: "LOW",
          status: "OPEN",
          source: "EMAIL",
          createdById: user1.id,
        },
      });
      const otherAttachment = await prisma.ticketAttachment.create({
        data: {
          ticketId: otherTicket.id,
          uploadedBy: user1.id,
          fileUrl: "https://example.com/other-file.pdf",
          fileType: "application/pdf",
          fileSize: 512,
        },
      });

      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/attachments/${otherAttachment.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Attachment not found");
    });
  });

  describe("POST /api/tickets/:ticketId/tags", () => {
    let ticket;
    let tag;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Taggable ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
        },
      });
      tag = await prisma.tag.create({
        data: {
          organizationId: organization.id,
          name: "Bug",
        },
      });
    });

    it("should allow elevated roles to add tags to tickets", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/tags`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({ tagId: tag.id })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticketTag.tagId).toBe(tag.id);
    });

    it("should reject members from tagging tickets", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticket.id}/tags`)
        .set("Authorization", `Bearer ${user4Token}`)
        .send({ tagId: tag.id })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You do not have permission to tag this ticket",
      );
    });
  });

  describe("DELETE /api/tickets/:ticketId/tags/:tagId", () => {
    let ticket;
    let tag;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: {
          organizationId: organization.id,
          title: "Tagged ticket",
          priority: "MEDIUM",
          status: "OPEN",
          source: "WEB",
          createdById: user4.id,
        },
      });
      tag = await prisma.tag.create({
        data: {
          organizationId: organization.id,
          name: "Bug",
        },
      });
      await prisma.ticketTag.create({
        data: {
          ticketId: ticket.id,
          tagId: tag.id,
        },
      });
    });

    it("should allow elevated roles to remove tags from tickets", async () => {
      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/tags/${tag.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ticketTag.tagId).toBe(tag.id);
    });

    it("should return 404 when the tag is not on the ticket", async () => {
      const otherTag = await prisma.tag.create({
        data: {
          organizationId: organization.id,
          name: "Billing",
        },
      });

      const response = await request(app)
        .delete(`/api/tickets/${ticket.id}/tags/${otherTag.id}`)
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Tag not found on this ticket");
    });
  });
});
