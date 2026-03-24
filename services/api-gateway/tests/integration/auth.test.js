import { describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";
import { cleanDatabase, disconnectDatabase } from "../helpers/dbHelper.js";

describe("Auth API Integration Tests", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user and return both tokens", async () => {
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
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("refreshToken");
      expect(response.body.data.tokenType).toBe("Bearer");
      expect(response.body.data.expiresIn).toBe("15m");
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user).not.toHaveProperty("password");
    });

    it("should return 409 if user already exists", async () => {
      const userData = {
        email: `duplicate${Date.now()}@example.com`,
        password: "Password123!",
        name: "Duplicate User",
      };

      await request(app).post("/api/auth/register").send(userData).expect(201);

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("User already exists");
    });

    it("should return 400 for invalid email", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "invalidemail", password: "Password123!", name: "Test" })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com" })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should return 400 for weak password", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com", password: "123", name: "Test" })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/login", () => {
    let testUser;

    beforeEach(async () => {
      testUser = {
        email: `logintest${Date.now()}@example.com`,
        password: "Password123!",
        name: "Login Test User",
      };
      await request(app).post("/api/auth/register").send(testUser);
    });

    it("should login and return both tokens", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("refreshToken");
      expect(response.body.data.tokenType).toBe("Bearer");
      expect(response.body.data.expiresIn).toBe("15m");
      expect(response.body.data.user).not.toHaveProperty("password");
    });

    it("should return 401 for non-existent user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "nonexistent@example.com", password: "Password123!" })
        .expect(401);

      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should return 401 for incorrect password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: testUser.email, password: "WrongPassword123!" })
        .expect(401);

      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should return 400 for invalid email format", async () => {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "invalidemail", password: "Password123!" })
        .expect(400);
    });

    it("should return 400 for missing credentials", async () => {
      await request(app)
        .post("/api/auth/login")
        .send({ email: testUser.email })
        .expect(400);
    });
  });

  describe("POST /api/auth/refresh", () => {
    let refreshToken;

    beforeEach(async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: `refreshtest${Date.now()}@example.com`,
          password: "Password123!",
          name: "Refresh Test",
        });
      refreshToken = response.body.data.refreshToken;
    });

    it("should return new tokens with valid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("refreshToken");
      expect(response.body.data.refreshToken).not.toBe(refreshToken);
    });

    it("should invalidate old refresh token after rotation", async () => {
      await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      const response = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken })
        .expect(401);

      expect(response.body.message).toBe("Invalid refresh token");
    });

    it("should return 400 for missing refresh token", async () => {
      await request(app)
        .post("/api/auth/refresh")
        .send({})
        .expect(400);
    });

    it("should return 401 for invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "invalid-token" })
        .expect(401);

      expect(response.body.message).toBe("Invalid refresh token");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should logout and invalidate both tokens", async () => {
      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          email: `logouttest${Date.now()}@example.com`,
          password: "Password123!",
          name: "Logout Test",
        });

      const { accessToken, refreshToken } = registerRes.body.data;

      // Logout — send both tokens
      await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Access token should be blacklisted
      await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(401);

      // Refresh token should be deleted
      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken })
        .expect(401);

      expect(refreshRes.body.message).toBe("Invalid refresh token");
    });
  });

  describe("POST /api/auth/logout-all", () => {
    it("should invalidate all tokens for the user", async () => {
      const email = `logoutall${Date.now()}@example.com`;

      // Register and get first session
      const session1 = await request(app)
        .post("/api/auth/register")
        .send({ email, password: "Password123!", name: "Test" });

      const { accessToken: token1, refreshToken: refresh1 } = session1.body.data;

      // Login to get second session
      const session2 = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "Password123!" });

      const { refreshToken: refresh2 } = session2.body.data;

      // Logout all using first session
      await request(app)
        .post("/api/auth/logout-all")
        .set("Authorization", `Bearer ${token1}`)
        .expect(200);

      // Both refresh tokens should be invalid
      await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: refresh1 })
        .expect(401);

      await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: refresh2 })
        .expect(401);
    });
  });

  describe("GET /api/auth/me", () => {
    let testUser;
    let accessToken;

    beforeEach(async () => {
      testUser = {
        email: `profiletest${Date.now()}@example.com`,
        password: "Password123!",
        name: "Profile Test User",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(testUser);
      accessToken = response.body.data.accessToken;
    });

    it("should get user profile with valid access token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user).not.toHaveProperty("password");
    });

    it("should return 401 without token", async () => {
      await request(app).get("/api/auth/me").expect(401);
    });

    it("should return 401 with invalid token", async () => {
      await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalidtoken123")
        .expect(401);
    });

    it("should return 401 with malformed Authorization header", async () => {
      await request(app)
        .get("/api/auth/me")
        .set("Authorization", accessToken)
        .expect(401);
    });
  });
});
