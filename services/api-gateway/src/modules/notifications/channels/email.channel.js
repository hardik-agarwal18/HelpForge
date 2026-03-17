export const sendEmailChannel = async (_notification) => {
  // Placeholder channel adapter.
  return {
    channel: "email",
    delivered: false,
  };
};

export default {
  sendEmailChannel,
};
