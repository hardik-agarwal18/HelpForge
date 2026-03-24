import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
const mockJwtSign = jest.fn();
const mockJwtVerify = jest.fn();

jest.unstable_mockModule("bcrypt", () => ({
  default: {
    hash: mockBcryptHash,
    compare: mockBcryptCompare,
  },
}));

jest.unstable_mockModule("jsonwebtoken", () => ({
  default: {
    sign: mockJwtSign,
    verify: mockJwtVerify,
  },
}));

jest.unstable_mockModule("../../../src/config/index.js", () => ({
  default: {
    bcryptSaltRounds: 12,
    jwtSecret: "test-secret",
    jwtExpiresIn: "7d",
  },
}));

const { hashPassword, comparePassword, generateToken, verifyToken, sanitizeUser } =
  await import("../../../src/modules/auth/auth.utils.js");
const { ApiError } = await import("../../../src/utils/errorHandler.js");

describe("Auth Utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("hashPassword", () => {
    it("should hash password with configured salt rounds", async () => {
      mockBcryptHash.mockResolvedValue("hashed-password");

      const result = await hashPassword("plaintext");

      expect(mockBcryptHash).toHaveBeenCalledWith("plaintext", 12);
      expect(result).toBe("hashed-password");
    });
  });

  describe("comparePassword", () => {
    it("should return true for matching passwords", async () => {
      mockBcryptCompare.mockResolvedValue(true);

      const result = await comparePassword("plain", "hashed");

      expect(mockBcryptCompare).toHaveBeenCalledWith("plain", "hashed");
      expect(result).toBe(true);
    });

    it("should return false for non-matching passwords", async () => {
      mockBcryptCompare.mockResolvedValue(false);

      const result = await comparePassword("wrong", "hashed");

      expect(result).toBe(false);
    });
  });

  describe("generateToken", () => {
    it("should sign token with correct payload and options", () => {
      mockJwtSign.mockReturnValue("signed-token");

      const user = { id: "user-123", email: "test@example.com" };
      const result = generateToken(user);

      expect(mockJwtSign).toHaveBeenCalledWith(
        { sub: "user-123" },
        "test-secret",
        {
          algorithm: "HS256",
          expiresIn: "7d",
          issuer: "helpforge-api",
          audience: "helpforge-users",
        },
      );
      expect(result).toEqual({ token: "signed-token", expiresIn: "7d" });
    });

    it("should not include email in token payload", () => {
      mockJwtSign.mockReturnValue("signed-token");

      generateToken({ id: "user-123", email: "test@example.com" });

      const payload = mockJwtSign.mock.calls[0][0];
      expect(payload).not.toHaveProperty("email");
      expect(payload).not.toHaveProperty("userId");
      expect(payload).toEqual({ sub: "user-123" });
    });
  });

  describe("verifyToken", () => {
    it("should verify token with correct options", () => {
      const decoded = { sub: "user-123", iat: 123, exp: 456 };
      mockJwtVerify.mockReturnValue(decoded);

      const result = verifyToken("valid-token");

      expect(mockJwtVerify).toHaveBeenCalledWith("valid-token", "test-secret", {
        algorithms: ["HS256"],
        issuer: "helpforge-api",
        audience: "helpforge-users",
      });
      expect(result).toEqual(decoded);
    });

    it("should throw ApiError 401 for invalid token", () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error("jwt malformed");
      });

      expect(() => verifyToken("bad-token")).toThrow(ApiError);
      expect(() => verifyToken("bad-token")).toThrow(
        "Invalid or expired token",
      );
    });

    it("should throw ApiError 401 for expired token", () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error("jwt expired");
      });

      try {
        verifyToken("expired-token");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(401);
        expect(error.message).toBe("Invalid or expired token");
      }
    });
  });

  describe("sanitizeUser", () => {
    it("should remove password from user object", () => {
      const user = {
        id: "user-123",
        email: "test@example.com",
        name: "Test",
        password: "secret-hash",
        createdAt: "2026-01-01",
      };

      const result = sanitizeUser(user);

      expect(result).toEqual({
        id: "user-123",
        email: "test@example.com",
        name: "Test",
        createdAt: "2026-01-01",
      });
      expect(result).not.toHaveProperty("password");
    });

    it("should handle user without password field", () => {
      const user = { id: "user-123", email: "test@example.com" };

      const result = sanitizeUser(user);

      expect(result).toEqual({ id: "user-123", email: "test@example.com" });
    });
  });
});
