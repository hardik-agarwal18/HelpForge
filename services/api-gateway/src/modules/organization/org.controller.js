import {
  createOrganizationService,
  getOrganizationByUserIdService,
} from "./org.service.js";
import { ApiError } from "../../utils/errorHandler.js";

export const createOrganizationController = async (req, res, next) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    const organization = await createOrganizationService(name, userId);

    if (!organization) {
      throw new ApiError(500, "Failed to create organization");
    }

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
