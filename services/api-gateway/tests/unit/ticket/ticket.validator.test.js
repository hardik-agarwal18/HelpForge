import { describe, expect, it } from "@jest/globals";
import {
  addTicketTagSchema,
  assignTicketSchema,
  createTagSchema,
  createTicketAttachmentSchema,
  createTicketCommentSchema,
  createTicketSchema,
  getTagsSchema,
  updateAgentAvailabilitySchema,
  updateTicketStatusSchema,
  updateTicketSchema,
} from "../../../src/modules/tickets/ticket.validator.js";

describe("Ticket Validator", () => {
  describe("createTicketSchema", () => {
    it("should validate a valid ticket payload", () => {
      const result = createTicketSchema.safeParse({
        body: {
          organizationId: "org-1",
          title: "Login issue",
          description: "User cannot login",
          priority: "high",
          source: "web",
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.body.priority).toBe("HIGH");
      expect(result.data.body.source).toBe("WEB");
    });

    it("should reject missing organizationId", () => {
      const result = createTicketSchema.safeParse({
        body: {
          title: "Login issue",
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid priority", () => {
      const result = createTicketSchema.safeParse({
        body: {
          organizationId: "org-1",
          title: "Login issue",
          priority: "critical",
        },
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Invalid priority")).toBe(true);
    });
  });

  describe("updateTicketSchema", () => {
    it("should validate a valid update payload", () => {
      const result = updateTicketSchema.safeParse({
        body: {
          status: "in_progress",
          priority: "urgent",
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.body.status).toBe("IN_PROGRESS");
      expect(result.data.body.priority).toBe("URGENT");
    });

    it("should reject an empty update payload", () => {
      const result = updateTicketSchema.safeParse({ body: {} });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "At least one field is required")).toBe(true);
    });
  });

  describe("createTicketCommentSchema", () => {
    it("should validate a valid comment payload", () => {
      const result = createTicketCommentSchema.safeParse({
        body: {
          message: "This is a comment",
          isInternal: true,
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject missing message", () => {
      const result = createTicketCommentSchema.safeParse({
        body: {
          isInternal: true,
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("createTicketAttachmentSchema", () => {
    it("should validate a valid attachment payload", () => {
      const result = createTicketAttachmentSchema.safeParse({
        body: {
          fileUrl: "https://example.com/file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid attachment payload", () => {
      const result = createTicketAttachmentSchema.safeParse({
        body: {
          fileUrl: "not-a-url",
          fileType: "",
          fileSize: -1,
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("assignTicketSchema", () => {
    it("should validate a valid assignment payload", () => {
      const result = assignTicketSchema.safeParse({
        body: {
          assignedToId: "user-1",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject a missing assignedToId", () => {
      const result = assignTicketSchema.safeParse({ body: {} });

      expect(result.success).toBe(false);
    });
  });

  describe("updateTicketStatusSchema", () => {
    it("should validate a valid status payload", () => {
      const result = updateTicketStatusSchema.safeParse({
        body: {
          status: "in_progress",
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.body.status).toBe("IN_PROGRESS");
    });

    it("should reject an invalid status payload", () => {
      const result = updateTicketStatusSchema.safeParse({
        body: {
          status: "pending",
        },
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Invalid status")).toBe(true);
    });
  });

  describe("createTagSchema", () => {
    it("should validate a valid tag payload", () => {
      const result = createTagSchema.safeParse({
        body: {
          organizationId: "org-1",
          name: "Bug",
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("getTagsSchema", () => {
    it("should validate a valid get tags query", () => {
      const result = getTagsSchema.safeParse({
        body: {
          organizationId: "org-1",
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("addTicketTagSchema", () => {
    it("should validate a valid add tag payload", () => {
      const result = addTicketTagSchema.safeParse({
        body: {
          tagId: "tag-1",
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("updateAgentAvailabilitySchema", () => {
    it("should validate a valid availability payload", () => {
      const result = updateAgentAvailabilitySchema.safeParse({
        body: {
          organizationId: "org-1",
          isAvailable: false,
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject a missing organizationId", () => {
      const result = updateAgentAvailabilitySchema.safeParse({
        body: {
          isAvailable: true,
        },
      });

      expect(result.success).toBe(false);
    });
  });
});
