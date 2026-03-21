import {
  createOrganizationService,
  updateOrganizationService,
} from "../services/org.Service";

export const createOrganizationController = async (req, res, next) => {
  try {
    const organization = await createOrganizationService({
      name: req.body.name,
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: organization,
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrganizationController = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;

    const updatedOrganization = await updateOrganizationService({
      orgId,
      name: req.body.name,
    });

    return res.status(200).json({
      success: true,
      data: updatedOrganization,
    });
  } catch (error) {
    next(error);
  }
};
