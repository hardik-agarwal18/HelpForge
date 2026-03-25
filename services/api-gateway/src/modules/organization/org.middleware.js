import { getUserMembershipInOrganization } from "./org.repo.js";
import { PERMISSIONS } from "./org.constants.js";
import { extractPermissionValues } from "./org.utils.js";

/**
 * Middleware to verify user membership in an organization
 * Attaches organization and membership (with role + permissions) to req
 */
export const verifyOrganizationMembership = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const userId = req.user.id;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      });
    }

    const membership = await getUserMembershipInOrganization({ userId, orgId });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this organization",
      });
    }

    req.organization = membership.organization;
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to verify user has specific permission(s) in the organization
 * Must be used after verifyOrganizationMembership
 */
export const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.membership?.role) {
      return res.status(500).json({
        success: false,
        message: "Organization membership not verified",
      });
    }

    const tokenPermissions =
      req.auth?.orgPermissions?.[req.params.orgId]?.permissions ?? [];
    const memberPermissions = tokenPermissions.length > 0
      ? tokenPermissions
      : extractPermissionValues(req.membership.role.permissions);
    const hasAll = requiredPermissions.every((p) => memberPermissions.includes(p));

    if (!hasAll) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

// Convenience aliases matching common route guards
export const requireOwnerOrAdmin = requirePermission(PERMISSIONS.ORG_UPDATE);
export const requireOwner = requirePermission(PERMISSIONS.ORG_DELETE);
