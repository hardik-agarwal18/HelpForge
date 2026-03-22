/**
 * Session management for the widget.
 *
 * Generates and persists a session_id in localStorage.
 * The session expires after 30 minutes of inactivity (matching the server TTL)
 * — tracked via a separate timestamp key.
 */

const SESSION_KEY   = "hf_widget_session_id";
const LAST_SEEN_KEY = "hf_widget_last_seen";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getOrCreateSessionId(): string {
  try {
    const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) ?? "0", 10);
    const expired  = Date.now() - lastSeen > TTL_MS;

    if (expired) {
      // Start a fresh session
      const id = generateId();
      localStorage.setItem(SESSION_KEY, id);
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      return id;
    }

    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      return existing;
    }

    const id = generateId();
    localStorage.setItem(SESSION_KEY, id);
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    return id;
  } catch {
    // localStorage unavailable (private browsing, iframe sandbox, etc.)
    return generateId();
  }
}

export function touchSession(): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LAST_SEEN_KEY);
  } catch {
    // ignore
  }
}
