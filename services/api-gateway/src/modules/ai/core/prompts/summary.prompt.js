export const SUMMARY_PROMPT = `Summarize the following ticket conversation in 2-3 sentences. Focus on:
1. What is the issue
2. What has been attempted
3. Current status

Conversation:
{conversation}

Summary:`;

export const buildSummaryContext = (comments) => {
  const conversation = comments
    .map((comment) => `${comment.authorType}: ${comment.message}`)
    .join("\n");

  return SUMMARY_PROMPT.replace("{conversation}", conversation);
};
