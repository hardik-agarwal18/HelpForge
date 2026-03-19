import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

const mockGetTicketWithComments = jest.fn();
const mockGetTicket = jest.fn();
const mockGetAgentTickets = jest.fn();

const mockGenerateAIResponse = jest.fn();
const mockGenerateAISummary = jest.fn();

jest.unstable_mockModule("../../../../src/config/logger.js", () => ({
  default: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

jest.unstable_mockModule(
  "../../../../src/modules/ai/augmentation/ai.augmentation.repo.js",
  () => ({
    getAugmentationTicketWithComments: mockGetTicketWithComments,
    getAugmentationTicket: mockGetTicket,
    getAugmentationAgentTickets: mockGetAgentTickets,
  }),
);

jest.unstable_mockModule(
  "../../../../src/modules/ai/core/provider/ai.provider.orchestrator.js",
  () => ({
    generateAIResponse: mockGenerateAIResponse,
    generateAISummary: mockGenerateAISummary,
  }),
);

const {
  generateAgentSuggestion,
  generateTicketSummary,
  generateSuggestedActions,
  getAgentAugmentationStats,
} =
  await import("../../../../src/modules/ai/augmentation/ai.augmentation.service.js");

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);

const buildComment = (overrides = {}) => ({
  id: overrides.id || "comment-1",
  authorType: overrides.authorType || "USER",
  message: overrides.message || "Default message",
  createdAt: overrides.createdAt || new Date(),
  attachments: overrides.attachments || [],
});

describe("ai.augmentation.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateAgentSuggestion", () => {
    it("returns null and warns when ticket is missing", async () => {
      mockGetTicketWithComments.mockResolvedValue(null);

      const result = await generateAgentSuggestion("ticket-1");

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { ticketId: "ticket-1" },
        "Ticket not found for suggestion",
      );
      expect(mockGenerateAIResponse).not.toHaveBeenCalled();
    });

    it("returns null and warns when no user comment exists", async () => {
      mockGetTicketWithComments.mockResolvedValue({
        id: "ticket-2",
        comments: [buildComment({ authorType: "AI", message: "auto reply" })],
      });

      const result = await generateAgentSuggestion("ticket-2");

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { ticketId: "ticket-2" },
        "No user comment found",
      );
    });

    it("builds a suggestion with quality and confidence", async () => {
      const createdAt = hoursAgo(30);
      mockGetTicketWithComments.mockResolvedValue({
        id: "ticket-3",
        title: "Login issue",
        description: "User cannot login after password reset",
        priority: "HIGH",
        status: "OPEN",
        createdAt,
        createdBy: { email: "customer@example.com" },
        comments: [
          buildComment({
            id: "c1",
            authorType: "USER",
            message: "I already tried clearing cache",
            createdAt: hoursAgo(5),
          }),
          buildComment({
            id: "c2",
            authorType: "AGENT",
            message: "Can you share an error screenshot?",
            createdAt: hoursAgo(4),
          }),
          buildComment({
            id: "c3",
            authorType: "USER",
            message: "Please help, this is urgent and still not working",
            createdAt: hoursAgo(3),
          }),
        ],
      });

      mockGenerateAIResponse.mockResolvedValue(
        "Please try resetting your browser session and signing in from an incognito window. " +
          "If it still fails, can you share the exact error text and timestamp so we can verify account lock events.",
      );

      const result = await generateAgentSuggestion("ticket-3");

      expect(mockGenerateAIResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: "ticket-3",
          systemPrompt: expect.stringContaining(
            "You are helping a support agent",
          ),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          ticketId: "ticket-3",
          quality: "excellent",
          confidence: expect.any(Number),
          reasoning: expect.stringContaining("Suggestion quality based on"),
          copySuggestion: expect.stringContaining("Copy & Customize:"),
        }),
      );
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        { ticketId: "ticket-3", quality: result.quality },
        "Agent suggestion generated",
      );
    });

    it("returns null on provider error", async () => {
      mockGetTicketWithComments.mockResolvedValue({
        id: "ticket-4",
        comments: [buildComment({ authorType: "USER", message: "Need help" })],
        createdAt: new Date(),
      });
      mockGenerateAIResponse.mockRejectedValue(new Error("provider down"));

      const result = await generateAgentSuggestion("ticket-4");

      expect(result).toBeNull();
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: expect.any(Error), ticketId: "ticket-4" },
        "Error generating agent suggestion",
      );
    });
  });

  describe("generateTicketSummary", () => {
    it("returns null and warns when ticket is missing", async () => {
      mockGetTicketWithComments.mockResolvedValue(null);

      const result = await generateTicketSummary("ticket-5");

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { ticketId: "ticket-5" },
        "Ticket not found for summary",
      );
    });

    it("returns structured summary with extracted insights", async () => {
      mockGetTicketWithComments.mockResolvedValue({
        id: "ticket-6",
        title: "API timeout",
        description: "Customer reports timeout on report endpoint",
        priority: "HIGH",
        status: "IN_PROGRESS",
        createdAt: hoursAgo(50),
        updatedAt: hoursAgo(2),
        createdBy: { name: "Customer A" },
        assignedToId: "agent-1",
        assignedTo: { name: "Agent One" },
        comments: [
          buildComment({
            id: "c10",
            authorType: "USER",
            message: "I tried retrying and got error 504",
            createdAt: hoursAgo(12),
          }),
          buildComment({
            id: "c11",
            authorType: "AGENT",
            message: "Thanks, we are checking logs",
            createdAt: hoursAgo(10),
          }),
          buildComment({
            id: "c12",
            authorType: "USER",
            message: "great, it is fixed now",
            createdAt: hoursAgo(8),
          }),
        ],
      });
      mockGenerateAISummary.mockResolvedValue(
        "Issue reproduced on one shard and mitigated by cache refresh.",
      );

      const result = await generateTicketSummary("ticket-6");

      expect(mockGenerateAISummary).toHaveBeenCalledWith(expect.any(Array));
      expect(result).toEqual(
        expect.objectContaining({
          ticketId: "ticket-6",
          title: "API timeout",
          issue: expect.stringContaining("API timeout"),
          timeline: expect.arrayContaining([
            expect.objectContaining({ action: "Ticket created" }),
            expect.objectContaining({ action: "Assigned to" }),
          ]),
          keyPoints: expect.arrayContaining([
            "Priority: HIGH",
            "Status: IN_PROGRESS",
          ]),
          attemptedSolutions: expect.arrayContaining([
            expect.stringContaining("tried retrying"),
          ]),
          nextSteps: expect.arrayContaining([
            "Follow up on previous troubleshooting steps",
          ]),
          customerSentiment: "positive",
          priority: "HIGH",
        }),
      );
      expect(result.age).toBeTruthy();
    });

    it("returns null on summary generation error", async () => {
      mockGetTicketWithComments.mockResolvedValue({
        id: "ticket-7",
        title: "Any",
        description: "Any",
        priority: "LOW",
        status: "OPEN",
        createdAt: new Date(),
        comments: [],
      });
      mockGenerateAISummary.mockRejectedValue(new Error("summary failed"));

      const result = await generateTicketSummary("ticket-7");

      expect(result).toBeNull();
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: expect.any(Error), ticketId: "ticket-7" },
        "Error generating summary",
      );
    });
  });

  describe("generateSuggestedActions", () => {
    it("returns empty list when ticket is missing", async () => {
      mockGetTicket.mockResolvedValue(null);

      const result = await generateSuggestedActions("ticket-8");

      expect(result).toEqual([]);
    });

    it("returns ranked actions for old complex open high-priority ticket", async () => {
      mockGetTicket.mockResolvedValue({
        id: "ticket-9",
        status: "OPEN",
        priority: "HIGH",
        createdAt: hoursAgo(30),
        comments: [
          buildComment({ authorType: "USER", message: "Issue still broken" }),
          buildComment({ authorType: "AGENT", message: "Checking" }),
          buildComment({ authorType: "USER", message: "Any update?" }),
          buildComment({ authorType: "AGENT", message: "Need details" }),
          buildComment({ authorType: "USER", message: "Tried all steps" }),
          buildComment({
            authorType: "USER",
            message: "Can you please help now?",
          }),
        ],
      });

      const result = await generateSuggestedActions("ticket-9");

      expect(result.map((a) => a.actionType)).toEqual([
        "escalate",
        "request_attachment",
        "schedule_followup",
        "kb_search",
      ]);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        { ticketId: "ticket-9", actionCount: 4 },
        "Suggested actions generated",
      );
    });

    it("returns empty list on repository error", async () => {
      mockGetTicket.mockRejectedValue(new Error("repo unavailable"));

      const result = await generateSuggestedActions("ticket-10");

      expect(result).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: expect.any(Error), ticketId: "ticket-10" },
        "Error generating suggested actions",
      );
    });
  });

  describe("getAgentAugmentationStats", () => {
    it("returns aggregate stats and recommendations", async () => {
      mockGetAgentTickets.mockResolvedValue([
        {
          id: "t1",
          status: "RESOLVED",
          aiMessageCount: 2,
          createdAt: hoursAgo(1),
          comments: [
            buildComment({
              authorType: "USER",
              createdAt: new Date(Date.now() - 50 * 60000),
            }),
            buildComment({
              authorType: "AGENT",
              createdAt: new Date(Date.now() - 30 * 60000),
            }),
          ],
        },
        {
          id: "t2",
          status: "OPEN",
          aiMessageCount: 0,
          createdAt: hoursAgo(20),
          comments: [buildComment({ authorType: "USER" })],
        },
        {
          id: "t3",
          status: "OPEN",
          aiMessageCount: 1,
          createdAt: hoursAgo(18),
          comments: [buildComment({ authorType: "USER" })],
        },
        {
          id: "t4",
          status: "OPEN",
          aiMessageCount: 1,
          createdAt: hoursAgo(16),
          comments: [buildComment({ authorType: "USER" })],
        },
        {
          id: "t5",
          status: "OPEN",
          aiMessageCount: 0,
          createdAt: hoursAgo(14),
          comments: [buildComment({ authorType: "USER" })],
        },
        {
          id: "t6",
          status: "OPEN",
          aiMessageCount: 0,
          createdAt: hoursAgo(12),
          comments: [buildComment({ authorType: "USER" })],
        },
        {
          id: "t7",
          status: "OPEN",
          aiMessageCount: 0,
          createdAt: hoursAgo(10),
          comments: [buildComment({ authorType: "USER" })],
        },
      ]);

      const result = await getAgentAugmentationStats("agent-1", 7);

      expect(result).toEqual(
        expect.objectContaining({
          agentId: "agent-1",
          period: "Last 7 days",
          stats: expect.objectContaining({
            totalTicketsHandled: 7,
            resolved: 1,
            active: 6,
            resolutionRate: "14.29",
            avgResolutionTime: expect.stringContaining("hours"),
            avgRespondTime: expect.stringContaining("min"),
          }),
          aiBooster: expect.objectContaining({
            ticketsWithAISuggestions: 3,
            suggestionsAcceptanceRate: expect.stringMatching(/%$/),
          }),
          recommendations: expect.arrayContaining([
            expect.stringContaining("Strong resolution rate"),
            expect.stringContaining("High active tickets"),
          ]),
        }),
      );
      expect(mockGetAgentTickets).toHaveBeenCalledWith(
        "agent-1",
        expect.any(Date),
      );
    });

    it("handles empty ticket set", async () => {
      mockGetAgentTickets.mockResolvedValue([]);

      const result = await getAgentAugmentationStats("agent-2");

      expect(result.stats).toEqual(
        expect.objectContaining({
          totalTicketsHandled: 0,
          resolved: 0,
          active: 0,
          resolutionRate: "0",
        }),
      );
      expect(result.recommendations).toEqual([]);
    });

    it("returns null on repository error", async () => {
      mockGetAgentTickets.mockRejectedValue(new Error("stats failure"));

      const result = await getAgentAugmentationStats("agent-3");

      expect(result).toBeNull();
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: expect.any(Error), agentId: "agent-3" },
        "Error calculating agent stats",
      );
    });
  });
});
