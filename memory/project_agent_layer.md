---
name: Unified Agent Layer Implementation
description: The unified agent layer was designed and implemented in chatbot-service/app/agent/
type: project
---

The Unified Agent Layer has been fully implemented in the chatbot-service.

**Location:** `services/chatbot-service/app/agent/`

**Architecture:**
- `agent.py` — Main decision engine (UnifiedAgent class, `unified_agent` singleton)
- `executor.py` — Tool registry and execution engine (ToolExecutor, `tool_executor` singleton)
- `gateway.py` — ActionGatewayClient for tool → API Gateway calls (`action_gateway` singleton)
- `schema.py` — AgentDecision, AgentInput, AgentContext, AgentMode, AgentAction
- `utils.py` — extract_json, approx_tokens, truncate_to_tokens, format_history
- `validator.py` — AgentValidator for LLM output validation

**Tools (8):** create_ticket, update_ticket, fetch_ticket, assign_agent, escalate_ticket, search_docs, summarize_ticket, classify_ticket. All call `/api/ai/internal/agent/*` on the API Gateway.

**Modes (3):** ChatMode, AutomationMode, AugmentationMode — each builds LLM messages + system prompts.

**Prompts:** chat_prompt.py, automation_prompt.py, augmentation_prompt.py (underscore names, NOT dot names which aren't importable in Python).

**Integration points:**
- `chat_service.py` — routes CHAT mode through `unified_agent.run()` instead of direct RAG pipeline
- `internal/routes.py` — added `/internal/agent/run`, `/internal/agent/automation`, `/internal/agent/augmentation`
- `models/schemas.py` — added AgentRequest and AgentResponse schemas
- `main.py` — added `action_gateway.close()` to lifespan shutdown

**API Gateway action endpoints needed (Node.js TODO):**
- `POST /api/ai/internal/agent/tickets` — create
- `PUT /api/ai/internal/agent/tickets/:id` — update
- `GET /api/ai/internal/agent/tickets/:id` — fetch
- `POST /api/ai/internal/agent/tickets/:id/assign`
- `POST /api/ai/internal/agent/tickets/:id/escalate`
- `POST /api/ai/internal/agent/tickets/:id/summarize`
- `POST /api/ai/internal/agent/tickets/:id/classify`
- `POST /api/ai/internal/agent/search`

**Key design decisions:**
- MAX_TOOL_CALLS = 3 per agent run
- All tool calls go through API Gateway (not direct DB)
- AUGMENTATION mode never executes tools — always suggests
- Anti-injection rules hardcoded into every system prompt
- Fallback to ESCALATE on any parse/validation error (fail-safe)
- `.prompt.py` filenames (from spec) were replaced with `_prompt.py` because Python can't import dotted module names
