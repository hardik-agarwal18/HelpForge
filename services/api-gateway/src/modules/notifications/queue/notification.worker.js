export const processNotificationJob = async (_job) => {
  // Worker processing will be added in a later phase.
  return {
    processed: false,
  };
};

export default {
  processNotificationJob,
};
