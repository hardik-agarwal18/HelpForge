import {
  getAIConfigService,
  createAIConfigService,
  updateAIConfigService,
} from "./ai.config.service.js";

export const getAIConfigController = async (req, res, next) => {
  try {
    const config = await getAIConfigService(req.params.orgId);
    return res.status(200).json({ success: true, data: { config } });
  } catch (error) {
    next(error);
  }
};

export const createAIConfigController = async (req, res, next) => {
  try {
    const config = await createAIConfigService(req.params.orgId, req.body);
    return res.status(201).json({ success: true, data: { config } });
  } catch (error) {
    next(error);
  }
};

export const updateAIConfigController = async (req, res, next) => {
  try {
    const config = await updateAIConfigService(req.params.orgId, req.body);
    return res.status(200).json({ success: true, data: { config } });
  } catch (error) {
    next(error);
  }
};
