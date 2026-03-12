import express from "express";
import {
  createOrganizationController,
  getOrganizationsByUserIdController,
} from "./org.controller.js";
import { validate } from "../../middleware/validation.middleware.js";
import { createOrganizationSchema } from "./org.validator.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/",
  authenticate,
  validate(createOrganizationSchema),
  createOrganizationController,
);

router.get("/", authenticate, getOrganizationsByUserIdController);

export default router;
