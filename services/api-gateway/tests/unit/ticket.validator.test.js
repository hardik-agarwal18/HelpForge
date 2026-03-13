import { describe, expect, it } from "@jest/globals";
import { createTicketSchema } from "../../src/modules/tickets/ticket.validator.js";

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
});
