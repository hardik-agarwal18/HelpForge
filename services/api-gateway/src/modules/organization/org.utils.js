import { ApiError } from "../../utils/errorHandler.js";
import { PERMISSIONS } from "./org.constants.js";

export const hasPermission = (role, permission) => {
  return role?.permissions?.includes(permission) ?? false;
};

export const hasAllPermissions = (role, permissions) => {
  return permissions.every((p) => hasPermission(role, p));
};

export const assertHasPermission = (role, permission, message, code) => {
  if (!hasPermission(role, permission)) {
    throw new ApiError(403, message || "You do not have permission to perform this action", code || "FORBIDDEN");
  }
};

export const assertCanInviteRole = (actorRole, targetRole) => {
  if (!hasPermission(actorRole, PERMISSIONS.ORG_INVITE_MEMBER)) {
    throw new ApiError(403, "You do not have permission to invite members", "INVITE_FORBIDDEN");
  }

  if (targetRole.level >= actorRole.level) {
    throw new ApiError(
      403,
      "You cannot invite a member with a role equal to or higher than yours",
      "INVITE_FORBIDDEN",
    );
  }
};

export const assertCanUpdateRole = (actorMembership, targetMembership, nextRole) => {
  const actorRole = actorMembership?.role;

  if (!hasPermission(actorRole, PERMISSIONS.ORG_MANAGE_MEMBER)) {
    throw new ApiError(403, "You do not have permission to update roles", "ROLE_UPDATE_FORBIDDEN");
  }

  if (actorMembership.userId === targetMembership.userId) {
    throw new ApiError(400, "You cannot change your own role", "SELF_ROLE_CHANGE");
  }

  if (targetMembership.role.level >= actorRole.level) {
    throw new ApiError(
      403,
      "You can only update members with a lower role than yours",
      "ROLE_UPDATE_FORBIDDEN",
    );
  }

  if (nextRole.level >= actorRole.level) {
    throw new ApiError(
      403,
      "You cannot promote a member to your role level or higher",
      "PROMOTION_FORBIDDEN",
    );
  }

  if (nextRole.isSystem && nextRole.name === "OWNER") {
    throw new ApiError(400, "Cannot assign OWNER role to a member", "OWNER_ROLE_ASSIGN_FORBIDDEN");
  }
};
