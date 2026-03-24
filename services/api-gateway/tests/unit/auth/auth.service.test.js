import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock the dependencies before importing
const mockFindUserByEmail = jest.fn();
const mockCreateUser = jest.fn();
const mockFindUserById = jest.fn();
const mockHashPassword = jest.fn();
const mockComparePassword = jest.fn();
const mockGenerateToken = jest.fn();
const mockSanitizeUser = jest.fn();

jest.unstable_mockModule("../../../src/modules/auth/auth.repo.js", () => ({
  findUserByEmail: mockFindUserByEmail,
  createUser: mockCreateUser,
  findUserById: mockFindUserById,
}));

jest.unstable_mockModule("../../../src/modules/auth/auth.utils.js", () => ({
  hashPassword: mockHashPassword,
  comparePassword: mockComparePassword,
  generateToken: mockGenerateToken,
  sanitizeUser: mockSanitizeUser,
}));

// Import after mocking
const { registerUser, loginUser } =
  await import("../../../src/modules/auth/auth.service.js");
const { ApiError } = await import("../../../src/utils/errorHandler.js");

describe("Auth Service Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSanitizeUser.mockImplementation(({ password, ...rest }) => rest);
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

    it("should register a new user successfully", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(mockCreatedUser);
      mockGenerateToken.mockReturnValue({
        token: "mock-jwt-token",
        expiresIn: "7d",
      });

      // Act
      const result = await registerUser(mockUserData);

      // Assert
      expect(mockFindUserByEmail).toHaveBeenCalledWith(mockUserData.email);
      expect(mockHashPassword).toHaveBeenCalledWith(mockUserData.password);
      expect(mockCreateUser).toHaveBeenCalledWith({
        ...mockUserData,
        password: "hashedPassword123",
      });
      expect(mockGenerateToken).toHaveBeenCalledWith(mockCreatedUser);
      expect(mockSanitizeUser).toHaveBeenCalledWith(mockCreatedUser);
      expect(result.token).toBe("mock-jwt-token");
      expect(result.expiresIn).toBe("7d");
      expect(result.user).not.toHaveProperty("password");
    });

    it("should throw error if user already exists", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(mockCreatedUser);

      // Act & Assert
      await expect(registerUser(mockUserData)).rejects.toThrow(ApiError);
      await expect(registerUser(mockUserData)).rejects.toThrow(
        "User already exists",
      );
      expect(mockHashPassword).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("should hash password before creating user", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(mockCreatedUser);
      mockGenerateToken.mockReturnValue({
        token: "mock-jwt-token",
        expiresIn: "7d",
      });

      // Act
      await registerUser(mockUserData);

      // Assert
      expect(mockHashPassword).toHaveBeenCalledWith(mockUserData.password);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          password: "hashedPassword123",
        }),
      );
    });

    it("should generate token with the created user", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(mockCreatedUser);
      mockGenerateToken.mockReturnValue({
        token: "mock-jwt-token",
        expiresIn: "7d",
      });

      // Act
      await registerUser(mockUserData);

      // Assert
      expect(mockGenerateToken).toHaveBeenCalledWith(mockCreatedUser);
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
      mockComparePassword.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue({
        token: "mock-jwt-token",
        expiresIn: "7d",
      });

      // Act
      const result = await loginUser(mockEmail, mockPassword);

      // Assert
      expect(mockFindUserByEmail).toHaveBeenCalledWith(mockEmail);
      expect(mockComparePassword).toHaveBeenCalledWith(
        mockPassword,
        mockUser.password,
      );
      expect(mockGenerateToken).toHaveBeenCalledWith(mockUser);
      expect(mockSanitizeUser).toHaveBeenCalledWith(mockUser);
      expect(result.token).toBe("mock-jwt-token");
      expect(result.expiresIn).toBe("7d");
      expect(result.user).not.toHaveProperty("password");
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
      expect(mockComparePassword).not.toHaveBeenCalled();
    });

    it("should throw 401 error if password is incorrect", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(false);

      // Act & Assert
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        ApiError,
      );
      await expect(loginUser(mockEmail, mockPassword)).rejects.toThrow(
        "Invalid credentials",
      );
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("should generate token on successful login", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue({
        token: "mock-jwt-token",
        expiresIn: "7d",
      });

      // Act
      await loginUser(mockEmail, mockPassword);

      // Assert
      expect(mockGenerateToken).toHaveBeenCalledWith(mockUser);
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
      expect(mockComparePassword).not.toHaveBeenCalled();
      expect(mockGenerateToken).not.toHaveBeenCalled();
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
      mockHashPassword.mockResolvedValue(null); // Hash fails

      // Act & Assert
      await expect(registerUser(mockUserData)).rejects.toThrow(ApiError);
      await expect(registerUser(mockUserData)).rejects.toThrow(
        "Failed to hash password",
      );
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("should throw 500 error when user creation fails - no id", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("hashedPassword123");
      mockCreateUser.mockResolvedValue(null); // Creation fails

      // Act & Assert
      await expect(registerUser(mockUserData)).rejects.toThrow(ApiError);
      await expect(registerUser(mockUserData)).rejects.toThrow(
        "Failed to create user",
      );
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("should throw 500 error when user creation returns no id", async () => {
      // Arrange
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("hashedPassword123");
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
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });
  });
});
