import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockFindUserByEmail = jest.fn();
const mockCreateUserWithRefreshToken = jest.fn();
const mockFindUserById = jest.fn();
const mockGetUserPermissionSnapshot = jest.fn();
const mockCreateRefreshToken = jest.fn();
const mockFindRefreshToken = jest.fn();
const mockDeleteRefreshToken = jest.fn();
const mockDeleteUserRefreshTokens = jest.fn();
const mockBlacklistToken = jest.fn();
const mockUpdateUserTokenIssuedAt = jest.fn();
const mockHashPassword = jest.fn();
const mockComparePassword = jest.fn();
const mockGenerateAccessToken = jest.fn();
const mockGenerateRefreshToken = jest.fn();
const mockVerifyAccessToken = jest.fn();
const mockSanitizeUser = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.repo.js", () => ({
  findUserByEmail: mockFindUserByEmail,
  createUserWithRefreshToken: mockCreateUserWithRefreshToken,
  findUserById: mockFindUserById,
  getUserPermissionSnapshot: mockGetUserPermissionSnapshot,
  createRefreshToken: mockCreateRefreshToken,
  findRefreshToken: mockFindRefreshToken,
  deleteRefreshToken: mockDeleteRefreshToken,
  deleteUserRefreshTokens: mockDeleteUserRefreshTokens,
  blacklistToken: mockBlacklistToken,
  updateUserTokenIssuedAt: mockUpdateUserTokenIssuedAt,
}));

const mockParseDuration = jest.fn((d) => {
  const m = d.match(/^(\d+)([smhd])$/);
  if (!m) return 604800000;
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(m[1], 10) * mult[m[2]];
});

jest.unstable_mockModule("../../../src/modules/auth/auth.utils.js", () => ({
  hashPassword: mockHashPassword,
  comparePassword: mockComparePassword,
  generateAccessToken: mockGenerateAccessToken,
  generateRefreshToken: mockGenerateRefreshToken,
  verifyAccessToken: mockVerifyAccessToken,
  sanitizeUser: mockSanitizeUser,
  parseDuration: mockParseDuration,
}));

jest.unstable_mockModule("../../../src/config/index.js", () => ({
  default: {
    auth: {
      refreshTokenExpiresIn: "7d",
    },
  },
}));

const { registerUser, loginUser, refreshAccessToken, logoutUser, logoutAllDevices } =
  await import("../../../src/modules/auth/auth.service.js");
const { ApiError } = await import("../../../src/utils/errorHandler.js");

