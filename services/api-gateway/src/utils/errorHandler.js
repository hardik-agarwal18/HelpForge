export class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class RequestAbortedError extends Error {
  constructor(reason) {
    super(`Request aborted: ${reason}`);
    this.code = "ERR_REQUEST_ABORTED";
    this.abortReason = reason;
  }
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

export const errorHandler = (err, req, res, next) => {
  // Request was aborted (timeout or client disconnect) — don't send a response
  if (err instanceof RequestAbortedError || req.signal?.aborted) {
    if (!res.headersSent) {
      return res.status(499).end();
    }
    return;
  }

  if (err instanceof ApiError) {
    const body = {
      success: false,
      message: err.message,
    };
    if (err.code) {
      body.code = err.code;
    }
    return res.status(err.statusCode).json(body);
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    code: "INTERNAL_ERROR",
  });
};
