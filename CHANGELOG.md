# HelpForge Changelog

All notable project changes are documented here.

## 2026-03-14

### Added

#### Organization module

- Organization lifecycle endpoints:
  - create organization
  - list organizations for current user
  - get organization by id
  - update organization (policy-guarded)
  - delete organization (owner-only)
- Membership management endpoints:
  - add/invite member with role input validation
  - list members in organization
  - update member role with role hierarchy constraints
- Middleware-based membership and role guards for organization routes

#### Ticket module

- Ticket lifecycle endpoints:
  - create ticket
  - list tickets with filters
  - get ticket by id
  - update ticket
  - assign ticket manually
  - auto-assign ticket
  - update ticket status
- Collaboration and metadata endpoints:
  - comments create/list/delete
  - attachments create/list/delete
  - tags create/list/add/remove
  - ticket activity retrieval

#### Agent module

- Agent-centered endpoints:
  - get my assigned tickets
  - get my stats by status and priority
  - update my availability in organization context

#### Domain model and persistence

- Prisma domain expanded with operational entities:
  - Organization
  - Membership
  - Ticket
  - TicketComment
  - TicketAttachment
  - Tag
  - TicketTag
  - TicketActivityLog
  - AgentWorkload
- Additional enums and indexes supporting ticket operations and query performance

#### Validation and policy behavior

- Zod validators added/expanded for:
  - ticket payloads and updates
  - status/priority/source constraints
  - member invite and role update payloads
  - agent availability payload
- Service-layer permission checks for role-aware actions and data visibility

#### Testing

- Organization integration scenarios including membership and role transition rules
- Ticket integration scenarios including assignment, auto-assignment, filters, comments, attachments, and tagging
- Ticket validator unit coverage and related module-level tests

### Changed

- API route wiring now includes these active groups:
  - /api/auth
  - /api/organizations
  - /api/tickets
  - /api/agents
- Project documentation now reflects implemented core product functionality rather than foundation-only status

### Notes

- Core support operations for multi-tenant workflows are implemented in the API Gateway service.
- AI, document intelligence, and automation orchestration remain upcoming roadmap stages.

## 2026-03-12

### Added

- Initial API Gateway foundation
- Auth module with:
  - register
  - login
  - current-user profile retrieval
- JWT auth middleware and request validation middleware
- Centralized error handling utilities
- Prisma base setup and initial migration
- Baseline unit/integration testing setup

### Notes

- This release established the architectural baseline used for subsequent feature implementation.
