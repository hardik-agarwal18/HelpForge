const dedupe = (ids = []) => [...new Set(ids.filter(Boolean))];

export const applyRecipientPreferences = async ({ recipientIds, actorId }) => {
  // Placeholder for per-user/channel preference checks.
  // For now: dedupe and exclude the actor who triggered the event.
  return dedupe(recipientIds).filter((recipientId) => recipientId !== actorId);
};

export default {
  applyRecipientPreferences,
};
