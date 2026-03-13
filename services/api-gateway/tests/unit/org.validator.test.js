import { jest } from "@jest/globals";
import { z } from "zod";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
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

  describe("inviteMemberSchema", () => {
    it("should validate a valid invite payload", () => {
      const validPayload = { userId: "user-1", role: "agent" };
      const result = inviteMemberSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ userId: "user-1", role: "AGENT" });
    });

    it("should invalidate when userId is missing", () => {
      const invalidPayload = { role: "MEMBER" };
      const result = inviteMemberSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        "Invalid input: expected string, received undefined",
      );
    });

    it("should invalidate when role is invalid", () => {
      const invalidPayload = { userId: "user-1", role: "viewer" };
      const result = inviteMemberSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid role");
    });
  });

  describe("updateMemberRoleSchema", () => {
    it("should validate a valid role update payload", () => {
      const validPayload = { role: "member" };
      const result = updateMemberRoleSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ role: "MEMBER" });
    });

    it("should invalidate when role is missing", () => {
      const invalidPayload = {};
      const result = updateMemberRoleSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        "Invalid input: expected string, received undefined",
      );
    });

    it("should invalidate when role is empty", () => {
      const invalidPayload = { role: "" };
      const result = updateMemberRoleSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Role is required");
    });
  });
});
