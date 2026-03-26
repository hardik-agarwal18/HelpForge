# HelpForge

HelpForge is a multi-tenant support platform implemented in a modular microservices architecture.
The platform provides core operations for authentication, organization management, ticketing workflows, agent operations, AI-assisted automation, real-time notifications, and an AI-powered chatbot service.

## 1) Product Snapshot

### What is already implemented

- Auth with JWT access/refresh tokens and protected routes
- Organization lifecycle and membership management with role-based checks
- Ticket lifecycle with assignment, status updates, comments, attachments, tags, and activity logs
- Agent-focused APIs (my tickets, my stats, availability)
- AI automation queue with asynchronous comment analysis
- AI augmentation with context-aware agent suggestions
- Per-organization AI configuration and cost tracking
- Web scraping and content ingestion pipeline
- In-app notifications with preferences, BullMQ-backed delivery, and real-time WebSocket (Socket.IO) fan-out
- RAG-powered chatbot service (Python/FastAPI) for customer interactions
- Prometheus metrics and Grafana dashboards for observability
- Docker Compose deployment with full monitoring stack
- CI/CD with GitHub Actions (unit tests, integration tests, Docker build and push)
- Prisma-based relational domain model with migrations
- Unit, integration, and performance tests

### What is next

- Knowledge/document ingestion and retrieval via vector store (Qdrant)
- Advanced AI-assisted triage and auto-resolution flows
- Production-ready email/push notification channels and broader automation workflows
- Production hardening (deployment topology, scaling)

## 2) Runtime and Architecture

The platform consists of two services:

- **API Gateway** (`services/api-gateway`) — Node.js/Express backend organized by feature module
- **Chatbot Service** (`services/chatbot-service`) — Python/FastAPI RAG-powered AI chatbot

Supporting infrastructure: PostgreSQL, Redis, Prometheus, Grafana.

### API Gateway modules

- auth
- organization
- tickets
- ai (automation, augmentation, config, scraper)
- notifications

### Request flow

1. Request enters Express app
2. Shutdown check middleware (reject if shutting down)
3. Request timeout middleware (504 after configurable timeout)
4. Request ID attachment and AsyncLocalStorage context
5. Prometheus metrics middleware
6. Auth middleware validates bearer token where required
7. Validation middleware checks payload/query/params using Zod
8. Controller delegates to service layer
9. Service applies business and permission rules
10. Repository executes Prisma DB operations
11. Error handler normalizes failure responses

## 3) Implemented API Surface

### Auth endpoints

| Method | Path               | Auth Required | Description                    |
| ------ | ------------------ | ------------- | ------------------------------ |
| POST   | /api/auth/register | No            | Register new user              |
| POST   | /api/auth/login    | No            | Login and obtain JWT           |
| GET    | /api/auth/me       | Yes           | Get authenticated user profile |

### Organization endpoints

| Method | Path                                      | Auth Required | Role Requirement          | Description                                 |
| ------ | ----------------------------------------- | ------------- | ------------------------- | ------------------------------------------- |
| POST   | /api/organizations                        | Yes           | Any authenticated user    | Create organization; creator becomes OWNER  |
| GET    | /api/organizations                        | Yes           | Member of at least 0 orgs | List organizations for current user         |
| GET    | /api/organizations/:orgId                 | Yes           | Membership required       | Get organization details                    |
| PATCH  | /api/organizations/:orgId                 | Yes           | OWNER or ADMIN            | Update organization metadata                |
| DELETE | /api/organizations/:orgId                 | Yes           | OWNER                     | Delete organization                         |
| POST   | /api/organizations/:orgId/members         | Yes           | OWNER or ADMIN            | Invite/add member with role policy checks   |
| GET    | /api/organizations/:orgId/members         | Yes           | Membership required       | List organization members                   |
| PATCH  | /api/organizations/:orgId/members/:userId | Yes           | OWNER or ADMIN            | Update member role under policy constraints |

### Ticket endpoints

