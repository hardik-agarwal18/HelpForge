import express from "express";
import { getStats } from "./ai.analytics.controller";

const router = express.Router();

router.get("/stats/:organizationId", getStats);

export default router;
