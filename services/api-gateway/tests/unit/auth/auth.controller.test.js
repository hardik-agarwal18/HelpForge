import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Mock dependencies before importing
const mockRegisterUser = jest.fn();
const mockLoginUser = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.service.js", () => ({
  registerUser: mockRegisterUser,
  loginUser: mockLoginUser,
}));

// Import after mocking
const { register, login, getProfile } =
  await import("../../../src/modules/auth/auth.controller.js");

describe("Auth Controller Unit Tests", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe("register", () => {
    it("should register a user successfully", async () => {
      const userData = {
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      };
      const mockUser = {
        id: "user-123",
        email: userData.email,
        name: userData.name,
        createdAt: new Date(),
      };
      const mockToken = "mock-jwt-token";

      req.body = userData;
      mockRegisterUser.mockResolvedValue({
        user: mockUser,
        token: mockToken,
        expiresIn: "7d",
      });

      await register(req, res, next);

      expect(mockRegisterUser).toHaveBeenCalledWith(userData);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "User registered successfully",
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            name: mockUser.name,
            createdAt: mockUser.createdAt,
          },
          token: mockToken,
          tokenType: "Bearer",
          expiresIn: "7d",
        },
      });
    });

    it("should handle registration errors", async () => {
      const error = new Error("Registration failed");
      req.body = { email: "test@example.com", password: "pass", name: "Test" };
      mockRegisterUser.mockRejectedValue(error);

      await register(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("login", () => {
    it("should login a user successfully", async () => {
      const credentials = {
        email: "test@example.com",
        password: "password123",
      };
      const mockUser = {
        id: "user-123",
        email: credentials.email,
        name: "Test User",
        createdAt: new Date(),
      };
      const mockToken = "mock-jwt-token";

      req.body = credentials;
      mockLoginUser.mockResolvedValue({
        user: mockUser,
        token: mockToken,
        expiresIn: "7d",
      });

      await login(req, res, next);

      expect(mockLoginUser).toHaveBeenCalledWith(
        credentials.email,
        credentials.password,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            name: mockUser.name,
            createdAt: mockUser.createdAt,
          },
          token: mockToken,
          tokenType: "Bearer",
          expiresIn: "7d",
        },
      });
    });

    it("should handle login errors", async () => {
      const error = new Error("Login failed");
      req.body = { email: "test@example.com", password: "pass" };
      mockLoginUser.mockRejectedValue(error);

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("getProfile", () => {
    it("should return user profile successfully", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        createdAt: new Date(),
      };

      req.user = mockUser;

      await getProfile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            name: mockUser.name,
            createdAt: mockUser.createdAt,
          },
        },
      });
    });

    it("should return 401 when req.user is missing", async () => {
      req.user = undefined;

      await getProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: "Authentication required",
        }),
      );
    });

    it("should handle errors in getProfile", async () => {
      const error = new Error("Profile retrieval failed");
      Object.defineProperty(req, "user", {
        get: () => {
          throw error;
        },
      });

      await getProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