| Method | Path                                       | Auth Required | Description                                |
| ------ | ------------------------------------------ | ------------- | ------------------------------------------ |
| POST   | /api/tickets                               | Yes           | Create ticket in organization              |
| GET    | /api/tickets                               | Yes           | List tickets with filters                  |
| GET    | /api/tickets/:ticketId                     | Yes           | Get ticket by id                           |
| PATCH  | /api/tickets/:ticketId                     | Yes           | Update ticket fields                       |
| PATCH  | /api/tickets/:ticketId/assign              | Yes           | Assign ticket to user                      |
| POST   | /api/tickets/:ticketId/auto-assign         | Yes           | Auto-assign based on availability/workload |
| PATCH  | /api/tickets/:ticketId/status              | Yes           | Update ticket status                       |
| GET    | /api/tickets/:ticketId/activity            | Yes           | Get ticket activity log                    |
| POST   | /api/tickets/:ticketId/comments            | Yes           | Add comment                                |
| GET    | /api/tickets/:ticketId/comments            | Yes           | List comments                              |
| DELETE | /api/tickets/:ticketId/comments/:commentId | Yes           | Delete comment                             |
| POST   | /api/tickets/:ticketId/attachments         | Yes           | Add attachment metadata                    |
| GET    | /api/tickets/:ticketId/attachments         | Yes           | List attachments                           |
| DELETE | /api/tickets/:ticketId/attachments/:id     | Yes           | Delete attachment                          |
| POST   | /api/tickets/tags                          | Yes           | Create organization tag                    |
| GET    | /api/tickets/tags                          | Yes           | List organization tags                     |
| POST   | /api/tickets/:ticketId/tags                | Yes           | Add tag to ticket                          |
| DELETE | /api/tickets/:ticketId/tags/:tagId         | Yes           | Remove tag from ticket                     |

### Agent endpoints

| Method | Path                        | Auth Required | Description                                        |
| ------ | --------------------------- | ------------- | -------------------------------------------------- |
| GET    | /api/agents/me/tickets      | Yes           | List tickets assigned to current agent             |
| GET    | /api/agents/me/stats        | Yes           | Aggregated stats by status and priority            |
| PATCH  | /api/agents/me/availability | Yes           | Update current agent availability for organization |

### AI and automation endpoints

