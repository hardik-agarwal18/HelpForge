export class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const errorHandler = (err, req, res, next) => {
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