describe("Auth Service Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSanitizeUser.mockImplementation(({ password, ...rest }) => rest);
    mockGenerateAccessToken.mockReturnValue({
      accessToken: "mock-access-token",
      expiresIn: "15m",
    });
    mockGetUserPermissionSnapshot.mockResolvedValue({
      "org-1": {
        permissions: ["ticket:view_all"],
      },
    });
    mockGenerateRefreshToken.mockReturnValue("mock-refresh-token");
    mockCreateRefreshToken.mockResolvedValue({});
    mockBlacklistToken.mockResolvedValue({});
    mockDeleteRefreshToken.mockResolvedValue({});
  });

  describe("registerUser", () => {
    const mockUserData = {
      email: "test@example.com",
      password: "Password123!",
      name: "Test User",
    };

    const mockCreatedUser = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      password: "hashedPassword123",
      createdAt: new Date(),
    };

    it("should register a new user and return both tokens", async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("hashedPassword123");
      mockCreateUserWithRefreshToken.mockResolvedValue(mockCreatedUser);

      const result = await registerUser(mockUserData);

      expect(mockGenerateAccessToken).toHaveBeenCalledWith(
        mockCreatedUser,
        {
          orgPermissions: {},
        },
      );
      expect(mockGenerateRefreshToken).toHaveBeenCalled();
      expect(mockCreateUserWithRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "mock-refresh-token",
          userData: expect.objectContaining({
            email: "test@example.com",
            name: "Test User",
            password: "hashedPassword123",
          }),
        }),
      );
      expect(mockCreateRefreshToken).not.toHaveBeenCalled();
      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
      expect(result.user).not.toHaveProperty("password");
    });

    it("should throw error if user already exists", async () => {
      mockFindUserByEmail.mockResolvedValue(mockCreatedUser);

      await expect(registerUser(mockUserData)).rejects.toThrow("User already exists");
    });

    it("should throw 500 when password hashing fails", async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue(null);

      await expect(registerUser(mockUserData)).rejects.toThrow("Failed to hash password");
    });

    it("should throw 500 when user creation fails", async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("hashedPassword123");
      mockCreateUserWithRefreshToken.mockResolvedValue(null);

      await expect(registerUser(mockUserData)).rejects.toThrow("Failed to create user");
    });
  });

  describe("loginUser", () => {
    const mockEmail = "test@example.com";
    const mockPassword = "Password123!";
    const mockUser = {
      id: "user-123",
      email: mockEmail,
      password: "$2b$10$hashedPasswordHere",
      name: "Test User",
    };

    it("should login user and return both tokens", async () => {
      mockFindUserByEmail.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);

      const result = await loginUser({ email: mockEmail, password: mockPassword });

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
      expect(result.user).not.toHaveProperty("password");
    });

    it("should throw 401 if user not found", async () => {
      mockFindUserByEmail.mockResolvedValue(null);

      await expect(loginUser({ email: mockEmail, password: mockPassword })).rejects.toThrow("Invalid credentials");
    });

    it("should throw 401 if password is incorrect", async () => {
      mockFindUserByEmail.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(false);

      await expect(loginUser({ email: mockEmail, password: mockPassword })).rejects.toThrow("Invalid credentials");
    });

    it("should throw 401 when user password is corrupted", async () => {
      mockFindUserByEmail.mockResolvedValue({ ...mockUser, password: null });

      await expect(loginUser({ email: mockEmail, password: mockPassword })).rejects.toThrow("Invalid credentials");
    });
  });

  describe("refreshAccessToken", () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      password: "hashed",
      name: "Test User",
    };

    it("should rotate tokens on valid refresh", async () => {
      mockFindRefreshToken.mockResolvedValue({
        token: "old-refresh-token",
        userId: "user-123",
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockFindUserById.mockResolvedValue(mockUser);

      const result = await refreshAccessToken("old-refresh-token");

      expect(mockDeleteRefreshToken).toHaveBeenCalledWith("old-refresh-token");
      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
    });

    it("should throw 401 for invalid refresh token", async () => {
      mockFindRefreshToken.mockResolvedValue(null);

      await expect(refreshAccessToken("bad-token")).rejects.toThrow("Invalid refresh token");
    });

    it("should throw 401 and delete expired refresh token", async () => {
      mockFindRefreshToken.mockResolvedValue({
        token: "expired-token",
        userId: "user-123",
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(refreshAccessToken("expired-token")).rejects.toThrow("Refresh token expired");
      expect(mockDeleteRefreshToken).toHaveBeenCalledWith("expired-token");
    });
  });

  describe("logoutUser", () => {
    it("should blacklist access token and delete refresh token", async () => {
      mockVerifyAccessToken.mockReturnValue({ jti: "token-jti", exp: 9999999999 });

      await logoutUser({ accessToken: "access-token-value", refreshToken: "refresh-token-value" });

      expect(mockBlacklistToken).toHaveBeenCalledWith({
        jti: "token-jti",
        expiresAt: new Date(9999999999 * 1000),
      });
      expect(mockDeleteRefreshToken).toHaveBeenCalledWith("refresh-token-value");
    });

    it("should not throw if access token is already expired", async () => {
      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error("expired");
      });

      await expect(logoutUser({ accessToken: "expired-token", refreshToken: "refresh" })).resolves.not.toThrow();
    });

    it("should handle missing tokens gracefully", async () => {
      await expect(logoutUser({ accessToken: null, refreshToken: null })).resolves.not.toThrow();
    });
  });

  describe("logoutAllDevices", () => {
    it("should update tokenIssuedAt and delete all refresh tokens", async () => {
      mockUpdateUserTokenIssuedAt.mockResolvedValue({});
      mockDeleteUserRefreshTokens.mockResolvedValue({ count: 3 });

      await logoutAllDevices("user-123");

      expect(mockUpdateUserTokenIssuedAt).toHaveBeenCalledWith("user-123");
      expect(mockDeleteUserRefreshTokens).toHaveBeenCalledWith("user-123");
    });
  });
});
