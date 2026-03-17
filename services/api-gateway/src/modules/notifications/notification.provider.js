// Provider abstraction for external channels (email, push, webhook, etc.).
export const sendNotification = async (_notification) => {
  // Intentionally a no-op for v1 skeleton until channel integrations are added.
  return { delivered: false };
};

export default {
  sendNotification,
};
