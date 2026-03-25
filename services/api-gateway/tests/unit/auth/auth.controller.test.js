import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const mockRegisterUser = jest.fn();
const mockLoginUser = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockLogoutUser = jest.fn();
const mockLogoutAllDevices = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.service.js", () => ({
  registerUser: mockRegisterUser,
  loginUser: mockLoginUser,
  refreshAccessToken: mockRefreshAccessToken,
  logoutUser: mockLogoutUser,
  logoutAllDevices: mockLogoutAllDevices,
}));

const mockExtractBearerToken = jest.fn();
const mockFormatUserResponse = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.utils.js", () => ({
  extractBearerToken: mockExtractBearerToken,
  formatUserResponse: mockFormatUserResponse,
}));

const { register, login, refresh, logout, logoutAll, getProfile } =
  await import("../../../src/modules/auth/auth.controller.js");

describe("Auth Controller Unit Tests", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExtractBearerToken.mockImplementation((header) => {
      if (!header?.startsWith("Bearer ")) return null;
      return header.slice(7) || null;
    });
    mockFormatUserResponse.mockImplementation((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    }));
    req = { body: {}, headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe("register", () => {
    it("should register a user and return both tokens", async () => {
      const mockUser = { id: "user-123", email: "test@example.com", name: "Test", createdAt: new Date() };
      req.body = { email: "test@example.com", password: "Password123!", name: "Test" };
      mockRegisterUser.mockResolvedValue({
        user: mockUser,
        accessToken: "access-tok",
        refreshToken: "refresh-tok",
        expiresIn: "15m",
      });

      await register(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            accessToken: "access-tok",
            refreshToken: "refresh-tok",
            tokenType: "Bearer",
            expiresIn: "15m",
          }),
        }),
      );
    });

    it("should handle errors", async () => {
      const error = new Error("fail");
      req.body = { email: "t@t.com", password: "p", name: "n" };
      mockRegisterUser.mockRejectedValue(error);

      await register(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("login", () => {
    it("should login and return both tokens", async () => {
      const mockUser = { id: "user-123", email: "test@example.com", name: "Test", createdAt: new Date() };
      req.body = { email: "test@example.com", password: "Password123!" };
      mockLoginUser.mockResolvedValue({
        user: mockUser,
        accessToken: "access-tok",
        refreshToken: "refresh-tok",
        expiresIn: "15m",
      });

      await login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Login successful",
        }),
      );
    });
  });

  describe("refresh", () => {
    it("should return new tokens", async () => {
      const mockUser = { id: "user-123", email: "test@example.com", name: "Test", createdAt: new Date() };
      req.body = { refreshToken: "old-refresh" };
      mockRefreshAccessToken.mockResolvedValue({
        user: mockUser,
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: "15m",
      });

      await refresh(req, res, next);

      expect(mockRefreshAccessToken).toHaveBeenCalledWith("old-refresh");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 if refresh token missing", async () => {
      req.body = {};

      await refresh(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });
  });

  describe("logout", () => {
    it("should pass both access and refresh tokens to service", async () => {
      req.headers.authorization = "Bearer my-access-token";
      req.body = { refreshToken: "my-refresh-token" };
      mockLogoutUser.mockResolvedValue();

      await logout(req, res, next);

      expect(mockLogoutUser).toHaveBeenCalledWith({ accessToken: "my-access-token", refreshToken: "my-refresh-token" });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Logged out successfully",
      });
    });

    it("should handle missing authorization header", async () => {
      req.body = { refreshToken: "rf" };
      mockLogoutUser.mockResolvedValue();

      await logout(req, res, next);

      expect(mockLogoutUser).toHaveBeenCalledWith({ accessToken: null, refreshToken: "rf" });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("logoutAll", () => {
    it("should call logoutAllDevices for authenticated user", async () => {
      req.user = { id: "user-123" };
      mockLogoutAllDevices.mockResolvedValue();

      await logoutAll(req, res, next);

      expect(mockLogoutAllDevices).toHaveBeenCalledWith("user-123");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Logged out from all devices",
      });
    });

    it("should return 401 if not authenticated", async () => {
      req.user = undefined;

      await logoutAll(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 }),
      );
    });
  });

  describe("getProfile", () => {
    it("should return user profile", async () => {
      req.user = { id: "user-123", email: "test@example.com", name: "Test", createdAt: new Date() };

      await getProfile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ user: expect.any(Object) }),
        }),
      );
    });

    it("should return 401 when req.user is missing", async () => {
      req.user = undefined;

      await getProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 }),
      );
    });
  });
});
