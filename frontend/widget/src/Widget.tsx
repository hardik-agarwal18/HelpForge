/**
 * HelpForge Chat Widget
 * ─────────────────────
 * Self-contained floating chat widget.
 *
 * Features:
 *  • Floating button → expands to chat window
 *  • SSE streaming (falls back to standard fetch if streaming=false)
 *  • localStorage session persistence (30-min sliding TTL)
 *  • Page context injection (product / pricing / docs / general)
 *  • Escalation state — shows ticket ID when escalated
 *  • Action chips rendered below assistant replies
 *  • Accessible: keyboard nav, aria labels, focus trap in open state
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { sendMessage, streamMessage, WidgetApiError } from "./api";
import { clearSession, getOrCreateSessionId, touchSession } from "./session";
import type { Message, WidgetConfig } from "./types";

// ── Icons (inline SVG) ────────────────────────────────────────────────────────

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

let _msgCounter = 0;
function newId(): string {
  return `msg_${Date.now()}_${++_msgCounter}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  config: WidgetConfig;
}

export function Widget({ config }: Props) {
  const {
    orgId,
    apiUrl,
    botName = "Support",
    placeholder = "Type a message…",
    primaryColor,
    context: pageContext = {},
    streaming = true,
  } = config;

  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [sessionId]           = useState(() => getOrCreateSessionId());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Inject welcome message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          id:        newId(),
          role:      "assistant",
          content:   `Hi there! I'm ${botName}. How can I help you today?`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [open, messages.length, botName]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    touchSession();
    setInput("");
    setBusy(true);

    // Add user message
    const userMsg: Message = {
      id:        newId(),
      role:      "user",
      content:   text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Add placeholder streaming bubble
    const asstId = newId();
    setMessages((prev) => [
      ...prev,
      { id: asstId, role: "assistant", content: "", timestamp: Date.now(), streaming: true },
    ]);

    const payload = {
      session_id: sessionId,
      org_id:     orgId,
      message:    text,
      context: {
        page:       pageContext.page ?? "general",
        product_id: pageContext.product_id,
        metadata:   pageContext.metadata ?? {},
      },
    };

    try {
      if (streaming) {
        let accumulated = "";
        const meta = await streamMessage(apiUrl, payload, (chunk) => {
          accumulated += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstId ? { ...m, content: accumulated } : m,
            ),
          );
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstId
              ? {
                  ...m,
                  streaming:  false,
                  escalated:  meta.escalated,
                  ticket_id:  meta.ticket_id,
                  actions:    meta.actions,
                }
              : m,
          ),
        );

        if (meta.escalated) {
          clearSession();
        }
      } else {
        const resp = await sendMessage(apiUrl, payload);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstId
              ? {
                  ...m,
                  content:   resp.reply,
                  streaming: false,
                  escalated: resp.escalated,
                  ticket_id: resp.ticket_id,
                  actions:   resp.actions,
                }
              : m,
          ),
        );

        if (resp.escalated) {
          clearSession();
        }
      }
    } catch (err) {
      const detail =
        err instanceof WidgetApiError && err.status === 429
          ? "Too many messages. Please wait a moment."
          : "Something went wrong. Please try again.";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstId
            ? { ...m, content: detail, streaming: false }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [input, busy, sessionId, orgId, apiUrl, streaming, pageContext]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // CSS variable for brand colour
  const cssVars = primaryColor
    ? ({ "--hf-primary": primaryColor } as React.CSSProperties)
    : {};

  return (
    <div className="hf-widget-root" style={cssVars}>
      {/* Floating action button */}
      <button
        className="hf-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="hf-window"
          role="dialog"
          aria-label="Chat with support"
          aria-modal="false"
        >
          {/* Header */}
          <div className="hf-header">
            <div>
              <div className="hf-header-title">{botName}</div>
              <div className="hf-header-sub">We typically reply in seconds</div>
            </div>
            <button
              className="hf-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Messages */}
          <div className="hf-messages" role="log" aria-live="polite">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`hf-msg hf-msg-${msg.role}`}
              >
                <div className={`hf-bubble hf-bubble-${msg.role}`}>
                  {msg.streaming && !msg.content ? (
                    <div className="hf-typing">
                      <div className="hf-dot" />
                      <div className="hf-dot" />
                      <div className="hf-dot" />
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {/* Action chips */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="hf-actions">
                    {msg.actions.map((action, i) =>
                      action.url ? (
                        <a
                          key={i}
                          href={action.url}
                          className="hf-action-chip"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {action.label}
                        </a>
                      ) : (
                        <span key={i} className="hf-action-chip">
                          {action.label}
                        </span>
                      ),
                    )}
                  </div>
                )}

                {/* Escalation ticket badge */}
                {msg.escalated && msg.ticket_id && (
                  <div className="hf-ticket-badge">
                    Ticket #{msg.ticket_id} created
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className="hf-input-row">
            <textarea
              ref={inputRef}
              className="hf-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={busy}
              aria-label="Type your message"
            />
            <button
              className="hf-send-btn"
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>

          {/* Branding */}
          <div className="hf-branding">Powered by HelpForge</div>
        </div>
      )}
    </div>
  );
}
