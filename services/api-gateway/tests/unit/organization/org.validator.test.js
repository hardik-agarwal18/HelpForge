import { jest } from "@jest/globals";
import { z } from "zod";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from "../../../src/modules/organization/org.validator.js";

describe("Organization Validator", () => {
  describe("createOrganizationSchema", () => {
    it("should validate a valid creation payload", () => {
      const validPayload = { body: { name: "Test Org" } };
      const result = createOrganizationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should invalidate when name is missing", () => {
      const invalidPayload = { body: {} };
      const result = createOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it("should invalidate when name is an empty string", () => {
      const invalidPayload = { body: { name: "" } };
      const result = createOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Organization name is required")).toBe(true);
    });
  });

  describe("updateOrganizationSchema", () => {
    it("should validate a valid update payload", () => {
      const validPayload = {
        body: { name: "Updated Org" },
        params: { orgId: "550e8400-e29b-41d4-a716-446655440000" },
      };
      const result = updateOrganizationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should invalidate when name is missing", () => {
      const invalidPayload = {
        body: {},
        params: { orgId: "550e8400-e29b-41d4-a716-446655440000" },
      };
      const result = updateOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it("should invalidate when name is an empty string", () => {
      const invalidPayload = {
        body: { name: "" },
        params: { orgId: "550e8400-e29b-41d4-a716-446655440000" },
      };
      const result = updateOrganizationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Organization name is required")).toBe(true);
    });
  });

  describe("inviteMemberSchema", () => {
    it("should validate a valid invite payload with userId and roleId", () => {
      const validPayload = {
        body: {
          userId: "user-1",
          roleId: "550e8400-e29b-41d4-a716-446655440000",
        },
      };
      const result = inviteMemberSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        userId: "user-1",
        roleId: "550e8400-e29b-41d4-a716-446655440000",
      });
    });

    it("should invalidate when userId is missing", () => {
      const invalidPayload = {
        body: { roleId: "550e8400-e29b-41d4-a716-446655440000" },
      };
      const result = inviteMemberSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should invalidate when roleId is missing", () => {
      const invalidPayload = { body: { userId: "user-1" } };
      const result = inviteMemberSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should invalidate when roleId is not a valid UUID", () => {
      const invalidPayload = {
        body: { userId: "user-1", roleId: "not-a-uuid" },
      };
      const result = inviteMemberSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Invalid role ID")).toBe(true);
    });
  });

  describe("updateMemberRoleSchema", () => {
    it("should validate a valid role update payload with roleId", () => {
      const validPayload = {
        body: { roleId: "550e8400-e29b-41d4-a716-446655440000" },
      };
      const result = updateMemberRoleSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        roleId: "550e8400-e29b-41d4-a716-446655440000",
      });
    });

    it("should invalidate when roleId is missing", () => {
      const invalidPayload = { body: {} };
      const result = updateMemberRoleSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should invalidate when roleId is not a valid UUID", () => {
      const invalidPayload = { body: { roleId: "not-a-uuid" } };
      const result = updateMemberRoleSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Invalid role ID")).toBe(true);
    });
  });
});
