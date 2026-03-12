import {
  createOrganizationService,
  getOrganizationByUserIdService,
} from "./org.service.js";

export const createOrganizationController = async (req, res, next) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;
    const organization = await createOrganizationService(name, userId);

    return res.status(201).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    next(error);
  }
};

export const getOrganizationsByUserIdController = async (req, res, next) => {
  try {
    const organizations = await getOrganizationByUserIdService(req.user.id);

    return res.status(200).json({
      success: true,
      data: { organizations },
    });
  } catch (error) {
    next(error);
  }
};
