export const sendPushChannel = async (_notification) => {
  // Placeholder channel adapter.
  return {
    channel: "push",
    delivered: false,
  };
};

export default {
  sendPushChannel,
};
