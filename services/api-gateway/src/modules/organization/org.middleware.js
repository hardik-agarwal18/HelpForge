import { getUserMembershipInOrganization } from "./org.repo.js";

/**
 * Middleware to verify user membership in an organization
 * Attaches organization and membership to req.organization and req.membership
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
 * Middleware to verify user has specific role(s) in the organization
 * Must be used after verifyOrganizationMembership
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(500).json({
        success: false,
        message: "Organization membership not verified",
      });
    }

    if (!allowedRoles.includes(req.membership.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

/**
 * Middleware to verify user is owner or admin
 * Must be used after verifyOrganizationMembership
 */
export const requireOwnerOrAdmin = requireRole("OWNER", "ADMIN");

/**
 * Middleware to verify user is owner
 * Must be used after verifyOrganizationMembership
 */
export const requireOwner = requireRole("OWNER");
