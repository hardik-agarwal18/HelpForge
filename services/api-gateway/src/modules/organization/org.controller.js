import { createOrganizationService } from "./org.service.js";

export const createOrganizationController = async (req, res, next) => {
  try {
    const { name } = req.body;
    const organization = await createOrganizationService(name);

    return res.status(201).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    next(error);
  }
};
