import pino from "pino";
import config from "./index.js";

const logger = pino({
  level:
    process.env.LOG_LEVEL || (config.nodeEnv === "test" ? "silent" : "info"),
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
