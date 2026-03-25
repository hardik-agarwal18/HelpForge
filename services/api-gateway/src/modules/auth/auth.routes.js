import express from "express";
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getProfile,
} from "./auth.controller.js";
import { validate } from "../../middleware/validation.middleware.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from "./auth.validator.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refresh);
router.post("/logout", validate(logoutSchema), logout);
router.post("/logout-all", authenticate, logoutAll);
router.get("/me", authenticate, getProfile);

export default router;