| Method | Path                  | Auth Required | Description                              |
| ------ | --------------------- | ------------- | ---------------------------------------- |
| *      | /api/ai/automation/*  | Yes           | AI decision queue management             |
| *      | /api/ai/augmentation/*| Yes           | Context-aware suggestion APIs            |
| *      | /api/ai/config/*      | Yes           | Per-organization AI settings             |
| *      | /api/ai/scraper/*     | Yes           | URL content ingestion                    |
| *      | /api/ai/internal/*    | Internal      | Inter-service communication              |

### Notification endpoints

| Method | Path                  | Auth Required | Description                              |
| ------ | --------------------- | ------------- | ---------------------------------------- |
| *      | /api/notifications/*  | Yes           | List/read notifications and manage preferences |

### Health and observability endpoints

| Method | Path           | Auth Required | Description                  |
| ------ | -------------- | ------------- | ---------------------------- |
| GET    | /health        | No            | Basic health check           |
| GET    | /health/live   | No            | Kubernetes liveness probe    |
| GET    | /health/ready  | No            | Kubernetes readiness probe   |
| GET    | /metrics       | No            | Prometheus metrics           |
| GET    | /metrics/db    | No            | Database diagnostics (JSON)  |
| GET    | /metrics/redis | No            | Redis diagnostics (JSON)     |

## 4) Authorization and Role Policies

### Organization roles

- OWNER
- ADMIN
- AGENT
- MEMBER

### Effective access highlights

- OWNER and ADMIN can manage organization settings and memberships (subject to role policy)
- Elevated ticket operations (assign, status changes, some tag operations) require privileged roles
- MEMBER visibility is restricted to relevant tickets (created by or assigned to the member)
- Internal comments are filtered for non-privileged visibility contexts

## 5) Ticketing Behavior

### Ticket filters in list API

Supported query filtering includes:

- organizationId (required for general ticket list)
- status
- priority
- source
- assignedTo and assignedToId
- tag and tagId
- dateFrom and dateTo

### Assignment behavior

- Manual assignment validates assignee organization membership
- Auto-assignment considers:
  - agent availability
  - daily and weekly assignment thresholds
  - current workload ordering (least-loaded first)

### Activity events tracked

- ticket created
- ticket updated
- ticket assigned
- ticket status updated
- comment added/deleted
- attachment added/deleted
- tag added/removed

## 6) Data Model (Prisma)

Implemented core models:

- User
- Organization
- Membership
- Ticket
- TicketComment
- TicketAttachment
- Tag
- TicketTag
- TicketActivityLog
- AgentWorkload
- Notification
- AIUsage
- AIConfig
- ScrapedPage
- RefreshToken
- TokenBlacklist

Domain enums in use:

- Role
- TicketStatus
- Priority
- TicketSource
- TicketActivityAction

## 7) Validation and Error Handling

- Zod schemas validate body/query/params before service execution
- Validation failures return normalized validation error responses
- Domain and permission failures are surfaced through centralized API error handling

## 8) Testing

### Available commands

```bash
cd services/api-gateway
npm test                  # All tests (unit + integration)
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:coverage     # Tests with coverage report
npm run test:unit:coverage # Unit tests with coverage
npm run test:watch        # Watch mode
```

### Test scope

- Auth integration and unit tests
- Organization integration and unit tests
- Ticket integration and unit tests
- Middleware and utility tests

## 9) Local Setup

### Prerequisites

- Node.js 20+
- Python 3.12+ (for chatbot service)
- PostgreSQL 16+
- Redis 7+

### Start API Gateway

```bash
cd services/api-gateway
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

### Start Chatbot Service

```bash
cd services/chatbot-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

### Start with Docker Compose

```bash
cd monitoring
docker-compose up
```

This brings up all services (API Gateway, Chatbot, Redis) plus the monitoring stack (Prometheus, Grafana).

## 10) CI/CD

GitHub Actions workflows are defined in `.github/workflows/`:

- **Docker Build and Push** — Builds and pushes service images to GitHub Container Registry on push to main and PRs, with path filtering per service
- **Unit Tests** — Runs `npm run test:unit:coverage` on push to main and all PRs
- **Integration Tests** — Spins up PostgreSQL and Redis services, runs `npm run test:integration` on push to main and all PRs

## 11) Performance Testing (k6)

Baseline k6 scripts live in `services/api-gateway/perf`:

- `smoke.js`: lightweight health path (login, profile, ticket list, optional ticket create)
- `load-ticket-list.js`: ramping load test for `GET /api/tickets`

### Prerequisites

- Install k6: https://k6.io/docs/get-started/installation/

### Run smoke test

```bash
cd services/api-gateway
BASE_URL=http://localhost:5000 \
EMAIL=your-user@example.com \
PASSWORD='YourPassword123!' \
ORG_ID=your-org-id \
npm run perf:smoke
```

Optional smoke write path:

```bash
CREATE_SMOKE_TICKET=true npm run perf:smoke
```

### Run load test (ticket list)

```bash
cd services/api-gateway
BASE_URL=http://localhost:5000 \
EMAIL=your-user@example.com \
PASSWORD='YourPassword123!' \
ORG_ID=your-org-id \
START_VUS=1 \
PEAK_VUS=20 \
RAMP_SECONDS=60 \
HOLD_SECONDS=120 \
COOLDOWN_SECONDS=30 \
npm run perf:load
```

### Default thresholds

- `http_req_failed < 1%`
- `checks > 99%`
- `http_req_duration p(95) < 500ms` (load script)

## 12) Observability (Prometheus and Grafana)

Prometheus metrics are exposed by both services:

- API Gateway: `GET /metrics` (port 5000)
- Chatbot Service: `GET /metrics` (port 8000)

Additional JSON diagnostics in API Gateway: `GET /metrics/db`, `GET /metrics/redis`

### Metric families

- API Gateway:
  - `helpforge_api_gateway_http_requests_total`
  - `helpforge_api_gateway_http_request_duration_seconds`
  - `helpforge_api_gateway_http_requests_in_flight`
  - default process/runtime metrics with prefix `helpforge_api_gateway_`
- Chatbot Service:
  - `helpforge_chatbot_http_requests_total`
  - `helpforge_chatbot_http_request_duration_seconds`
  - `helpforge_chatbot_http_requests_in_flight`
  - default Python/runtime metrics from `prometheus_client`

### Example `prometheus.yml`

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "helpforge-api-gateway"
    static_configs:
      - targets: ["localhost:5000"]
    metrics_path: /metrics

  - job_name: "helpforge-chatbot-service"
    static_configs:
      - targets: ["localhost:8000"]
    metrics_path: /metrics
```

### Grafana

Grafana dashboards are auto-provisioned via the Docker Compose monitoring stack on port 3001. Default credentials: `admin/admin`.

## 13) Documentation Index

- docs/PROJECT_ROADMAP.md
- docs/uml/index.md
- services/api-gateway/TEST_DOCUMENTATION.md
- CHANGELOG.md

## 14) Current Delivery Phase

- Phase 1 Foundation: Complete
- Phase 2 Core Product (Auth + Organization + Ticketing + Agent workflows): Complete
- Phase 3 AI and Automation: In progress
- Phase 4 Integrations and Notifications: Partial (in-app, preferences, BullMQ delivery, WebSocket realtime; email and push still placeholders)
- Phase 5 Production Hardening: Planned

Last updated: 2026-03-26
