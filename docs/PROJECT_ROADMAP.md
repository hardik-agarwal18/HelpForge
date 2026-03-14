# HelpForge Project Roadmap

## 1) Vision

HelpForge aims to deliver a complete multi-tenant support platform that combines:

- operational ticket workflows
- role-aware collaboration
- knowledge-assisted support through AI
- automation and production-grade platform operations

## 2) Current Architecture Snapshot

Current implementation is consolidated in services/api-gateway with modular boundaries:

- auth module
- organization module
- tickets module

This modular split already follows controller/service/repository boundaries and can be extracted into separate services when scaling demands increase.

## 3) Delivery Status by Phase

### Phase 1 - Foundation (Complete)

- [x] Express app bootstrap and route registration
- [x] Config and environment wiring
- [x] Prisma integration and migrations
- [x] JWT auth middleware
- [x] Request validation middleware
- [x] Centralized error handling
- [x] Unit and integration test setup

### Phase 2 - Core Product (Implemented in API Gateway)

#### 2.1 Authentication

- [x] Register
- [x] Login
- [x] Get current profile

#### 2.2 Organization and Membership

- [x] Create organization
- [x] List organizations for current user
- [x] Get organization details
- [x] Update organization (owner/admin)
- [x] Delete organization (owner)
- [x] Invite/add member
- [x] List organization members
- [x] Update member role with policy constraints

#### 2.3 Ticketing

- [x] Create ticket
- [x] List tickets with filters
- [x] Get ticket by id
- [x] Update ticket
- [x] Manual assignment
- [x] Auto-assignment with workload awareness
- [x] Status updates
- [x] Comment create/list/delete
- [x] Attachment create/list/delete
- [x] Tag create/list/add/remove
- [x] Activity history retrieval

#### 2.4 Agent workflows

- [x] List my assigned tickets
- [x] Compute my stats by status/priority
- [x] Update my availability per organization

## 4) Implemented Functional Behavior

### 4.1 Access control behavior

- Membership checks gate organization-scoped operations
- Role checks gate elevated operations
- Member-level ticket visibility is restricted to relevant tickets
- Internal comments are filtered in restricted visibility contexts

### 4.2 Ticket list filtering behavior

Ticket list APIs currently support filtering by:

- organizationId
- status
- priority
- source
- assignedTo or assignedToId
- tag or tagId
- dateFrom and dateTo

### 4.3 Auto-assignment behavior

Auto-assignment currently considers:

- only available agents
- configured daily/weekly assignment constraints
- workload ordering to select least-loaded eligible agent

## 5) Data Model Progress

### Implemented models

- [x] User
- [x] Organization
- [x] Membership
- [x] Ticket
- [x] TicketComment
- [x] TicketAttachment
- [x] Tag
- [x] TicketTag
- [x] TicketActivityLog
- [x] AgentWorkload

### Implemented enums and domain constraints

- [x] Role
- [x] TicketStatus
- [x] Priority
- [x] TicketSource
- [x] TicketActivityAction

### Planned data extensions

- [ ] Knowledge document metadata and lifecycle entities
- [ ] Chunk and embedding entities for retrieval
- [ ] Conversation and message history for AI interactions
- [ ] Automation rule definitions and run history

## 6) Testing Progress

### Implemented test areas

- [x] Auth integration and unit test coverage
- [x] Organization integration and unit test coverage
- [x] Ticket integration and unit test coverage
- [x] Middleware and utility-level coverage

### Next testing targets

- [ ] Broader negative-path and edge-case matrix for organization role transitions
- [ ] Performance-focused testing for high-volume ticket list queries
- [ ] Contract tests for future service extraction boundaries

## 7) Next Roadmap Phases (Detailed)

### Phase 3 - AI and Knowledge Layer

Goal: Add organization-scoped knowledge retrieval and AI assistance.

Target capabilities:

- [ ] Document ingestion API
- [ ] Text extraction/chunking pipeline
- [ ] Embedding generation and vector retrieval
- [ ] RAG response endpoint with source context
- [ ] Basic AI-assisted triage suggestions

Definition of done:

- Users can upload organization documents
- Queries can retrieve contextually relevant chunks
- AI responses include grounded context references

### Phase 4 - Automation and Integrations

Goal: Operational automation and external system interoperability.

Target capabilities:

- [ ] Event emission for ticket lifecycle actions
- [ ] Notification triggers (email/webhook)
- [ ] Automation hooks for assignment/escalation rules
- [ ] Metrics aggregation for operational dashboards

Definition of done:

- Core ticket events are emitted and consumable
- At least one notification channel is production-ready
- At least one automated escalation flow is active

### Phase 5 - Production Hardening

Goal: Improve reliability, observability, and release discipline.

Target capabilities:

- [ ] Deployment strategy for multi-environment rollout
- [ ] CI/CD checks for tests and migrations
- [ ] Runtime observability baseline (logs + metrics)
- [ ] SLO-oriented reliability checks

Definition of done:

- Automated release workflow with guarded deployments
- Monitoring and alerting for API health and failures
- Incident-relevant telemetry available for debugging

## 8) Near-Term Milestones

1. Implement knowledge/document ingestion and metadata model.
2. Add retrieval pipeline integrated with organization and ticket context.
3. Introduce notification hooks for high-value ticket events.
4. Establish deployment and observability baseline.

## 9) Non-Goals for Current Sprint Window

- Splitting API Gateway into multiple deployable microservices right now
- Full UI-first analytics suite before backend event foundations
- Broad multi-model LLM support before baseline RAG stability

Last updated: 2026-03-14
