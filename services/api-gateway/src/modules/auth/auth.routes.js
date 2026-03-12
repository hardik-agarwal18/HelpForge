import express from "express";
import { register, login, getProfile } from "./auth.controller.js";
import { validate } from "../../middleware/validation.middleware.js";
import { registerSchema, loginSchema } from "./auth.validator.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.get("/me", authenticate, getProfile);

export default router;
