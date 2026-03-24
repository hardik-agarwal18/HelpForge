import { ApiError } from "../../utils/errorHandler.js";
import { ROLE_POLICIES } from "./org.constants.js";

export const normalizeRole = (role) => {
  if (typeof role !== "string" || !role.trim()) {
    throw new ApiError(400, "Role is required", "ROLE_REQUIRED");
  }

  const normalizedRole = role.toUpperCase();

  if (!ROLE_POLICIES[normalizedRole]) {
    throw new ApiError(400, "Invalid role", "INVALID_ROLE");
  }

  return normalizedRole;
};

export const getRolePolicy = (role) => ROLE_POLICIES[role] || null;

export const assertCanInviteRole = (actorRole, targetRole) => {
  const actorPolicy = getRolePolicy(actorRole);

  if (actorPolicy?.canInvite.includes(targetRole)) {
    return;
  }

  throw new ApiError(403, "You do not have permission to invite this role", "INVITE_FORBIDDEN");
};

export const assertCanUpdateRole = (actorMembership, targetMembership, nextRole) => {
  const actorRole = actorMembership?.role;
  const actorPolicy = getRolePolicy(actorRole);

  if (!actorPolicy || actorPolicy.canManage.length === 0) {
    throw new ApiError(403, "You do not have permission to update roles", "ROLE_UPDATE_FORBIDDEN");
  }

  if (
    actorMembership.userId === targetMembership.userId &&
    actorRole === "OWNER"
  ) {
    throw new ApiError(400, "Owner cannot change their own role", "OWNER_SELF_ROLE_CHANGE");
  }

  if (!actorPolicy.canManage.includes(targetMembership.role)) {
    throw new ApiError(
      403,
      "You can only update members with a lower role than yours",
      "ROLE_UPDATE_FORBIDDEN",
    );
  }

  if (nextRole === "OWNER") {
    throw new ApiError(400, "Cannot assign OWNER role to a member", "OWNER_ROLE_ASSIGN_FORBIDDEN");
  }

  if (!actorPolicy.canAssign.includes(nextRole)) {
    throw new ApiError(
      403,
      "You cannot promote a member to your role or higher",
      "PROMOTION_FORBIDDEN",
    );
  }
};
