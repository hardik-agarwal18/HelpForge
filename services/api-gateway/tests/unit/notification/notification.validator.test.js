import { updateNotificationPreferencesSchema } from "../../../src/modules/notifications/notification.validator.js";

describe("Notification Validator", () => {
  describe("updateNotificationPreferencesSchema", () => {
    it("validates when at least one boolean preference is provided", () => {
      const payload = { body: { inAppEnabled: false } };

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({ inAppEnabled: false });
    });

    it("rejects an empty update payload", () => {
      const payload = { body: {} };

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "At least one preference field is required")).toBe(true);
    });

    it("normalizes disabled types to uppercase", () => {
      const payload = {
        body: {
          disabledTypes: ["ticket_assigned", "ticket_comment_added"],
        },
      };

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        disabledTypes: ["TICKET_ASSIGNED", "TICKET_COMMENT_ADDED"],
      });
    });

    it("rejects invalid notification types in disabledTypes", () => {
      const payload = {
        body: {
          disabledTypes: ["ticket_assigned", "unknown_event"],
        },
      };

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Invalid notification type")).toBe(true);
    });
  });
});
