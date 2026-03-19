/**
 * AI Automation Constants
 * Centralized configuration for guard constraints, thresholds, and rules
 */

// ============================================================================
// GUARD CONSTRAINTS
// ============================================================================

/**
 * Maximum AI responses allowed per ticket
 * After reaching this limit, AI will no longer respond
 */
export const AI_MAX_MESSAGES_PER_TICKET = 5;

/**
 * Cooldown period between consecutive AI responses (in milliseconds)
 * Prevents rapid-fire AI responses on the same ticket
 */
export const AI_COMMENT_COOLDOWN_MS = 30 * 1000; // 30 seconds

// ============================================================================
// CONFIDENCE THRESHOLDS
// ============================================================================

/**
 * Confidence threshold for auto-resolving tickets
 * If AI confidence >= this value, ticket can be automatically resolved
 * Higher threshold = more conservative
 */
export const CONFIDENCE_THRESHOLD_AUTO_CLOSE = 0.85;

/**
 * Confidence threshold for suggesting solutions
 * If AI confidence >= this value, show suggestion to user
 */
export const CONFIDENCE_THRESHOLD_SUGGEST = 0.5;

/**
 * Confidence threshold for smart assignment
 * If AI confidence >= this value, suggest assignment to agent
 */
export const CONFIDENCE_THRESHOLD_SMART_ASSIGN = 0.65;

/**
 * Confidence threshold for basic response
 * Responses below this are stored without action
 */
export const CONFIDENCE_THRESHOLD_ASSIGN = 0.0;

// ============================================================================
// PRIORITY RULES
// ============================================================================

/**
 * Auto-assign urgent tickets regardless of AI confidence
 */
export const URGENT_AUTO_ASSIGN = true;

/**
 * Auto-assign high priority tickets
 * Only applies if AI confidence is below threshold
 */
export const HIGH_AUTO_ASSIGN = false;

/**
 * Auto-assign medium priority tickets
 * Only applies if AI confidence is below threshold
 */
export const MEDIUM_AUTO_ASSIGN = false;

// ============================================================================
// TEXT ANALYSIS KEYWORDS
// ============================================================================

/**
 * Keywords indicating uncertainty in AI responses
 * Responses containing these reduce confidence score
 */
export const UNCERTAINTY_KEYWORDS = [
  "maybe",
  "probably",
  "not sure",
  "unclear",
  "sorry",
  "i think",
  "might be",
  "could be",
  "uncertain",
  "not certain",
];

/**
 * Keywords indicating the response needs human review
 */
export const REVIEW_KEYWORDS = [
  "error",
  "failed",
  "critical",
  "issue",
  "problem",
];

// ============================================================================
// RESPONSE QUALITY CONSTRAINTS
// ============================================================================

/**
 * Minimum response length (in characters)
 * Responses shorter than this are considered low quality
 */
export const MIN_RESPONSE_LENGTH = 50;

/**
 * Maximum response length (in characters)
 * Responses longer than this are truncated or warned
 */
export const MAX_RESPONSE_LENGTH = 3000;

/**
 * Minimum word count for a valid response
 */
export const MIN_RESPONSE_WORD_COUNT = 10;

/**
 * Good response length range (in characters)
 */
export const OPTIMAL_RESPONSE_LENGTH = {
  MIN: 100,
  MAX: 500,
};

// ============================================================================
// TICKET AGE CLASSIFICATIONS
// ============================================================================

/**
 * Time threshold for "recent" tickets (in milliseconds)
 * Tickets newer than this are considered recent
 */
export const RECENT_TICKET_MS = 3600000; // 1 hour

/**
 * Time threshold for "aged" tickets (in milliseconds)
 * Tickets older than this are considered aged
 */
export const AGED_TICKET_MS = 86400000; // 24 hours

// ============================================================================
// CONFIDENCE SCORE FACTORS
// ============================================================================

/**
 * Confidence adjustment factors for different conditions
 */
