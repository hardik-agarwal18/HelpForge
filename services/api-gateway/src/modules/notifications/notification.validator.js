import { z } from "zod";
import { NOTIFICATION_TYPES } from "./notification.constants.js";

const notificationTypeValues = Object.values(NOTIFICATION_TYPES);

export const updateNotificationPreferencesSchema = z.object({
  body: z
    .object({
      inAppEnabled: z.boolean().optional(),
      emailEnabled: z.boolean().optional(),
      pushEnabled: z.boolean().optional(),
      websocketEnabled: z.boolean().optional(),
      suppressSelfNotifications: z.boolean().optional(),
      disabledTypes: z
        .array(
          z
            .string()
            .transform((value) => value.toUpperCase())
            .refine((value) => notificationTypeValues.includes(value), {
              message: "Invalid notification type",
            }),
        )
        .optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one preference field is required",
    }),
});
