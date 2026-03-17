# HelpForge

HelpForge is a multi-tenant support platform implemented in a modular API architecture.
The current codebase already includes core operations for authentication, organization management, ticketing workflows, and agent operations.

## 1) Product Snapshot

### What is already implemented

- Auth with JWT access tokens and protected routes
- Organization lifecycle and membership management with role-based checks
- Ticket lifecycle with assignment, status updates, comments, attachments, tags, and activity logs
- Agent-focused APIs (my tickets, my stats, availability)
- Prisma-based relational domain model with migrations
- Unit and integration tests across auth, organization, and ticket modules

### What is next

- Knowledge/document ingestion and retrieval
- AI-assisted response and triage flows
- Notification integrations and automation workflows
- Production hardening (observability, CI/CD, deployment topology)

## 2) Runtime and Architecture

Current implementation exists under services/api-gateway and is organized by feature module:

- auth
- organization
- tickets

Request flow:

1. Request enters Express app
2. Auth middleware validates bearer token where required
3. Validation middleware checks payload/query/params using Zod
4. Controller delegates to service layer
5. Service applies business and permission rules
6. Repository executes Prisma DB operations
7. Error handler normalizes failure responses

## 3) Implemented API Surface (Detailed)

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

## 5) Ticketing Behavior (Implemented)

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

## 6) Data Model (Current Prisma Domain)

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
npm test
npm run test:unit
npm run test:integration
npm run test:coverage
```

### Test scope currently included

- Auth integration and unit tests
- Organization integration and unit tests
- Ticket integration and unit tests
- Middleware and utility tests

## 9) Local Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Start locally

```bash
cd services/api-gateway
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

## 12) Performance Testing (k6)

HelpForge now includes baseline k6 scripts in `services/api-gateway/perf`:

- `smoke.js`: lightweight health path (login, profile, ticket list, optional ticket create)
- `load-ticket-list.js`: ramping load test for `GET /api/tickets`

### Prerequisites

- Install k6: https://k6.io/docs/get-started/installation/

### Run smoke test

```bash
cd services/api-gateway
BASE_URL=http://localhost:3000 \
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
BASE_URL=http://localhost:3000 \
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

## 10) Documentation Index

- docs/PROJECT_ROADMAP.md
- docs/uml/index.md
- services/api-gateway/TEST_DOCUMENTATION.md
- CHANGELOG.md

## 11) Current Delivery Phase

- Phase 1 Foundation: Complete
- Phase 2 Core Product (Auth + Organization + Ticketing + Agent workflows): Implemented in API Gateway
- Phase 3 AI and automation: Next

Last updated: 2026-03-14
