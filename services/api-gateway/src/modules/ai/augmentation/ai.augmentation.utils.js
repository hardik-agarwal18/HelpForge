export const getTicketComments = (ticket) =>
  Array.isArray(ticket?.comments) ? ticket.comments : [];

export const resolveDays = (days, fallback = 7) => days ?? fallback;

export const toLowerText = (value) =>
  typeof value === "string" ? value.toLowerCase() : "";

export const containsAnyKeyword = (text, keywords) => {
  const normalized = toLowerText(text);
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
};

export const buildCopySuggestion = (suggestion, previewLength = 50) => {
  const preview =
    typeof suggestion === "string"
      ? suggestion.substring(0, previewLength)
      : "";
  return `Copy & Customize: ${preview}...`;
};

export const mapSuggestionResponse = (suggestion) => ({
  ticketId: suggestion.ticketId,
  suggestion: suggestion.suggestion,
  quality: suggestion.quality,
  confidence: suggestion.confidence,
  reasoning: suggestion.reasoning,
  copySuggestion: suggestion.copySuggestion,
});

export const mapSummaryResponse = (summary) => ({
  ticketId: summary.ticketId,
  title: summary.title,
  issue: summary.issue,
  timeline: summary.timeline,
  keyPoints: summary.keyPoints,
  attemptedSolutions: summary.attemptedSolutions,
  nextSteps: summary.nextSteps,
  customerSentiment: summary.customerSentiment,
  priority: summary.priority,
  age: summary.age,
});

export const buildQuickAssistResponse = (quickAssist) => ({
  ticketId: quickAssist.ticketId,
  suggestion: quickAssist.suggestion || undefined,
  summary: quickAssist.summary || undefined,
  actions: quickAssist.actions || [],
  timestamp: quickAssist.timestamp || new Date().toISOString(),
});

export const buildTeamStatsPlaceholder = (organizationId, days) => ({
  organizationId,
  period: `Last ${days} days`,
  message: "Team stats aggregation - configure agent list first",
});
