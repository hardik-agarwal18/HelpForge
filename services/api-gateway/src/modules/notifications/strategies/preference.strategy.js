import { getNotificationPreferencesForUsers } from "../notification.repo.js";

const dedupe = (ids = []) => [...new Set(ids.filter(Boolean))];

const toPreferenceMap = (rows = []) => {
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.userId, row);
  });
  return map;
};

const isTypeDisabled = (disabledTypes = [], type) => {
  if (!type) {
    return false;
  }

  return disabledTypes.includes(type);
};

export const applyRecipientPreferences = async ({
  recipientIds,
  actorId,
  type,
}) => {
  const dedupedRecipientIds = dedupe(recipientIds);

  if (dedupedRecipientIds.length === 0) {
    return [];
  }

  const preferenceRows =
    await getNotificationPreferencesForUsers(dedupedRecipientIds);
  const preferenceMap = toPreferenceMap(preferenceRows);

  return dedupedRecipientIds.filter((recipientId) => {
    const preference = preferenceMap.get(recipientId);

    if (preference?.inAppEnabled === false) {
      return false;
    }

    if (
      preference?.suppressSelfNotifications !== false &&
      recipientId === actorId
    ) {
      return false;
    }

    if (isTypeDisabled(preference?.disabledTypes ?? [], type)) {
      return false;
    }

    return true;
  });
};

export const filterRecipientsByChannelPreference = async ({
  recipientIds,
  channel,
}) => {
  const dedupedRecipientIds = dedupe(recipientIds);

  if (dedupedRecipientIds.length === 0) {
    return [];
  }

  const preferenceRows =
    await getNotificationPreferencesForUsers(dedupedRecipientIds);
  const preferenceMap = toPreferenceMap(preferenceRows);

  return dedupedRecipientIds.filter((recipientId) => {
    const preference = preferenceMap.get(recipientId);

    if (!preference) {
      return true;
    }

    if (channel === "websocket") {
      return preference.websocketEnabled !== false;
    }

    if (channel === "email") {
      return preference.emailEnabled === true;
    }

    if (channel === "push") {
      return preference.pushEnabled === true;
    }

    return true;
  });
};

export default {
  applyRecipientPreferences,
  filterRecipientsByChannelPreference,
};
