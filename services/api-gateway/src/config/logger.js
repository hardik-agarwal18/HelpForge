import { join } from "node:path";
import pino from "pino";
import config from "./index.js";
import { requestContext } from "./database.config.js";

const isDev = config.nodeEnv === "development";
const isTest = config.nodeEnv === "test";
const level = config.logLevel || (isTest ? "silent" : isDev ? "debug" : "info");

// ── Serializers ─────────────────────────────────────────────────────────────
// Keep logs structured and safe — strip sensitive fields, normalise shapes.

const serializers = {
  req(req) {
    return {
      method: req.method,
      url: req.url,
      remoteAddress: req.socket?.remoteAddress,
      requestId: req.id,
    };
  },

  res(res) {
    return {
      statusCode: res.statusCode,
    };
  },

  err: pino.stdSerializers.err,

  // Redact tokens / passwords that slip into log objects
  user(user) {
    if (!user) return user;
    const { password, token, ...safe } = user;
    return safe;
  },
};

// ── Request-ID mixin ────────────────────────────────────────────────────────
// Automatically injects requestId from AsyncLocalStorage into every log line
// so callers never have to pass it manually.

const mixin = () => {
  const store = requestContext.getStore();
  if (!store?.requestId) return {};
  const ctx = { requestId: store.requestId };
  if (store.signal?.aborted) {
    ctx.aborted = true;
    ctx.abortReason = store.signal.reason?.message ?? "unknown";
  }
  return ctx;
};

// ── Transports ──────────────────────────────────────────────────────────────

const buildTransports = () => {
  const targets = [];

  if (isDev) {
    // Pretty-printed console output for local development
    targets.push({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: false,
      },
      level,
    });
  } else if (!isTest) {
    // Structured JSON to stdout in production (for log collectors)
    targets.push({
      target: "pino/file",
      options: { destination: 1 }, // stdout
      level,
    });
  }

  // File logging — always on except in test
  if (!isTest) {
    targets.push({
      target: "pino-roll",
      options: {
        file: join("logs", "api-gateway"),
        frequency: "daily",
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
        size: "10m",
        limit: { count: 14 },
      },
      level,
    });
  }

  return targets.length > 0 ? pino.transport({ targets }) : undefined;
};

// ── Logger instance ─────────────────────────────────────────────────────────

const logger = pino(
  {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,

    // Base context attached to every log line
    base: {
      service: "api-gateway",
      env: config.nodeEnv,
      ...(config.nodeEnv !== "test" && { pid: process.pid }),
    },

    serializers,
    mixin,

    // Redact paths that may contain secrets
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "token",
        "secret",
      ],
      censor: "[REDACTED]",
    },
  },
  buildTransports(),
);

export default logger;
