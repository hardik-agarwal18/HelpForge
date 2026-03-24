import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { z } from "zod";

// Mock dependencies before importing
const mockFindUserById = jest.fn();
const mockIsTokenBlacklisted = jest.fn();
const mockVerifyAccessToken = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.repo.js", () => ({
  findUserById: mockFindUserById,
  isTokenBlacklisted: mockIsTokenBlacklisted,
}));

const mockExtractBearerToken = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.utils.js", () => ({
  verifyAccessToken: mockVerifyAccessToken,
  extractBearerToken: mockExtractBearerToken,
}));

// Import after mocking
const { authenticate } =
  await import("../../../src/middleware/auth.middleware.js");
const { validate } =
  await import("../../../src/middleware/validation.middleware.js");

describe("Middleware Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("authenticate middleware", () => {
    let req, res, next;

    beforeEach(() => {
      mockExtractBearerToken.mockImplementation((header) => {
        if (!header?.startsWith("Bearer ")) return null;
        return header.slice(7) || null;
      });
      req = {
        headers: {},
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      next = jest.fn();
      mockIsTokenBlacklisted.mockResolvedValue(false);
    });

    it("should authenticate user with valid token", async () => {
      // Arrange
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        tokenIssuedAt: null,
      };
      req.headers.authorization = "Bearer valid-token";
      mockVerifyAccessToken.mockReturnValue({ sub: "user-123", jti: "jti-1", iat: Math.floor(Date.now() / 1000) });
      mockFindUserById.mockResolvedValue(mockUser);

      // Act
      await authenticate(req, res, next);

      // Assert
      expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-token");
      expect(mockFindUserById).toHaveBeenCalledWith("user-123");
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 401 if no token provided", async () => {
      // Act
      await authenticate(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should return 401 if token is invalid", async () => {
      // Arrange
      req.headers.authorization = "Bearer invalid-token";
      mockVerifyAccessToken.mockImplementation(() => {
        const error = new Error("Invalid or expired token");
        error.statusCode = 401;
        throw error;
      });

      // Act
      await authenticate(req, res, next);

      // Assert
      // The middleware should either handle the error or pass it to next
      expect(next).toHaveBeenCalled();
    });

    it("should return 401 if user not found", async () => {
      // Arrange
      req.headers.authorization = "Bearer valid-token";
      mockVerifyAccessToken.mockReturnValue({ sub: "user-123", jti: "jti-2", iat: Math.floor(Date.now() / 1000) });
      mockFindUserById.mockResolvedValue(null);

      // Act
      await authenticate(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should handle token without Bearer prefix", async () => {
      // Arrange
      req.headers.authorization = "just-the-token";

      // Act
      await authenticate(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should return 401 if Bearer token is empty", async () => {
      // Arrange
      req.headers.authorization = "Bearer ";

      // Act
      await authenticate(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("validate middleware", () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        body: {},
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      next = jest.fn();
    });

    it("should pass validation with valid data", () => {
      // Arrange - validate() now wraps input in { body, params, query }
      const schema = z.object({
        body: z.object({
          email: z.string().email(),
          password: z.string().min(6),
        }),
      });
      req.body = {
        email: "test@example.com",
        password: "password123",
      };
      req.params = {};
      req.query = {};

      // Act
      const middleware = validate(schema);
      middleware(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 400 with invalid data", () => {
      // Arrange
      const schema = z.object({
        body: z.object({
          email: z.string().email(),
          password: z.string().min(6),
        }),
      });
      req.body = {
        email: "invalid-email",
        password: "123", // Too short
      };
      req.params = {};
      req.query = {};

      // Act
      const middleware = validate(schema);
      middleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Validation error",
        errors: expect.any(Array),
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 400 with missing required fields", () => {
      // Arrange
      const schema = z.object({
        body: z.object({
          email: z.string().email(),
          password: z.string(),
        }),
      });
      req.body = {
        email: "test@example.com",
        // missing password
      };
      req.params = {};
      req.query = {};

      // Act
      const middleware = validate(schema);
      middleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Validation error",
        errors: expect.any(Array),
      });
    });

    it("should format validation errors correctly", () => {
      // Arrange
      const schema = z.object({
        body: z.object({
          email: z.string().email(),
          nested: z.object({
            field: z.string(),
          }),
        }),
      });
      req.body = {
        email: "invalid",
        nested: {}, // missing field
      };
      req.params = {};
      req.query = {};

      // Act
      const middleware = validate(schema);
      middleware(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Validation error",
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          }),
        ]),
      });
    });

    it("should handle non-Zod errors gracefully", () => {
      // Arrange
      const malformedSchema = {
        parse: () => {
          const error = new Error("Custom validation error");
          error.errors = undefined; // No errors array (non-Zod error)
          throw error;
        },
      };
      req.body = { test: "data" };
      req.params = {};
      req.query = {};

      // Act
      const middleware = validate(malformedSchema);
      middleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Validation error",
        errors: [
          {
            field: "unknown",
            message: "Custom validation error",
          },
        ],
      });
    });

    it("should handle errors without error.message using fallback", () => {
      // Arrange
      const malformedSchema = {
        parse: () => {
          const error = new Error();
          error.errors = undefined;
          error.message = ""; // Empty message to trigger fallback
          throw error;
        },
      };
      req.body = { test: "data" };
      req.params = {};
      req.query = {};

      // Act
      const middleware = validate(malformedSchema);
      middleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Validation error",
        errors: [
          {
            field: "unknown",
            message: "Validation failed",
          },
        ],
      });
    });
  });
});
