import { sendEmailChannel } from "./channels/email.channel.js";
import { sendPushChannel } from "./channels/push.channel.js";
import { sendWebsocketChannel } from "./channels/websocket.channel.js";

// Provider abstraction for external channels (email, push, websocket, etc.).
export const sendNotification = async (notification) => {
  const channelResults = await Promise.all([
    sendEmailChannel(notification),
    sendPushChannel(notification),
    sendWebsocketChannel(notification),
  ]);

  return {
    delivered: channelResults.some((result) => result.delivered === true),
    channels: channelResults,
  };
};

export default {
  sendNotification,
};
