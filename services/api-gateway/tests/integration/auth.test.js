import { describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import { cleanDatabase, disconnectDatabase } from "../helpers/dbHelper.js";

describe("Auth API Integration Tests", () => {
  beforeEach(async () => {
    // Clean database before each test
    await cleanDatabase();
  });

  afterAll(async () => {
    // Clean up and disconnect after all tests
    await cleanDatabase();
    await disconnectDatabase();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const userData = {
        email: `newuser${Date.now()}@example.com`,
        password: "Password123!",
        name: "New User",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("User registered successfully");
      expect(response.body.data).toHaveProperty("user");
      expect(response.body.data).toHaveProperty("token");
      expect(response.body.data.tokenType).toBe("Bearer");
      expect(response.body.data.expiresIn).toBe("7d");
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.name).toBe(userData.name);
      expect(response.body.data.user).not.toHaveProperty("password");
    });

    it("should return 409 if user already exists", async () => {
      const userData = {
        email: `duplicate${Date.now()}@example.com`,
        password: "Password123!",
        name: "Duplicate User",
      };

      // Register user first time
      await request(app).post("/api/auth/register").send(userData).expect(201);

      // Try to register again with same email
      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("User already exists");
    });

    it("should return 400 for invalid email", async () => {
      const userData = {
        email: "invalidemail",
        password: "Password123!",
        name: "Test User",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "test@example.com",
          // missing password and name
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should return 400 for weak password", async () => {
      const userData = {
        email: "test@example.com",
        password: "123", // Too short
        name: "Test User",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/login", () => {
    let testUser;

    beforeEach(async () => {
      // Use unique email for each test
      testUser = {
        email: `logintest${Date.now()}@example.com`,
        password: "Password123!",
        name: "Login Test User",
      };

      // Register a user before each login test
      await request(app).post("/api/auth/register").send(testUser);
    });

    it("should login successfully with correct credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Login successful");
      expect(response.body.data).toHaveProperty("user");
      expect(response.body.data).toHaveProperty("token");
      expect(response.body.data.tokenType).toBe("Bearer");
      expect(response.body.data.expiresIn).toBe("7d");
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user).not.toHaveProperty("password");
    });

    it("should return 401 for non-existent user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "Password123!",
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should return 401 for incorrect password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: "WrongPassword123!",
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should return 400 for invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "invalidemail",
          password: "Password123!",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should return 400 for missing credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          // missing password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/auth/me", () => {
    let testUser;
    let authToken;

    beforeEach(async () => {
      // Use unique email for each test to avoid conflicts
      testUser = {
        email: `profiletest${Date.now()}@example.com`,
        password: "Password123!",
        name: "Profile Test User",
      };

      // Register to get token
      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      authToken = registerResponse.body.data.token;
    });

    it("should get user profile with valid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("user");
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.name).toBe(testUser.name);
      expect(response.body.data.user).not.toHaveProperty("password");
    });

    it("should return 401 without token", async () => {
      const response = await request(app).get("/api/auth/me").expect(401);

      expect(response.body.success).toBe(false);
    });

    it("should return 401 with invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalidtoken123")
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it("should return 401 with malformed Authorization header", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", authToken) // Missing "Bearer" prefix
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
