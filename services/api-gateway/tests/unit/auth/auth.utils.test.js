import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
const mockJwtSign = jest.fn();
const mockJwtVerify = jest.fn();
const mockRandomBytes = jest.fn();
const mockRandomUUID = jest.fn();

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

jest.unstable_mockModule("crypto", () => ({
  default: {
    randomBytes: mockRandomBytes,
    randomUUID: mockRandomUUID,
  },
}));

jest.unstable_mockModule("../../../src/config/index.js", () => ({
  default: {
    bcryptSaltRounds: 12,
    jwtSecret: "test-secret",
    accessTokenExpiresIn: "15m",
    refreshTokenExpiresIn: "7d",
  },
}));

const {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  sanitizeUser,
} = await import("../../../src/modules/auth/auth.utils.js");
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

  describe("generateAccessToken", () => {
    it("should include jti, iat, sub, and type in payload", () => {
      mockRandomUUID.mockReturnValue("test-jti-uuid");
      mockJwtSign.mockReturnValue("signed-token");

      const user = { id: "user-123", email: "test@example.com" };
      const result = generateAccessToken(user);

      const payload = mockJwtSign.mock.calls[0][0];
      expect(payload.sub).toBe("user-123");
      expect(payload.type).toBe("access");
      expect(payload.jti).toBe("test-jti-uuid");
      expect(payload.iat).toEqual(expect.any(Number));
      expect(payload).not.toHaveProperty("email");

      expect(mockJwtSign).toHaveBeenCalledWith(
        payload,
        "test-secret",
        {
          algorithm: "HS256",
          expiresIn: "15m",
          issuer: "helpforge-api",
          audience: "helpforge-users",
        },
      );
      expect(result).toEqual({ accessToken: "signed-token", expiresIn: "15m" });
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a random hex string", () => {
      const mockBuffer = { toString: jest.fn().mockReturnValue("abcdef123456") };
      mockRandomBytes.mockReturnValue(mockBuffer);

      const result = generateRefreshToken();

      expect(mockRandomBytes).toHaveBeenCalledWith(48);
      expect(mockBuffer.toString).toHaveBeenCalledWith("hex");
      expect(result).toBe("abcdef123456");
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify token with correct options", () => {
      const decoded = { sub: "user-123", type: "access", jti: "some-jti", iat: 123, exp: 456 };
      mockJwtVerify.mockReturnValue(decoded);

      const result = verifyAccessToken("valid-token");

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

      expect(() => verifyAccessToken("bad-token")).toThrow(ApiError);
      expect(() => verifyAccessToken("bad-token")).toThrow("Invalid or expired token");
    });

    it("should reject tokens with wrong type", () => {
      mockJwtVerify.mockReturnValue({ sub: "user-123", type: "refresh" });

      expect(() => verifyAccessToken("wrong-type")).toThrow(ApiError);
      expect(() => verifyAccessToken("wrong-type")).toThrow("Invalid token type");
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

      expect(result).not.toHaveProperty("password");
      expect(result).toEqual({
        id: "user-123",
        email: "test@example.com",
        name: "Test",
        createdAt: "2026-01-01",
      });
    });

    it("should handle user without password field", () => {
      const user = { id: "user-123", email: "test@example.com" };

      const result = sanitizeUser(user);

      expect(result).toEqual({ id: "user-123", email: "test@example.com" });
    });
  });
});
