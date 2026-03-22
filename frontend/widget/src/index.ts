/**
 * HelpForge Chat Widget — public entry point
 *
 * Two consumption patterns:
 *
 * 1. React component (for projects already using React):
 *    import { Widget } from "@helpforge/chat-widget";
 *
 * 2. Standalone embed script (vanilla JS, no React required):
 *    <script src="https://cdn.yourapp.com/widget.umd.js"></script>
 *    <script>
 *      HelpForgeWidget.mount({
 *        orgId: "org_123",
 *        apiUrl: "https://chat.yourapp.com",
 *        botName: "Help Bot",
 *        primaryColor: "#2563eb",
 *        context: { page: "pricing" },
 *      });
 *    </script>
 */

import React from "react";
import { createRoot } from "react-dom/client";

import { Widget } from "./Widget";
import type { WidgetConfig } from "./types";

export { Widget } from "./Widget";
export type { WidgetConfig, WidgetContext, Message, WidgetAction } from "./types";

import { WIDGET_STYLES } from "./styles";

// ── Inject widget styles ──────────────────────────────────────────────────────

function injectStyles(css: string): void {
  if (document.getElementById("hf-widget-styles")) return;
  const style = document.createElement("style");
  style.id = "hf-widget-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

// ── Standalone mount API ──────────────────────────────────────────────────────

/**
 * Mount the widget into the page.
 *
 * Creates a dedicated container <div> and renders the Widget component into it.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function mount(config: WidgetConfig): void {
  if (document.getElementById("hf-widget-container")) return;

  injectStyles(WIDGET_STYLES);

  const container = document.createElement("div");
  container.id = "hf-widget-container";
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(React.createElement(Widget, { config }));
}
