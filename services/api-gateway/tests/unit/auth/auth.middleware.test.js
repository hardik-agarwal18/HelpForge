import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockFindUserById = jest.fn();
const mockVerifyToken = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.repo.js", () => ({
  findUserById: mockFindUserById,
}));

jest.unstable_mockModule("../../../src/modules/auth/auth.utils.js", () => ({
  verifyToken: mockVerifyToken,
}));

const { authenticate } =
  await import("../../../src/middleware/auth.middleware.js");

describe("Auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it("should authenticate with valid token and set req.user", async () => {
    const mockUser = { id: "user-123", email: "test@example.com", name: "Test" };
    req.headers.authorization = "Bearer valid-token";
    mockVerifyToken.mockReturnValue({ sub: "user-123" });
    mockFindUserById.mockResolvedValue(mockUser);

    await authenticate(req, res, next);

    expect(mockVerifyToken).toHaveBeenCalledWith("valid-token");
    expect(mockFindUserById).toHaveBeenCalledWith("user-123");
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
        message: "Invalid authorization header format",
      }),
    );
  });

  it("should call next with error when token is invalid", async () => {
    const tokenError = new Error("Invalid or expired token");
    tokenError.statusCode = 401;
    req.headers.authorization = "Bearer bad-token";
    mockVerifyToken.mockImplementation(() => {
      throw tokenError;
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(tokenError);
    expect(mockFindUserById).not.toHaveBeenCalled();
  });

  it("should call next with error when user not found", async () => {
    req.headers.authorization = "Bearer valid-token";
    mockVerifyToken.mockReturnValue({ sub: "nonexistent-id" });
    mockFindUserById.mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Invalid authentication token",
      }),
    );
  });

  it("should use decoded.sub to find user", async () => {
    const mockUser = { id: "user-456", email: "test@example.com" };
    req.headers.authorization = "Bearer valid-token";
    mockVerifyToken.mockReturnValue({ sub: "user-456" });
    mockFindUserById.mockResolvedValue(mockUser);

    await authenticate(req, res, next);

    expect(mockFindUserById).toHaveBeenCalledWith("user-456");
  });
});
