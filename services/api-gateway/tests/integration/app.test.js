import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";

describe("App Integration Tests", () => {
  describe("GET /", () => {
    it("should return welcome message", async () => {
      const response = await request(app).get("/").expect(200);

      expect(response.text).toBe("Hello from API Gateway!");
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 for unknown routes", async () => {
      const response = await request(app).get("/unknown-route").expect(404);

      expect(response.status).toBe(404);
    });
  });
});