export const CONFIDENCE_FACTORS = {
  // Response length factors
  GOOD_LENGTH: 0.15, // 100-500 chars boost
  LONG_LENGTH: 0.05, // 500+ chars slight boost (diminishing return)
  SHORT_LENGTH: -0.1, // < 100 chars penalty

  // Uncertainty factors
  HAS_PROBLEM_KEYWORDS: -0.2, // Uncertainty keywords found
  NO_PROBLEM_KEYWORDS: 0, // No penalty if clear

  // Follow-up factors
  IS_FOLLOW_UP: -0.1, // More complex if follow-up
  FIRST_RESPONSE: 0.05, // Easier if first response

  // Priority factors
  LOW_PRIORITY: 0.1, // Lower risk, higher confidence
  MEDIUM_PRIORITY: 0, // Baseline
  HIGH_PRIORITY: -0.1, // Moderate caution
  URGENT_PRIORITY: -0.2, // High caution

  // Ticket age factors
  RECENT_TICKET: 0.1, // Newer tickets easier to resolve
  AGED_TICKET: -0.1, // Older tickets harder

  // Context factors
  RICH_CONTEXT: 0.05, // 5+ comments
  SINGLE_ISSUE: 0.08, // Just 1 comment
  WITH_ATTACHMENTS: -0.05, // Complex issue
  WITHOUT_ATTACHMENTS: 0.03, // Simpler issue
  GOOD_DESCRIPTION: 0.08, // 200+ char description
};

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * AI action decision types
 */
export const ACTION_TYPES = {
  AUTO_RESOLVE: "auto_resolve", // High confidence - auto close
  SMART_ASSIGN: "smart_assign", // Moderate-high - assign to agent
  SUGGEST: "suggest", // Medium - show suggestion
  STORE_AND_WAIT: "store_and_wait", // Low - just store
};

// ============================================================================
// RESPONSE MARKERS
// ============================================================================

/**
 * Formatted prefixes for different response types
 */
export const RESPONSE_MARKERS = {
  AUTO_RESOLVE: "✅ **AI Resolution**:",
  SUGGEST: "💡 **AI Suggestion**:",
  SMART_ASSIGN: "👤 **AI Recommendation**:",
  INTERNAL_NOTE: "*[Internal AI Note]*:",
};

// ============================================================================
// STATUS UPDATES
// ============================================================================

/**
 * Ticket status constants
 */
export const TICKET_STATUSES = {
  NEW: "NEW",
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  AWAITING_FEEDBACK: "AWAITING_FEEDBACK",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
};

/**
 * Status transitions triggered by AI actions
 */
export const STATUS_TRANSITIONS = {
  AUTO_RESOLVE: "RESOLVED",
  SMART_ASSIGN: "IN_PROGRESS",
  SUGGEST: "AWAITING_FEEDBACK",
};

// ============================================================================
// LOGGING & DEBUG
// ============================================================================

/**
 * Log levels for AI automation
 */
export const LOG_LEVELS = {
  DEBUG: "DEBUG", // Detailed debugging info
  INFO: "INFO", // General information
  WARN: "WARN", // Warnings
  ERROR: "ERROR", // Errors
};

/**
 * Guard rejection reasons
 */
export const GUARD_REASONS = {
  AI_DISABLED: "AI_DISABLED",
  MAX_MESSAGES_REACHED: "MAX_MESSAGES_REACHED",
  COOLDOWN_ACTIVE: "COOLDOWN_ACTIVE",
  ALREADY_IN_PROGRESS: "ALREADY_IN_PROGRESS",
};

/**
 * Decision rejection reasons
 */
export const DECISION_REASONS = {
  PASSED_GUARDS: "PASSED_GUARDS",
  MAX_RESPONSES_REACHED: "MAX_RESPONSES_REACHED",
  AI_DISABLED: "AI_DISABLED",
  ALREADY_IN_PROGRESS: "ALREADY_IN_PROGRESS",
};

/**
 * Aggregated decision rules used by the decision engine.
 * Keep this as the single source of truth for rule thresholds.
 */
export const DECISION_RULES = {
  MAX_AI_RESPONSES: AI_MAX_MESSAGES_PER_TICKET,
  CONFIDENCE_THRESHOLD_AUTO_CLOSE,
  CONFIDENCE_THRESHOLD_SUGGEST,
  CONFIDENCE_THRESHOLD_ASSIGN,
  SMART_ASSIGN_THRESHOLD: CONFIDENCE_THRESHOLD_SMART_ASSIGN,
  URGENT_AUTO_ASSIGN,
  HIGH_AUTO_ASSIGN,
};
