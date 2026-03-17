export const enqueueNotification = async (notification) => {
  // Queue support will be added in a later phase.
  return {
    queued: false,
    notification,
  };
};

export default {
  enqueueNotification,
};
