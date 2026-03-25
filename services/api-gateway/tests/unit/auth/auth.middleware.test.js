import { describe, it, expect, jest, beforeEach } from "@jest/globals";

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

const { authenticate } =
  await import("../../../src/middleware/auth.middleware.js");

describe("Auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExtractBearerToken.mockImplementation((header) => {
      if (!header?.startsWith("Bearer ")) return null;
      return header.slice(7) || null;
    });
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    mockIsTokenBlacklisted.mockResolvedValue(false);
  });

  it("should authenticate with valid access token and set req.user", async () => {
    const mockUser = { id: "user-123", email: "test@example.com", name: "Test", tokenIssuedAt: null };
    req.headers.authorization = "Bearer valid-token";
    mockVerifyAccessToken.mockReturnValue({
      sub: "user-123",
      type: "access",
      jti: "jti-1",
      iat: Math.floor(Date.now() / 1000),
      orgPermissions: {
        "org-1": {
          permissions: ["ticket:view_all"],
        },
      },
    });
    mockFindUserById.mockResolvedValue(mockUser);

    await authenticate(req, res, next);

    expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(mockIsTokenBlacklisted).toHaveBeenCalledWith("jti-1");
    expect(mockFindUserById).toHaveBeenCalledWith("user-123");
    expect(req.user).toEqual(mockUser);
    expect(req.auth).toEqual(
      expect.objectContaining({
        orgPermissions: {
          "org-1": {
            permissions: ["ticket:view_all"],
          },
        },
      }),
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("should reject blacklisted token", async () => {
    req.headers.authorization = "Bearer blacklisted-token";
    mockVerifyAccessToken.mockReturnValue({ sub: "user-123", type: "access", jti: "revoked-jti", iat: 123 });
    mockIsTokenBlacklisted.mockResolvedValue(true);

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Token has been revoked",
      }),
    );
    expect(mockFindUserById).not.toHaveBeenCalled();
  });

  it("should reject token issued before tokenIssuedAt", async () => {
    const tokenIssuedAt = new Date("2026-03-25T12:00:00Z");
    const mockUser = { id: "user-123", tokenIssuedAt };
    req.headers.authorization = "Bearer old-token";
    // Token iat is before the user's tokenIssuedAt
    mockVerifyAccessToken.mockReturnValue({
      sub: "user-123",
      type: "access",
      jti: "jti-old",
      iat: Math.floor(new Date("2026-03-25T11:00:00Z").getTime() / 1000),
    });
    mockFindUserById.mockResolvedValue(mockUser);

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Token has been revoked",
      }),
    );
  });

  it("should accept token issued after tokenIssuedAt", async () => {
    const tokenIssuedAt = new Date("2026-03-25T12:00:00Z");
    const mockUser = { id: "user-123", tokenIssuedAt };
    req.headers.authorization = "Bearer new-token";
    mockVerifyAccessToken.mockReturnValue({
      sub: "user-123",
      type: "access",
      jti: "jti-new",
      iat: Math.floor(new Date("2026-03-25T13:00:00Z").getTime() / 1000),
    });
    mockFindUserById.mockResolvedValue(mockUser);

    await authenticate(req, res, next);

    expect(req.user).toEqual(mockUser);
    expect(next).toHaveBeenCalledWith();
  });

  it("should call next with error when no authorization header", async () => {
    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Authentication token is required",
      }),
    );
  });

  it("should call next with error when missing Bearer prefix", async () => {
    req.headers.authorization = "some-token";

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Authentication token is required",
      }),
    );
  });

  it("should call next with error when token is invalid", async () => {
    const tokenError = new Error("Invalid or expired token");
    tokenError.statusCode = 401;
    req.headers.authorization = "Bearer bad-token";
    mockVerifyAccessToken.mockImplementation(() => {
      throw tokenError;
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(tokenError);
    expect(mockFindUserById).not.toHaveBeenCalled();
  });

  it("should call next with error when user not found", async () => {
    req.headers.authorization = "Bearer valid-token";
    mockVerifyAccessToken.mockReturnValue({ sub: "gone-id", type: "access", jti: "jti-x", iat: 999 });
    mockFindUserById.mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Invalid authentication token",
      }),
    );
  });
});
