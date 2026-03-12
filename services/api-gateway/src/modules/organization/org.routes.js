import express from "express";
import { createOrganizationController } from "./org.controller.js";
import { validate } from "../../middleware/validation.middleware.js";
import { createOrganizationSchema } from "./org.validator.js";

const router = express.Router();

router.post(
  "/",
  validate(createOrganizationSchema),
  createOrganizationController,
);

export default router;
