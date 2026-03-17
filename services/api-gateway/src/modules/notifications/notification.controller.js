import {
  getMyNotificationPreferencesService,
  listMyNotificationsService,
  markAllNotificationsAsReadService,
  markNotificationAsReadService,
  updateMyNotificationPreferencesService,
} from "./notification.service.js";

const normalizeIsRead = (value) => {
  if (value === undefined) {
    return undefined;
  }

  return String(value).toLowerCase() === "true";
};

export const listMyNotificationsController = async (req, res, next) => {
  try {
    const notifications = await listMyNotificationsService(req.user.id, {
      page: req.query.page,
      pageSize: req.query.pageSize,
      isRead: normalizeIsRead(req.query.isRead),
    });

    return res.status(200).json({
      success: true,
      data: { notifications },
    });
  } catch (error) {
    next(error);
  }
};

export const markNotificationAsReadController = async (req, res, next) => {
  try {
    const result = await markNotificationAsReadService(
      req.params.notificationId,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { result },
    });
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsAsReadController = async (req, res, next) => {
  try {
    const result = await markAllNotificationsAsReadService(req.user.id);

    return res.status(200).json({
      success: true,
      data: { result },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyNotificationPreferencesController = async (
  req,
  res,
  next,
) => {
  try {
    const preferences = await getMyNotificationPreferencesService(req.user.id);

    return res.status(200).json({
      success: true,
      data: { preferences },
    });
  } catch (error) {
    next(error);
  }
};

export const updateMyNotificationPreferencesController = async (
  req,
  res,
  next,
) => {
  try {
    const preferences = await updateMyNotificationPreferencesService(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      data: { preferences },
    });
  } catch (error) {
    next(error);
  }
};
