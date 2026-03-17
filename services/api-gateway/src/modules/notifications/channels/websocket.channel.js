import { emitNotificationToUser } from "../realtime/socket.gateway.js";
import { filterRecipientsByChannelPreference } from "../strategies/preference.strategy.js";

export const sendWebsocketChannel = async (notification) => {
  const recipientIds = await filterRecipientsByChannelPreference({
    recipientIds: notification?.recipientIds ?? [],
    channel: "websocket",
  });

  recipientIds.forEach((recipientId) => {
    emitNotificationToUser(recipientId, {
      type: notification.type,
      ticketId: notification.ticketId ?? null,
      organizationId: notification.organizationId ?? null,
      actorId: notification.actorId ?? null,
      metadata: notification.metadata ?? null,
    });
  });

  return {
    channel: "websocket",
    delivered: recipientIds.length > 0,
  };
};

export default {
  sendWebsocketChannel,
};
