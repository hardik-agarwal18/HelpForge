import { getOrganizationTicketsWithAIMetrics } from "../../tickets/ticket.repo";

export const getAIStats = async (organizationId, since) => {
  const tickets = await getOrganizationTicketsWithAIMetrics(
    organizationId,
    since,
  );

  let totalResolvedCount = 0;
  let aiResolvedCount = 0;
  let aiTicketsCount = 0;
  let aiMessageSum = 0;

  for (const t of tickets) {
    const aiCount = t.comments.length;
    const hasAI = aiCount > 0;

    if (t.status === "RESOLVED") {
      totalResolvedCount++;
      if (hasAI) aiResolvedCount++;
    }

    if (hasAI) {
      aiTicketsCount++;
      aiMessageSum += aiCount;
    }
  }

  const avgMessagesWithAI = aiMessageSum / Math.max(1, aiTicketsCount);

  const aiResolutionRate =
    totalResolvedCount > 0
      ? ((aiResolvedCount / totalResolvedCount) * 100).toFixed(2)
      : "0.00";

  const aiSuggestionRate = ((avgMessagesWithAI / 5) * 100).toFixed(2); // heuristic

  return {
    totalTickets: tickets.length,
    totalResolved: totalResolvedCount,
    resolvedByAI: aiResolvedCount,
    aiResolutionRate: `${aiResolutionRate}%`,
    avgAIMessagesPerTicket: avgMessagesWithAI.toFixed(2),
    effectiveness: {
      message:
        aiResolvedCount > 0
          ? "AI is actively assisting in ticket resolution"
          : "AI assistance is currently low or unused",
      metrics: {
        aiHelpfulCount: aiResolvedCount,
        aiSuggestionRate: `${aiSuggestionRate}%`,
      },
    },
  };
};
