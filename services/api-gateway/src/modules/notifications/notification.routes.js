import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  getMyNotificationPreferencesController,
  listMyNotificationsController,
  markAllNotificationsAsReadController,
  markNotificationAsReadController,
  updateMyNotificationPreferencesController,
} from "./notification.controller.js";
import { updateNotificationPreferencesSchema } from "./notification.validator.js";

const router = express.Router();

router.get("/", authenticate, listMyNotificationsController);
router.patch("/read-all", authenticate, markAllNotificationsAsReadController);
router.patch(
  "/:notificationId/read",
  authenticate,
  markNotificationAsReadController,
);

router.get(
  "/preferences",
  authenticate,
  getMyNotificationPreferencesController,
);
router.put(
  "/preferences",
  authenticate,
  validate(updateNotificationPreferencesSchema),
  updateMyNotificationPreferencesController,
);

export default router;
