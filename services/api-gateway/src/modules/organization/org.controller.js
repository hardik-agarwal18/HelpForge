import {
  deleteOrganizationService,
  getOrganizationByUserIdService,
  inviteMemberInOrganizationService,
  updateMemberFromOrganizationService,
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

export const inviteMemberInOrganizationController = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const { userId, role } = req.body;

    const membership = await inviteMemberInOrganizationService(
      orgId,
      userId,
      role,
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

export const viewAllMembersInOrganizationController = async (
  req,
  res,
  next,
) => {
  try {
    const orgId = req.params.orgId;
    const members = await viewAllMembersInOrganizationService(orgId);

    return res.status(200).json({
      success: true,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
};

export const updateMemberFromOrganizationController = async (
  req,
  res,
  next,
) => {
  try {
    const orgId = req.params.orgId;
    const userId = req.params.userId;
    const { role } = req.body;
    const updatedMembership = await updateMemberFromOrganizationService(
      orgId,
      userId,
      role,
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
