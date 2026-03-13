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
} from "../../src/modules/tickets/ticket.validator.js";

describe("Ticket Validator", () => {
  describe("createTicketSchema", () => {
    it("should validate a valid ticket payload", () => {
      const result = createTicketSchema.safeParse({
        organizationId: "org-1",
        title: "Login issue",
        description: "User cannot login",
        priority: "high",
        source: "web",
      });

      expect(result.success).toBe(true);
      expect(result.data.priority).toBe("HIGH");
      expect(result.data.source).toBe("WEB");
    });

    it("should reject missing organizationId", () => {
      const result = createTicketSchema.safeParse({
        title: "Login issue",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid priority", () => {
      const result = createTicketSchema.safeParse({
        organizationId: "org-1",
        title: "Login issue",
        priority: "critical",
      });

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid priority");
    });
  });

  describe("updateTicketSchema", () => {
    it("should validate a valid update payload", () => {
      const result = updateTicketSchema.safeParse({
        status: "in_progress",
        priority: "urgent",
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe("IN_PROGRESS");
      expect(result.data.priority).toBe("URGENT");
    });

    it("should reject an empty update payload", () => {
      const result = updateTicketSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("At least one field is required");
    });
  });

  describe("createTicketCommentSchema", () => {
    it("should validate a valid comment payload", () => {
      const result = createTicketCommentSchema.safeParse({
        message: "This is a comment",
        isInternal: true,
      });

      expect(result.success).toBe(true);
    });

    it("should reject missing message", () => {
      const result = createTicketCommentSchema.safeParse({
        isInternal: true,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("createTicketAttachmentSchema", () => {
    it("should validate a valid attachment payload", () => {
      const result = createTicketAttachmentSchema.safeParse({
        fileUrl: "https://example.com/file.pdf",
        fileType: "application/pdf",
        fileSize: 1024,
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid attachment payload", () => {
      const result = createTicketAttachmentSchema.safeParse({
        fileUrl: "not-a-url",
        fileType: "",
        fileSize: -1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("assignTicketSchema", () => {
    it("should validate a valid assignment payload", () => {
      const result = assignTicketSchema.safeParse({
        assignedToId: "user-1",
      });

      expect(result.success).toBe(true);
    });

    it("should reject a missing assignedToId", () => {
      const result = assignTicketSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe("updateTicketStatusSchema", () => {
    it("should validate a valid status payload", () => {
      const result = updateTicketStatusSchema.safeParse({
        status: "in_progress",
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe("IN_PROGRESS");
    });

    it("should reject an invalid status payload", () => {
      const result = updateTicketStatusSchema.safeParse({
        status: "pending",
      });

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid status");
    });
  });

  describe("createTagSchema", () => {
    it("should validate a valid tag payload", () => {
      const result = createTagSchema.safeParse({
        organizationId: "org-1",
        name: "Bug",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("getTagsSchema", () => {
    it("should validate a valid get tags query", () => {
      const result = getTagsSchema.safeParse({
        organizationId: "org-1",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("addTicketTagSchema", () => {
    it("should validate a valid add tag payload", () => {
      const result = addTicketTagSchema.safeParse({
        tagId: "tag-1",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("updateAgentAvailabilitySchema", () => {
    it("should validate a valid availability payload", () => {
      const result = updateAgentAvailabilitySchema.safeParse({
        organizationId: "org-1",
        isAvailable: false,
      });

      expect(result.success).toBe(true);
    });

    it("should reject a missing organizationId", () => {
      const result = updateAgentAvailabilitySchema.safeParse({
        isAvailable: true,
      });

      expect(result.success).toBe(false);
    });
  });
});
