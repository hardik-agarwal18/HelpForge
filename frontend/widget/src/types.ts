// ── API contract ──────────────────────────────────────────────────────────────

export type PageType = "product" | "pricing" | "docs" | "general";

export interface WidgetContext {
  page: PageType;
  product_id?: string;
  metadata?: Record<string, unknown>;
}

export interface WidgetAction {
  type: "open_docs" | "view_pricing" | "contact_form" | "none";
  label: string;
  url?: string;
}

export interface WidgetChatRequest {
  session_id: string;
  org_id: string;
  message: string;
  context: WidgetContext;
}

export interface WidgetChatResponse {
  reply: string;
  actions: WidgetAction[];
  confidence: number;
  escalated: boolean;
  ticket_id?: string;
  session_id: string;
  trace_id?: string;
}

// SSE meta event emitted before [DONE]
export interface StreamMetaEvent {
  type: "meta";
  escalated: boolean;
  ticket_id?: string;
  trace_id?: string;
  confidence: number;
  actions: WidgetAction[];
}

// ── Widget configuration ──────────────────────────────────────────────────────

export interface WidgetConfig {
  /** Organisation ID (required) */
  orgId: string;
  /** Base URL of the chatbot service, e.g. https://chat.yourapp.com */
  apiUrl: string;
  /** Display name shown in the widget header */
  botName?: string;
  /** Placeholder text in the input field */
  placeholder?: string;
  /** Primary brand colour (hex or CSS variable) */
  primaryColor?: string;
  /** Page context — injected by the embed script */
  context?: Partial<WidgetContext>;
  /** Use SSE streaming (default true) */
  streaming?: boolean;
}

// ── Internal message shape ────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  /** Partial text accumulating during streaming */
  streaming?: boolean;
  /** Set on the final assistant message when escalated */
  escalated?: boolean;
  ticket_id?: string;
  actions?: WidgetAction[];
}
