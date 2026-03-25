import {
  createOrganizationService,
  createRoleService,
  deleteOrganizationService,
  deleteRoleService,
  getOrganizationByUserIdService,
  getRolesService,
  inviteMemberInOrganizationService,
  updateMemberFromOrganizationService,
  updateOrganizationService,
  updateRoleService,
  viewAllMembersInOrganizationService,
} from "./org.service.js";

export const getOrganizationsByUserIdController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const organizations = await getOrganizationByUserIdService(userId);

    return res.status(200).json({
      success: true,
      data: { organizations },
    });
  } catch (error) {
    next(error);
  }
};

export const getOrganizationByIdController = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: { organization: req.organization },
    });
  } catch (error) {
    next(error);
  }
};

export const createOrganizationController = async (req, res, next) => {
  try {
    const organization = await createOrganizationService({
      name: req.body.name,
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrganizationController = async (req, res, next) => {
  try {
    const updatedOrganization = await updateOrganizationService({
      orgId: req.params.orgId,
      name: req.body.name,
    });

    return res.status(200).json({
      success: true,
      data: { organization: updatedOrganization },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteOrganizationController = async (req, res, next) => {
  try {
    const deletedOrganization = await deleteOrganizationService({
      orgId: req.params.orgId,
    });

    return res.status(200).json({
      success: true,
      message: "Organization deleted successfully",
      data: { organization: deletedOrganization },
    });
  } catch (error) {
    next(error);
  }
};

export const viewAllMembersInOrganizationController = async (req, res, next) => {
  try {
    const members = await viewAllMembersInOrganizationService(req.params.orgId);

    return res.status(200).json({
      success: true,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
};

export const inviteMemberInOrganizationController = async (req, res, next) => {
  try {
    const { userId, roleId } = req.body;

    const membership = await inviteMemberInOrganizationService(
      req.params.orgId,
      userId,
      roleId,
      req.membership,
    );

    return res.status(201).json({
      success: true,
      data: { membership },
    });
  } catch (error) {
    next(error);
  }
};

export const updateMemberFromOrganizationController = async (req, res, next) => {
  try {
    const updatedMembership = await updateMemberFromOrganizationService(
      req.params.orgId,
      req.params.userId,
      req.body.roleId,
      req.membership,
    );

    return res.status(200).json({
      success: true,
      data: { membership: updatedMembership },
    });
  } catch (error) {
    next(error);
  }
};

// ── Role CRUD ────────────────────────────────────────────────────────

export const getRolesController = async (req, res, next) => {
  try {
    const roles = await getRolesService(req.params.orgId);

    return res.status(200).json({
      success: true,
      data: { roles },
    });
  } catch (error) {
    next(error);
  }
};

export const createRoleController = async (req, res, next) => {
  try {
    const role = await createRoleService(
      req.params.orgId,
      req.body,
      req.membership,
    );

    return res.status(201).json({
      success: true,
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};

export const updateRoleController = async (req, res, next) => {
  try {
    const role = await updateRoleService(
      req.params.orgId,
      req.params.roleId,
      req.body,
      req.membership,
    );

    return res.status(200).json({
      success: true,
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRoleController = async (req, res, next) => {
  try {
    const role = await deleteRoleService(
      req.params.orgId,
      req.params.roleId,
      req.membership,
    );

    return res.status(200).json({
      success: true,
      message: "Role deleted successfully",
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};
