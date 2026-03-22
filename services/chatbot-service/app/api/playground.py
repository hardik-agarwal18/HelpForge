"""
Agent Playground
─────────────────
Two endpoints:

  POST /playground/run
    • Accepts an AgentRequest, forces dry_run=True, executes the full agent
      reasoning pipeline (real LLM calls), simulates all tool executions,
      and returns a DryRunTrace + final AgentDecision.
    • Available in all environments (internal use, CI, debugging).

  GET /playground
    • Serves a self-contained HTML visualiser for the playground.
    • Only available when settings.debug=True (hidden in production).
    • Renders the dry run trace as a step-by-step timeline with:
        – LLM decision cards (action, confidence, reasoning)
        – Simulated tool call cards (inputs, mock outputs, cost badge)
        – Final decision banner
        – Latency breakdown

Security: the POST endpoint is not protected by internal auth here so it
can be called from the HTML form in a browser.  In production environments
where debug=False the GET route is disabled so the HTML form is never served,
effectively making the POST endpoint unreachable from outside.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from app.agent.schema import AgentInput, AgentMode
from app.config.settings import settings
from app.models.schemas import AgentRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/playground", tags=["playground"])


# ── POST /playground/run ──────────────────────────────────────────────────────

@router.post("/run")
async def playground_run(request: AgentRequest) -> JSONResponse:
    """
    Execute the agent in dry run mode and return the full reasoning trace.

    The LLM decision calls are real — you see actual model reasoning.
    Tool executions are simulated — no side-effects on tickets or the DB.
    """
    from app.agent.agent import unified_agent

    inp = AgentInput(
        mode=AgentMode(request.mode),
        org_id=request.org_id,
        ticket_id=request.ticket_id,
        user_id=request.user_id,
        query=request.query,
        ticket_context=request.ticket_context,
        rag_context=request.rag_context,
        history=request.history,
        extra=request.extra,
        dry_run=True,  # always forced — playground is always a dry run
    )

    decision = await unified_agent.run(inp)

    trace = decision.metadata.get("dry_run_trace", {})

    return JSONResponse(
        content={
            "dry_run": True,
            "decision": decision.model_dump(),
            "trace": trace,
        }
    )


# ── GET /playground — HTML visualiser (debug only) ────────────────────────────

@router.get("", response_class=HTMLResponse)
async def playground_ui(request: Request) -> HTMLResponse:
    """
    Self-contained HTML playground visualiser.
    Only available when settings.debug=True.
    """
    if not settings.debug:
        raise HTTPException(
            status_code=404,
            detail="Playground UI is disabled in production (debug=False)",
        )
    return HTMLResponse(content=_PLAYGROUND_HTML)


# ── Embedded HTML ─────────────────────────────────────────────────────────────

_PLAYGROUND_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HelpForge Agent Playground</title>
<style>
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3e;
    --text: #e2e8f0; --muted: #64748b; --accent: #6366f1;
    --green: #22c55e; --yellow: #eab308; --red: #ef4444;
    --blue: #3b82f6; --purple: #a855f7; --orange: #f97316;
    --radius: 8px; --font: 'Inter', system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font);
         font-size: 14px; line-height: 1.6; }
  .layout { display: grid; grid-template-columns: 380px 1fr; height: 100vh; }

  /* ── Left panel ── */
  .panel-left { background: var(--surface); border-right: 1px solid var(--border);
                 display: flex; flex-direction: column; overflow: hidden; }
  .panel-header { padding: 20px; border-bottom: 1px solid var(--border); }
  .panel-header h1 { font-size: 18px; font-weight: 700; color: var(--text);
                      display: flex; align-items: center; gap: 8px; }
  .panel-header p { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .form-body { padding: 16px; overflow-y: auto; flex: 1; display: flex;
               flex-direction: column; gap: 12px; }
  label { display: block; font-size: 11px; font-weight: 600; color: var(--muted);
          text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  input, select, textarea {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text); padding: 8px 10px;
    font-family: var(--font); font-size: 13px; outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 90px; font-family: 'JetBrains Mono', monospace;
             font-size: 12px; }
  .btn {
    width: 100%; padding: 10px; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius); font-size: 14px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s; display: flex; align-items: center;
    justify-content: center; gap: 8px; margin-top: 4px;
  }
  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-secondary { background: var(--border); color: var(--text); }
  .example-btns { display: flex; gap: 6px; flex-wrap: wrap; }
  .example-btn { padding: 4px 10px; font-size: 11px; background: var(--border);
                 color: var(--muted); border: none; border-radius: 20px; cursor: pointer; }
  .example-btn:hover { color: var(--text); }

  /* ── Right panel ── */
  .panel-right { display: flex; flex-direction: column; overflow: hidden; }
  .panel-right-header { padding: 20px 24px; border-bottom: 1px solid var(--border);
                         display: flex; align-items: center; justify-content: space-between; }
  .panel-right-header h2 { font-size: 15px; font-weight: 600; }
  .trace-container { flex: 1; overflow-y: auto; padding: 24px; }

  /* ── Empty state ── */
  .empty { display: flex; flex-direction: column; align-items: center;
           justify-content: center; height: 100%; color: var(--muted); gap: 12px; }
  .empty-icon { font-size: 48px; opacity: 0.4; }
  .empty p { font-size: 13px; }

  /* ── Spinner ── */
  .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3);
             border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Step cards ── */
  .step-card { background: var(--surface); border: 1px solid var(--border);
               border-radius: var(--radius); margin-bottom: 14px;
               overflow: hidden; }
  .step-header { padding: 12px 14px; display: flex; align-items: center;
                 gap: 10px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .step-header:hover { background: rgba(255,255,255,0.02); }
  .step-num { width: 26px; height: 26px; border-radius: 50%; background: var(--border);
              display: flex; align-items: center; justify-content: center;
              font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .step-title { flex: 1; font-weight: 600; font-size: 13px; }
  .step-meta { display: flex; align-items: center; gap: 8px; }
  .badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-respond  { background: rgba(34,197,94,0.15);  color: var(--green); }
  .badge-tool_call { background: rgba(59,130,246,0.15); color: var(--blue); }
  .badge-escalate { background: rgba(239,68,68,0.15);  color: var(--red); }
  .badge-suggest  { background: rgba(234,179,8,0.15);  color: var(--yellow); }
  .badge-simulated { background: rgba(168,85,247,0.15); color: var(--purple); }
  .badge-low  { background: rgba(34,197,94,0.1);  color: var(--green); }
  .badge-medium { background: rgba(234,179,8,0.1); color: var(--yellow); }
  .badge-high { background: rgba(239,68,68,0.1);  color: var(--red); }
  .step-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .step-body.hidden { display: none; }
  .field-row { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: start; }
  .field-label { color: var(--muted); font-size: 11px; font-weight: 600;
                 text-transform: uppercase; padding-top: 2px; }
  .field-value { font-size: 13px; word-break: break-word; }
  .confidence-bar { height: 6px; background: var(--border); border-radius: 3px;
                    overflow: hidden; margin-top: 4px; }
  .confidence-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
  pre { background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
        padding: 10px; font-size: 11px; overflow-x: auto; color: #94a3b8;
        font-family: 'JetBrains Mono', monospace; white-space: pre-wrap; }
  .latency { color: var(--muted); font-size: 11px; }

  /* ── Final decision banner ── */
  .final-banner { border-radius: var(--radius); padding: 20px; margin-bottom: 14px;
                  border-left: 4px solid; }
  .final-respond  { background: rgba(34,197,94,0.08);  border-color: var(--green); }
  .final-escalate { background: rgba(239,68,68,0.08);  border-color: var(--red); }
  .final-suggest  { background: rgba(234,179,8,0.08);  border-color: var(--yellow); }
  .final-tool_call { background: rgba(59,130,246,0.08); border-color: var(--blue); }
  .final-label { font-size: 11px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: 0.08em; color: var(--muted); margin-bottom: 8px; }
  .final-message { font-size: 15px; line-height: 1.7; }
  .final-meta { margin-top: 12px; display: flex; gap: 16px; flex-wrap: wrap; }
  .final-meta-item { font-size: 12px; color: var(--muted); }
  .final-meta-item strong { color: var(--text); }

  /* ── Summary bar ── */
  .summary-bar { display: flex; gap: 20px; flex-wrap: wrap; }
  .summary-stat { font-size: 12px; color: var(--muted); }
  .summary-stat strong { color: var(--text); font-size: 15px; display: block; }

  /* ── Error ── */
  .error-box { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
               border-radius: var(--radius); padding: 14px; color: var(--red); font-size: 13px; }
  .toggle-arrow { transition: transform 0.2s; color: var(--muted); }
  .toggle-arrow.open { transform: rotate(90deg); }
</style>
</head>
<body>
<div class="layout">

  <!-- Left: Input Panel -->
  <div class="panel-left">
    <div class="panel-header">
      <h1>⚗️ Agent Playground</h1>
      <p>Dry-run mode — real LLM reasoning, simulated tool calls</p>
    </div>
    <div class="form-body">
      <div>
        <label>Mode</label>
        <select id="mode">
          <option value="chat">chat</option>
          <option value="automation">automation</option>
          <option value="augmentation">augmentation</option>
        </select>
      </div>
      <div>
        <label>Org ID</label>
        <input id="org_id" type="text" value="demo-org-001" placeholder="org_abc">
      </div>
      <div>
        <label>Ticket ID</label>
        <input id="ticket_id" type="text" value="ticket-001" placeholder="ticket-xyz">
      </div>
      <div>
        <label>Query / Event Description</label>
        <textarea id="query" rows="3" placeholder="What is the query or event?">How do I reset my password?</textarea>
      </div>
      <div>
        <label>Ticket Context (JSON)</label>
        <textarea id="ticket_context" rows="4">{
  "priority": "MEDIUM",
  "status": "OPEN",
  "category": "Account"
}</textarea>
      </div>
      <div>
        <label>Examples</label>
        <div class="example-btns">
          <button class="example-btn" onclick="loadExample('chat')">Chat FAQ</button>
          <button class="example-btn" onclick="loadExample('tool')">Tool Call</button>
          <button class="example-btn" onclick="loadExample('escalate')">Escalation</button>
          <button class="example-btn" onclick="loadExample('automation')">Automation</button>
          <button class="example-btn" onclick="loadExample('augmentation')">Augmentation</button>
        </div>
      </div>
      <button class="btn" id="run-btn" onclick="runPlayground()">
        <span id="btn-label">▶ Run Agent</span>
        <div class="spinner" id="spinner" style="display:none"></div>
      </button>
      <button class="btn btn-secondary" onclick="clearTrace()">Clear</button>
    </div>
  </div>

  <!-- Right: Trace Panel -->
  <div class="panel-right">
    <div class="panel-right-header">
      <h2>Reasoning Trace</h2>
      <div class="summary-bar" id="summary-bar" style="display:none">
        <div class="summary-stat"><strong id="stat-steps">0</strong>Steps</div>
        <div class="summary-stat"><strong id="stat-tools">0</strong>Tool Calls</div>
        <div class="summary-stat"><strong id="stat-latency">0ms</strong>Latency</div>
        <div class="summary-stat"><strong id="stat-confidence">0%</strong>Confidence</div>
      </div>
    </div>
    <div class="trace-container" id="trace-container">
      <div class="empty">
        <div class="empty-icon">⚗️</div>
        <p>Fill in the form and click <strong>Run Agent</strong></p>
        <p>You'll see the full reasoning trace here</p>
      </div>
    </div>
  </div>

</div>

<script>
const EXAMPLES = {
  chat: {
    mode: 'chat', org_id: 'demo-org', ticket_id: 'ticket-001',
    query: 'How do I reset my password?',
    ctx: '{"priority":"LOW","status":"OPEN","category":"Account"}'
  },
  tool: {
    mode: 'chat', org_id: 'demo-org', ticket_id: 'ticket-002',
    query: 'Please mark my ticket as resolved, the issue is fixed.',
    ctx: '{"priority":"MEDIUM","status":"OPEN","category":"Technical"}'
  },
  escalate: {
    mode: 'chat', org_id: 'demo-org', ticket_id: 'ticket-003',
    query: 'My entire system is down and I need immediate help. Nothing works!',
    ctx: '{"priority":"URGENT","status":"OPEN","category":"Infrastructure"}'
  },
  automation: {
    mode: 'automation', org_id: 'demo-org', ticket_id: 'ticket-004',
    query: 'User commented: I still have not heard back after 3 days.',
    ctx: '{"priority":"HIGH","status":"OPEN","category":"Support","event_type":"comment_added"}'
  },
  augmentation: {
    mode: 'augmentation', org_id: 'demo-org', ticket_id: 'ticket-005',
    query: 'What should I say to this user? They seem frustrated.',
    ctx: '{"priority":"MEDIUM","status":"IN_PROGRESS","category":"Billing","assigned_to":"agent-007"}'
  }
};

function loadExample(key) {
  const ex = EXAMPLES[key];
  document.getElementById('mode').value = ex.mode;
  document.getElementById('org_id').value = ex.org_id;
  document.getElementById('ticket_id').value = ex.ticket_id;
  document.getElementById('query').value = ex.query;
  document.getElementById('ticket_context').value = ex.ctx;
}

function clearTrace() {
  document.getElementById('trace-container').innerHTML = `
    <div class="empty">
      <div class="empty-icon">⚗️</div>
      <p>Fill in the form and click <strong>Run Agent</strong></p>
      <p>You'll see the full reasoning trace here</p>
    </div>`;
  document.getElementById('summary-bar').style.display = 'none';
}

async function runPlayground() {
  const btn = document.getElementById('run-btn');
  const label = document.getElementById('btn-label');
  const spinner = document.getElementById('spinner');
  btn.disabled = true; label.textContent = 'Running…'; spinner.style.display = 'block';

  let ctxParsed = {};
  try { ctxParsed = JSON.parse(document.getElementById('ticket_context').value); }
  catch(e) { ctxParsed = {}; }

  const payload = {
    mode: document.getElementById('mode').value,
    org_id: document.getElementById('org_id').value,
    ticket_id: document.getElementById('ticket_id').value,
    query: document.getElementById('query').value,
    ticket_context: ctxParsed,
    extra: {}
  };

  try {
    const res = await fetch('/playground/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    renderTrace(data);
  } catch(err) {
    document.getElementById('trace-container').innerHTML =
      `<div class="error-box">❌ Error: ${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false; label.textContent = '▶ Run Agent'; spinner.style.display = 'none';
  }
}

function renderTrace(data) {
  const trace = data.trace || {};
  const decision = data.decision || {};
  const steps = trace.steps || [];
  const container = document.getElementById('trace-container');

  // Update summary bar
  const sb = document.getElementById('summary-bar');
  sb.style.display = 'flex';
  document.getElementById('stat-steps').textContent = steps.length;
  document.getElementById('stat-tools').textContent = trace.total_tool_calls || 0;
  document.getElementById('stat-latency').textContent =
    trace.total_latency_ms ? trace.total_latency_ms.toFixed(0) + 'ms' : '—';
  document.getElementById('stat-confidence').textContent =
    ((trace.final_confidence || 0) * 100).toFixed(0) + '%';

  let html = '';

  // Final decision banner
  const action = trace.final_action || decision.action || 'respond';
  html += `
    <div class="final-banner final-${action}">
      <div class="final-label">Final Decision — ${action.toUpperCase()}</div>
      <div class="final-message">${escHtml(trace.final_message || decision.message || '')}</div>
      <div class="final-meta">
        <div class="final-meta-item">Mode: <strong>${escHtml(trace.mode || '')}</strong></div>
        <div class="final-meta-item">Confidence: <strong>${((trace.final_confidence || 0)*100).toFixed(0)}%</strong></div>
        <div class="final-meta-item">LLM Calls: <strong>${trace.total_llm_calls || 1}</strong></div>
        <div class="final-meta-item">Tool Calls: <strong>${trace.total_tool_calls || 0}</strong></div>
        ${trace.total_latency_ms ? `<div class="final-meta-item">Total: <strong>${trace.total_latency_ms.toFixed(0)}ms</strong></div>` : ''}
      </div>
    </div>`;

  // Step cards
  steps.forEach((step, i) => {
    html += renderStep(step, i);
  });

  // Raw JSON toggle
  html += `
    <div class="step-card">
      <div class="step-header" onclick="toggleBody('raw-body','raw-arrow')">
        <div class="step-num" style="background:rgba(100,116,139,0.3)">{ }</div>
        <div class="step-title">Raw JSON Response</div>
        <span class="toggle-arrow" id="raw-arrow">▶</span>
      </div>
      <div class="step-body hidden" id="raw-body">
        <pre>${escHtml(JSON.stringify(data, null, 2))}</pre>
      </div>
    </div>`;

  container.innerHTML = html;
}

function renderStep(step, idx) {
  const id = `step-body-${idx}`;
  const arrowId = `step-arrow-${idx}`;
  const type = step.step_type || '';

  let icon = '🤖'; let titleExtra = '';
  if (type === 'llm_decision') { icon = '🧠'; titleExtra = 'Initial LLM Decision'; }
  else if (type === 'llm_followup') { icon = '🔄'; titleExtra = 'LLM Re-decision (post-tool)'; }
  else if (type === 'tool_simulated') { icon = '🔧'; titleExtra = `Tool: ${step.tool || ''}`; }
  else if (type === 'guard_block') { icon = '🛡️'; titleExtra = 'Guard Block'; }
  else if (type === 'step_limit') { icon = '⛔'; titleExtra = 'Step Limit Reached'; }

  let badges = '';
  if (step.action) badges += `<span class="badge badge-${step.action}">${step.action}</span>`;
  if (type === 'tool_simulated') badges += `<span class="badge badge-simulated">simulated</span>`;
  if (step.tool_cost) {
    const costCls = step.tool_cost.toLowerCase();
    badges += `<span class="badge badge-${costCls}">cost:${step.tool_cost}</span>`;
  }
  if (step.latency_ms) badges += `<span class="latency">${step.latency_ms}ms</span>`;

  let body = '';

  if (type.startsWith('llm')) {
    if (step.confidence !== null && step.confidence !== undefined) {
      const pct = (step.confidence * 100).toFixed(0);
      const color = step.confidence >= 0.7 ? '#22c55e' : step.confidence >= 0.4 ? '#eab308' : '#ef4444';
      body += `
        <div class="field-row">
          <div class="field-label">Confidence</div>
          <div class="field-value">
            ${pct}%
            <div class="confidence-bar">
              <div class="confidence-fill" style="width:${pct}%;background:${color}"></div>
            </div>
          </div>
        </div>`;
    }
    if (step.reasoning) body += fieldRow('Reasoning', step.reasoning);
    if (step.message && step.action !== 'tool_call') body += fieldRow('Message', step.message);
    if (step.tool) body += fieldRow('Chosen Tool', `<code>${step.tool}</code>`);
    if (step.tool_input && Object.keys(step.tool_input).length)
      body += fieldRow('Tool Input', `<pre>${escHtml(JSON.stringify(step.tool_input, null, 2))}</pre>`);
  }

  if (type === 'tool_simulated') {
    if (step.tool_input) body += fieldRow('Input', `<pre>${escHtml(JSON.stringify(step.tool_input, null, 2))}</pre>`);
    if (step.simulated_result) body += fieldRow('Mock Result', `<pre>${escHtml(JSON.stringify(step.simulated_result, null, 2))}</pre>`);
  }

  if (type === 'guard_block' || type === 'step_limit') {
    if (step.detail) body += fieldRow('Detail', step.detail);
  }

  return `
    <div class="step-card">
      <div class="step-header" onclick="toggleBody('${id}','${arrowId}')">
        <div class="step-num">${icon}</div>
        <div class="step-title">${escHtml(titleExtra)}</div>
        <div class="step-meta">${badges}</div>
        <span class="toggle-arrow" id="${arrowId}">▶</span>
      </div>
      <div class="step-body" id="${id}">${body || '<span style="color:var(--muted)">No details</span>'}</div>
    </div>`;
}

function fieldRow(label, value) {
  return `<div class="field-row">
    <div class="field-label">${escHtml(label)}</div>
    <div class="field-value">${value}</div>
  </div>`;
}

function toggleBody(bodyId, arrowId) {
  const el = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  if (el.classList.contains('hidden')) {
    el.classList.remove('hidden'); arrow.classList.add('open');
  } else {
    el.classList.add('hidden'); arrow.classList.remove('open');
  }
}

function escHtml(s) {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Expand first step automatically on load
document.addEventListener('DOMContentLoaded', () => {});
</script>
</body>
</html>
"""
