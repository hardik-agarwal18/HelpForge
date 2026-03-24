import { describe, it, expect, afterEach } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";

describe("App Integration Tests", () => {
  afterEach(() => {
    app.locals.isShuttingDown = false;
  });

  describe("GET /", () => {
    it("should return welcome message", async () => {
      const response = await request(app).get("/").expect(200);

      expect(response.text).toBe("Hello from API Gateway!");
    });
  });

  describe("Shutdown middleware", () => {
    it("should return 503 when server is shutting down", async () => {
      app.locals.isShuttingDown = true;

      const response = await request(app).get("/").expect(503);

      expect(response.body.error).toBe("Server is shutting down");
      expect(response.headers.connection).toBe("close");
    });
  });

  describe("GET /health/live", () => {
    it("should return alive status", async () => {
      const response = await request(app).get("/health/live").expect(200);

      expect(response.body.status).toBe("alive");
    });

    it("should return 503 when shutting down", async () => {
      app.locals.isShuttingDown = true;

      const response = await request(app).get("/health/live").expect(503);

      expect(response.body.error).toBe("Server is shutting down");
    });
  });

  describe("GET /health/ready", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/health/ready");

      // May be 200 or 503 depending on DB/Redis availability in test env
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty("status");
    });

    it("should return 503 when shutting down", async () => {
      app.locals.isShuttingDown = true;

      const response = await request(app).get("/health/ready").expect(503);

      expect(response.body.error).toBe("Server is shutting down");
    });
  });

  describe("GET /health", () => {
    it("should redirect to /health/ready", async () => {
      const response = await request(app).get("/health");

      // Same behavior as /health/ready
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty("status");
    });
  });

  describe("GET /metrics/db", () => {
    it("should return database metrics", async () => {
      const response = await request(app).get("/metrics/db").expect(200);

      expect(response.body).toBeDefined();
      expect(typeof response.body).toBe("object");
    });
  });

  describe("GET /metrics/redis", () => {
    it("should return redis metrics", async () => {
      const response = await request(app).get("/metrics/redis").expect(200);

      expect(response.body).toBeDefined();
      expect(typeof response.body).toBe("object");
    });
  });

  describe("Request ID", () => {
    it("should generate x-request-id if not provided", async () => {
      const response = await request(app).get("/");

      expect(response.headers["x-request-id"]).toBeDefined();
    });

    it("should use provided x-request-id", async () => {
      const customId = "test-request-id-123";
      const response = await request(app)
        .get("/")
        .set("x-request-id", customId);

      expect(response.headers["x-request-id"]).toBe(customId);
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 for unknown routes", async () => {
      const response = await request(app).get("/unknown-route").expect(404);

      expect(response.status).toBe(404);
    });
  });
});
