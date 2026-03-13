import { jest } from "@jest/globals";
import { z } from "zod";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "../../src/modules/organization/org.validator.js";

describe("Organization Validator", () => {
  describe("createOrganizationSchema", () => {
    it("should validate a valid creation payload", () => {
      const validPayload = { name: "Test Org" };
      const result = createOrganizationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should invalidate when name is missing", () => {
      const invalidPayload = {};
      const result = createOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        "Invalid input: expected string, received undefined",
      );
    });

    it("should invalidate when name is an empty string", () => {
      const invalidPayload = { name: "" };
      const result = createOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        "Organization name is required",
      );
    });
  });

  describe("updateOrganizationSchema", () => {
    it("should validate a valid update payload", () => {
      const validPayload = { name: "Updated Org" };
      const result = updateOrganizationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should invalidate when name is missing", () => {
      const invalidPayload = {};
      const result = updateOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        "Invalid input: expected string, received undefined",
      );
    });

    it("should invalidate when name is an empty string", () => {
      const invalidPayload = { name: "" };
      const result = updateOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        "Organization name is required",
      );
    });
  });
});
