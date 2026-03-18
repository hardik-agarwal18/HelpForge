import { updateNotificationPreferencesSchema } from "../../../src/modules/notifications/notification.validator.js";

describe("Notification Validator", () => {
  describe("updateNotificationPreferencesSchema", () => {
    it("validates when at least one boolean preference is provided", () => {
      const payload = { inAppEnabled: false };

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ inAppEnabled: false });
    });

    it("rejects an empty update payload", () => {
      const payload = {};

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        "At least one preference field is required",
      );
    });

    it("normalizes disabled types to uppercase", () => {
      const payload = {
        disabledTypes: ["ticket_assigned", "ticket_comment_added"],
      };

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        disabledTypes: ["TICKET_ASSIGNED", "TICKET_COMMENT_ADDED"],
      });
    });

    it("rejects invalid notification types in disabledTypes", () => {
      const payload = {
        disabledTypes: ["ticket_assigned", "unknown_event"],
      };

      const result = updateNotificationPreferencesSchema.safeParse(payload);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid notification type");
    });
  });
});
