import logger from "../config/logger.js";
import "./handlers/ticket.handlers.js";
import "./handlers/notification.handlers.js";
import "./handlers/analytics.handlers.js";

logger.debug("Event handlers registered");
