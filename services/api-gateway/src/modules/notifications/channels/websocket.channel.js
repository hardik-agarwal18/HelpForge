export const sendWebsocketChannel = async (_notification) => {
  // Placeholder channel adapter.
  return {
    channel: "websocket",
    delivered: false,
  };
};

export default {
  sendWebsocketChannel,
};
