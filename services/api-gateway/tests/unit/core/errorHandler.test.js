import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { ApiError, errorHandler } from "../../../src/utils/errorHandler.js";

describe("Error Handler Unit Tests", () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    // Mock console.error to avoid noise in test output
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("ApiError handling", () => {
    it("should handle ApiError with custom status code", () => {
      const error = new ApiError(404, "Resource not found");

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Resource not found",
      });
    });

    it("should handle ApiError with 409 status code", () => {
      const error = new ApiError(409, "Conflict error");

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Conflict error",
      });
    });
  });

  describe("Generic error handling", () => {
    it("should handle generic Error as 500 internal server error", () => {
      const error = new Error("Something went wrong");

      errorHandler(error, req, res, next);

      expect(console.error).toHaveBeenCalledWith(error);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    });

    it("should handle TypeError as 500 internal server error", () => {
      const error = new TypeError("Cannot read property of undefined");

      errorHandler(error, req, res, next);

      expect(console.error).toHaveBeenCalledWith(error);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    });

    it("should handle unknown errors as 500 internal server error", () => {
      const error = { message: "Unknown error object" };

      errorHandler(error, req, res, next);

      expect(console.error).toHaveBeenCalledWith(error);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    });
  });

  describe("ApiError class", () => {
    it("should create ApiError with correct properties", () => {
      const error = new ApiError(400, "Bad request");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Bad request");
    });

    it("should have correct name property", () => {
      const error = new ApiError(500, "Server error");

      expect(error.name).toBe("Error");
    });
  });
});
