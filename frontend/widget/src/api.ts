/**
 * API client for the HelpForge widget endpoints.
 *
 * Two send modes:
 *   sendMessage()       — standard JSON POST, returns WidgetChatResponse
 *   streamMessage()     — SSE via fetch + ReadableStream, yields string tokens
 *                         and resolves with the final StreamMetaEvent
 */

import type {
  StreamMetaEvent,
  WidgetChatRequest,
  WidgetChatResponse,
} from "./types";

export class WidgetApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WidgetApiError";
  }
}

// ── Standard request/response ─────────────────────────────────────────────────

export async function sendMessage(
  apiUrl: string,
  payload: WidgetChatRequest,
): Promise<WidgetChatResponse> {
  const resp = await fetch(`${apiUrl}/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new WidgetApiError(resp.status, detail);
  }

  return resp.json() as Promise<WidgetChatResponse>;
}

// ── SSE streaming ─────────────────────────────────────────────────────────────

/**
 * Stream a chat message via SSE.
 *
 * Calls `onToken(chunk)` for each text chunk.
 * Returns the final StreamMetaEvent once [DONE] is received.
 */
export async function streamMessage(
  apiUrl: string,
  payload: WidgetChatRequest,
  onToken: (chunk: string) => void,
): Promise<StreamMetaEvent> {
  const resp = await fetch(`${apiUrl}/widget/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new WidgetApiError(resp.status, detail);
  }

  if (!resp.body) {
    throw new WidgetApiError(0, "Response body is null");
  }

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";
  let meta: StreamMetaEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? ""; // keep incomplete last chunk

    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();

      if (data === "[DONE]") {
        break;
      }
      if (data === "[ERROR]") {
        throw new WidgetApiError(500, "Server error during streaming");
      }

      // Check if it's a meta object
      if (data.startsWith("{")) {
        try {
          const parsed = JSON.parse(data) as StreamMetaEvent;
          if (parsed.type === "meta") {
            meta = parsed;
            continue;
          }
        } catch {
          // Not JSON — treat as a token
        }
      }

      onToken(data);
    }
  }

  return (
    meta ?? {
      type: "meta",
      escalated: false,
      confidence: 0,
      actions: [],
    }
  );
}
