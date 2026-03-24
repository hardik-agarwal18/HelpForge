import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock the dependencies before importing
const mockFindUserByEmail = jest.fn();
const mockCreateUser = jest.fn();
const mockFindUserById = jest.fn();
const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
const mockJwtSign = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.repo.js", () => ({
  findUserByEmail: mockFindUserByEmail,
  createUser: mockCreateUser,
  findUserById: mockFindUserById,
}));

jest.unstable_mockModule("bcrypt", () => ({
  default: {
    hash: mockBcryptHash,
    compare: mockBcryptCompare,
  },
}));

jest.unstable_mockModule("jsonwebtoken", () => ({
  default: {
    sign: mockJwtSign,
  },
}));

// Import after mocking
const { registerUser, loginUser } =
  await import("../../../src/modules/auth/auth.service.js");
const { ApiError } = await import("../../../src/utils/errorHandler.js");

describe("Auth Service Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      createdAt: new Date(),
    };

    it("should register a new user successfully", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(mockCreatedUser);
      mockJwtSign.mockReturnValue("mock-jwt-token");

      // Act
      const result = await registerUser(mockUserData);

      // Assert
      expect(mockFindUserByEmail).toHaveBeenCalledWith(mockUserData.email);
      expect(mockBcryptHash).toHaveBeenCalledWith(mockUserData.password, 10);
      expect(mockCreateUser).toHaveBeenCalledWith({
        ...mockUserData,
        password: "hashedPassword123",
      });
      expect(result).toEqual({
        user: mockCreatedUser,
        token: "mock-jwt-token",
        expiresIn: "7d",
      });
    });

    it("should throw error if user already exists", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(mockCreatedUser);

      // Act & Assert
      await expect(registerUser(mockUserData)).rejects.toThrow(ApiError);
      await expect(registerUser(mockUserData)).rejects.toThrow(
        "User already exists",
      );
      expect(mockBcryptHash).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("should hash password before creating user", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(mockCreatedUser);
      mockJwtSign.mockReturnValue("mock-jwt-token");

      // Act
      await registerUser(mockUserData);

      // Assert
      expect(mockBcryptHash).toHaveBeenCalledWith(mockUserData.password, 10);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          password: "hashedPassword123",
        }),
      );
    });

    it("should generate JWT token with correct payload", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(mockCreatedUser);
      mockJwtSign.mockReturnValue("mock-jwt-token");

      // Act
      await registerUser(mockUserData);

      // Assert
      expect(mockJwtSign).toHaveBeenCalledWith(
        { userId: mockCreatedUser.id, email: mockCreatedUser.email },
        expect.anything(),
        { expiresIn: "7d" },
      );
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
      createdAt: new Date(),
    };

    it("should login user successfully with correct credentials", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockJwtSign.mockReturnValue("mock-jwt-token");

      // Act
      const result = await loginUser(mockEmail, mockPassword);

      // Assert
      expect(mockFindUserByEmail).toHaveBeenCalledWith(mockEmail);
      expect(mockBcryptCompare).toHaveBeenCalledWith(
        mockPassword,
        mockUser.password,
      );
      expect(result).toEqual({
        user: mockUser,
        token: "mock-jwt-token",
        expiresIn: "7d",
      });
    });

    it("should throw 401 error if user not found", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        ApiError,
      );
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        "Invalid credentials",
      );
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it("should throw 401 error if password is incorrect", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(false);

      // Act & Assert
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        ApiError,
      );
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        "Invalid credentials",
      );
      expect(mockJwtSign).not.toHaveBeenCalled();
    });

    it("should generate JWT token on successful login", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockJwtSign.mockReturnValue("mock-jwt-token");

      // Act
      await loginUser(mockEmail, mockPassword);

      // Assert
      expect(mockJwtSign).toHaveBeenCalledWith(
        { userId: mockUser.id, email: mockUser.email },
        expect.anything(),
        { expiresIn: "7d" },
      );
    });

    it("should throw 401 error when user password is corrupted", async () => {
      // Arrange - user exists but password field is null/undefined
      mockFindUserByEmail.mockResolvedValue({
        ...mockUser,
        password: null,
      });

      // Act & Assert
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        ApiError,
      );
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        "Invalid credentials",
      );
      expect(mockBcryptCompare).not.toHaveBeenCalled();
      expect(mockJwtSign).not.toHaveBeenCalled();
    });
  });

  describe("registerUser - Error Scenarios", () => {
    const mockUserData = {
      email: "test@example.com",
      password: "Password123!",
      name: "Test User",
    };

    it("should throw 500 error when password hashing fails", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue(null); // Hash fails

      // Act & Assert
      await expect(registerUser(mockUserData)).rejects.toThrow(ApiError);
      await expect(registerUser(mockUserData)).rejects.toThrow(
        "Failed to hash password",
      );
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockJwtSign).not.toHaveBeenCalled();
    });

    it("should throw 500 error when user creation fails - no id", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(null); // Creation fails

      // Act & Assert
      await expect(registerUser(mockUserData)).rejects.toThrow(ApiError);
      await expect(registerUser(mockUserData)).rejects.toThrow(
        "Failed to create user",
      );
      expect(mockJwtSign).not.toHaveBeenCalled();
    });

    it("should throw 500 error when user creation returns no id", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue({
        email: "test@example.com",
        name: "Test User",
        // Missing id field
      });

      // Act & Assert
      await expect(registerUser(mockUserData)).rejects.toThrow(ApiError);
      await expect(registerUser(mockUserData)).rejects.toThrow(
        "Failed to create user",
      );
      expect(mockJwtSign).not.toHaveBeenCalled();
    });
  });
});
