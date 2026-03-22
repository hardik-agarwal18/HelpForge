/**
 * Widget CSS exported as a string for injection into the host page <head>.
 * This allows the widget to work in shadow DOM, iframes, and plain HTML pages
 * without a separate CSS file request.
 *
 * The STYLES constant in Widget.tsx is the source of truth for the actual rules;
 * this file re-exports it under a stable name consumed by index.ts.
 */

export const WIDGET_STYLES = `
.hf-widget-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.hf-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 9998;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--hf-primary, #2563eb); color: #fff;
  border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.24);
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease, box-shadow .15s ease;
}
.hf-fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,.32); }
.hf-fab svg { width: 26px; height: 26px; fill: currentColor; }
.hf-window {
  position: fixed; bottom: 92px; right: 24px; z-index: 9999;
  width: 360px; max-width: calc(100vw - 32px);
  height: 520px; max-height: calc(100vh - 120px);
  border-radius: 16px; background: #fff;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
  display: flex; flex-direction: column;
  animation: hf-slide-up .2s ease;
}
@keyframes hf-slide-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
.hf-header {
  padding: 14px 16px; border-radius: 16px 16px 0 0;
  background: var(--hf-primary, #2563eb); color: #fff;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.hf-header-title { font-size: 15px; font-weight: 600; }
.hf-header-sub { font-size: 12px; opacity: .75; margin-top: 1px; }
.hf-close-btn {
  background: none; border: none; cursor: pointer; color: #fff;
  opacity: .8; padding: 4px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
.hf-close-btn:hover { opacity: 1; background: rgba(255,255,255,.15); }
.hf-messages {
  flex: 1; overflow-y: auto; padding: 16px 12px;
  display: flex; flex-direction: column; gap: 10px;
  scroll-behavior: smooth;
}
.hf-msg { display: flex; flex-direction: column; max-width: 88%; }
.hf-msg-user { align-self: flex-end; }
.hf-msg-assistant { align-self: flex-start; }
.hf-msg-system { align-self: center; }
.hf-bubble {
  padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
}
.hf-bubble-user {
  background: var(--hf-primary, #2563eb); color: #fff;
  border-bottom-right-radius: 4px;
}
.hf-bubble-assistant {
  background: #f1f5f9; color: #1e293b;
  border-bottom-left-radius: 4px;
}
.hf-bubble-system {
  background: #fef9c3; color: #854d0e;
  border-radius: 8px; font-size: 13px; text-align: center;
}
.hf-typing { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
.hf-dot { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; animation: hf-bounce .9s infinite; }
.hf-dot:nth-child(2) { animation-delay: .15s; }
.hf-dot:nth-child(3) { animation-delay: .30s; }
@keyframes hf-bounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
.hf-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.hf-action-chip {
  font-size: 12px; padding: 5px 10px; border-radius: 20px;
  background: #e2e8f0; color: #1e293b;
  border: none; cursor: pointer; text-decoration: none;
  transition: background .15s;
}
.hf-action-chip:hover { background: #cbd5e1; }
.hf-ticket-badge {
  font-size: 11px; color: #64748b; margin-top: 4px; padding-left: 2px;
}
.hf-input-row {
  display: flex; gap: 8px; padding: 10px 12px;
  border-top: 1px solid #e2e8f0; flex-shrink: 0; align-items: flex-end;
}
.hf-input {
  flex: 1; resize: none; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 8px 12px; font-size: 14px; line-height: 1.5;
  outline: none; max-height: 100px; min-height: 40px;
  font-family: inherit; color: #1e293b; background: #f8fafc;
}
.hf-input:focus { border-color: var(--hf-primary, #2563eb); background: #fff; }
.hf-send-btn {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  background: var(--hf-primary, #2563eb); color: #fff;
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .15s;
}
.hf-send-btn:disabled { opacity: .45; cursor: not-allowed; }
.hf-send-btn svg { width: 16px; height: 16px; fill: currentColor; }
.hf-branding {
  text-align: center; font-size: 10px; color: #94a3b8;
  padding: 4px 0 8px; flex-shrink: 0;
}
`;
