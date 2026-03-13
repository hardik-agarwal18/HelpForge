# HelpForge UML Gallery

Rendered preview page for all UML diagrams using Mermaid blocks.

## Structural

### 01-use-case

~~~mermaid
flowchart LR

  classDef actor fill:#fff,stroke:#333,stroke-width:1px;
  classDef usecase fill:#eef7ff,stroke:#2b6cb0,stroke-width:1px;

  Guest([Unauthenticated User]):::actor
  Member([Member]):::actor
  Agent([Agent]):::actor
  Admin([Admin]):::actor
  Owner([Owner]):::actor

  U1((Register Account)):::usecase
  U2((Login)):::usecase
  U3((View My Profile)):::usecase
  U4((Create Organization)):::usecase
  U5((List Organizations)):::usecase
  U6((Invite Member)):::usecase
  U7((Update Member Role)):::usecase
  U8((Create Ticket)):::usecase
  U9((View Tickets)):::usecase
  U10((Update Ticket)):::usecase
  U11((Assign Ticket)):::usecase
  U12((Update Ticket Status)):::usecase
  U13((Add Internal Comment)):::usecase
  U14((Manage Tags)):::usecase
  U15((View Agent Workload)):::usecase
  U16((Update Availability)):::usecase

  Guest --> U1
  Guest --> U2

  Member --> U3
  Member --> U5
  Member --> U8
  Member --> U9
  Member --> U10

  Agent --> U3
  Agent --> U5
  Agent --> U9
  Agent --> U10
  Agent --> U12
  Agent --> U13
  Agent --> U15
  Agent --> U16

  Admin --> U3
  Admin --> U4
  Admin --> U5
  Admin --> U6
  Admin --> U7
  Admin --> U9
  Admin --> U10
  Admin --> U11
  Admin --> U12
  Admin --> U13
  Admin --> U14
  Admin --> U15

  Owner --> U3
  Owner --> U4
  Owner --> U5
  Owner --> U6
  Owner --> U7
  Owner --> U9
  Owner --> U10
  Owner --> U11
  Owner --> U12
  Owner --> U13
  Owner --> U14
  Owner --> U15
  Owner --> U16
~~~

### 02-component-current

~~~mermaid
flowchart TB

  Client[Client App]
  API[API Gateway\nExpress Application]

  subgraph CrossCutting[Cross-Cutting Components]
    AuthMW[Auth Middleware]
    ValidationMW[Validation Middleware]
    ErrorHandler[Global Error Handler]
    Config[Config + Environment]
  end

  subgraph Modules[Feature Modules]
    AuthRoutes[Auth Routes]
    OrgRoutes[Organization Routes]
    TicketRoutes[Ticket Routes]
    AgentRoutes[Agent Routes]

    AuthController[Auth Controller]
    OrgController[Organization Controller]
    TicketController[Ticket Controller]

    AuthService[Auth Service]
    OrgService[Organization Service]
    TicketService[Ticket Service]

    AuthRepo[Auth Repo]
    OrgRepo[Organization Repo]
    TicketRepo[Ticket Repo]
  end

  Prisma[Prisma Client]
  DB[(PostgreSQL)]

  Client --> API
  API --> AuthMW
  API --> ValidationMW
  API --> ErrorHandler
  API --> Config

  API --> AuthRoutes
  API --> OrgRoutes
  API --> TicketRoutes
  API --> AgentRoutes

  AuthRoutes --> AuthController
  OrgRoutes --> OrgController
  TicketRoutes --> TicketController
  AgentRoutes --> TicketController

  AuthController --> AuthService
  OrgController --> OrgService
  TicketController --> TicketService

  AuthService --> AuthRepo
  OrgService --> OrgRepo
  TicketService --> TicketRepo

  AuthRepo --> Prisma
  OrgRepo --> Prisma
  TicketRepo --> Prisma

  Prisma --> DB
~~~

### 03-package-api-gateway

~~~mermaid
flowchart TB

  subgraph API[api-gateway/src]
    App[app.js]
    Server[server.js]

    subgraph ConfigPkg[config]
      ConfigIndex[index.js]
      DbConfig[database.config.js]
    end

    subgraph MiddlewarePkg[middleware]
      AuthMW[auth.middleware.js]
      ValidationMW[validation.middleware.js]
    end

    subgraph AuthPkg[modules/auth]
      AuthRoutes[auth.routes.js]
      AuthController[auth.controller.js]
      AuthService[auth.service.js]
      AuthRepo[auth.repo.js]
      AuthValidator[auth.validator.js]
    end

    subgraph OrgPkg[modules/organization]
      OrgRoutes[org.routes.js]
      OrgController[org.controller.js]
      OrgService[org.service.js]
      OrgRepo[org.repo.js]
      OrgMW[org.middleware.js]
      OrgValidator[org.validator.js]
      OrgConstants[org.constants.js]
    end

    subgraph TicketPkg[modules/tickets]
      TicketRoutes[ticket.routes.js]
      AgentRoutes[agent.routes.js]
      TicketController[ticket.controller.js]
      TicketService[ticket.service.js]
      TicketRepo[ticket.repo.js]
      TicketValidator[ticket.validator.js]
      TicketConstants[ticket.constants.js]
    end

    subgraph UtilsPkg[utils]
      ErrorHandler[errorHandler.js]
    end
  end

  Server --> App
  App --> AuthRoutes
  App --> OrgRoutes
  App --> TicketRoutes
  App --> AgentRoutes
  App --> ErrorHandler

  AuthRoutes --> ValidationMW
  AuthRoutes --> AuthMW
  AuthRoutes --> AuthController
  AuthController --> AuthService
  AuthService --> AuthRepo
  AuthService --> ConfigIndex
  AuthRepo --> DbConfig
  AuthRoutes --> AuthValidator

  OrgRoutes --> ValidationMW
  OrgRoutes --> AuthMW
  OrgRoutes --> OrgMW
  OrgRoutes --> OrgController
  OrgController --> OrgService
  OrgService --> OrgRepo
  OrgService --> OrgConstants
  OrgRepo --> DbConfig
  OrgRoutes --> OrgValidator

  TicketRoutes --> ValidationMW
  TicketRoutes --> AuthMW
  TicketRoutes --> TicketController
  AgentRoutes --> AuthMW
  AgentRoutes --> TicketController
  TicketController --> TicketService
  TicketService --> TicketRepo
  TicketService --> TicketConstants
  TicketRepo --> DbConfig
  TicketRoutes --> TicketValidator
  AgentRoutes --> TicketValidator
~~~

### 04-class-domain-prisma

~~~mermaid
classDiagram

  class User {
    +String id
    +String email
    +String password
    +String name
    +DateTime createdAt
  }

  class Organization {
    +String id
    +String name
    +DateTime createdAt
  }

  class Membership {
    +String id
    +String userId
    +String organizationId
    +Role role
    +Boolean isAvailable
    +Int maxTicketsPerDay
    +Int maxTicketsPerWeek
    +DateTime createdAt
  }

  class Ticket {
    +String id
    +String title
    +String description
    +TicketStatus status
    +Priority priority
    +TicketSource source
    +String organizationId
    +String createdById
    +String assignedToId
    +DateTime createdAt
    +DateTime updatedAt
  }

  class TicketComment {
    +String id
    +String ticketId
    +String authorId
    +String message
    +Boolean isInternal
    +DateTime createdAt
  }

  class TicketAttachment {
    +String id
    +String ticketId
    +String uploadedBy
    +String fileUrl
    +String fileType
    +Int fileSize
    +DateTime createdAt
  }

  class Tag {
    +String id
    +String name
    +String organizationId
  }

  class TicketTag {
    +String ticketId
    +String tagId
  }

  class TicketActivityLog {
    +String id
    +String ticketId
    +String actorId
    +TicketActivityAction action
    +String oldValue
    +String newValue
    +DateTime createdAt
  }

  class AgentWorkload {
    +String id
    +String userId
    +String organizationId
    +Int assignedToday
    +Int assignedThisWeek
    +DateTime lastDailyReset
    +DateTime lastWeeklyReset
  }

  class Role {
    <<enumeration>>
    OWNER
    ADMIN
    AGENT
    MEMBER
  }

  class TicketStatus {
    <<enumeration>>
    OPEN
    IN_PROGRESS
    RESOLVED
    CLOSED
  }

  class Priority {
    <<enumeration>>
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  class TicketSource {
    <<enumeration>>
    WEB
    EMAIL
    CHAT
    API
  }

  class TicketActivityAction {
    <<enumeration>>
    TICKET_CREATED
    TICKET_UPDATED
    TICKET_ASSIGNED
    TICKET_STATUS_UPDATED
    COMMENT_ADDED
    COMMENT_DELETED
    ATTACHMENT_ADDED
    ATTACHMENT_DELETED
    TAG_ADDED
    TAG_REMOVED
  }

  User "1" --> "*" Membership : memberOf
  Organization "1" --> "*" Membership : hasMembers

  Organization "1" --> "*" Ticket : owns
  User "1" --> "*" Ticket : createdBy
  User "1" --> "0..*" Ticket : assignedTo

  Ticket "1" --> "*" TicketComment : hasComments
  User "1" --> "*" TicketComment : authored

  Ticket "1" --> "*" TicketAttachment : hasAttachments
  User "1" --> "*" TicketAttachment : uploadedBy

  Organization "1" --> "*" Tag : defines
  Ticket "1" --> "*" TicketTag : taggedBy
  Tag "1" --> "*" TicketTag : mapsTo

  Ticket "1" --> "*" TicketActivityLog : activity
  User "1" --> "*" TicketActivityLog : actor

  User "1" --> "*" AgentWorkload : workload
  Organization "1" --> "*" AgentWorkload : scopedWorkload

  Membership --> Role : role
  Ticket --> TicketStatus : status
  Ticket --> Priority : priority
  Ticket --> TicketSource : source
  TicketActivityLog --> TicketActivityAction : action
~~~

## State

### 05-state-ticket-lifecycle

~~~mermaid
stateDiagram-v2
  [*] --> OPEN : ticket created
  OPEN --> IN_PROGRESS : assigned to agent
  OPEN --> CLOSED : closed without work

  IN_PROGRESS --> RESOLVED : work completed
  IN_PROGRESS --> OPEN : unassign or requeue

  RESOLVED --> CLOSED : confirmed closure
  RESOLVED --> IN_PROGRESS : reopened by staff

  CLOSED --> OPEN : reopened by staff
  CLOSED --> [*]
~~~

## Activity

### 06-activity-auto-assignment

~~~mermaid
flowchart TD
  A([Start: Ticket Created]) --> B{Assigned agent provided?}
  B -->|Yes| C[Validate assignee in organization]
  C --> D{Valid assignee?}
  D -->|No| X[Return validation error]
  D -->|Yes| E[Persist ticket with assignedToId]

  B -->|No| F[Load available AGENT memberships]
  F --> G[Load agent workloads in parallel]
  G --> H[Reset stale daily/weekly counters]
  H --> I[Filter by capacity and availability]
  I --> J{Eligible agents found?}
  J -->|No| K[Persist unassigned ticket in OPEN status]
  J -->|Yes| L[Select least-loaded eligible agent]
  L --> M[Create assignment transaction]
  M --> N[Increment workload counters]
  N --> O[Update ticket assignedTo and status IN_PROGRESS]

  E --> P[Create activity log: TICKET_CREATED]
  K --> P
  O --> Q[Create activity log: TICKET_ASSIGNED]
  P --> R([End])
  Q --> R
  X --> R
~~~

### 07-activity-role-management

~~~mermaid
flowchart TD
  A([Start: Role Update Request]) --> B[Authenticate JWT]
  B --> C[Verify organization membership]
  C --> D{Requester is OWNER or ADMIN?}
  D -->|No| X[Reject with 403]
  D -->|Yes| E[Load target membership]
  E --> F{Target exists?}
  F -->|No| Y[Reject with 404]
  F -->|Yes| G[Normalize requested role]
  G --> H{Role is valid enum?}
  H -->|No| Z[Reject with 400]
  H -->|Yes| I[Check role hierarchy policy]
  I --> J{Policy allows transition?}
  J -->|No| W[Reject with 403]
  J -->|Yes| K[Update membership role]
  K --> L([End: Updated])

  X --> L
  Y --> L
  Z --> L
  W --> L
~~~

### 08-activity-ticket-status-update

~~~mermaid
flowchart TD
  A([Start: Status Update Request]) --> B[Authenticate and validate payload]
  B --> C[Load ticket by ticketId]
  C --> D{Ticket exists?}
  D -->|No| X[Return 404]
  D -->|Yes| E[Verify requester membership in ticket organization]
  E --> F{Can edit this ticket?}
  F -->|No| Y[Return 403]
  F -->|Yes| G{New status differs from current?}
  G -->|No| Z[Return unchanged ticket]
  G -->|Yes| H[Update ticket status]
  H --> I[Create activity log with old/new status]
  I --> J([End: Updated])

  X --> J
  Y --> J
  Z --> J
~~~

## Sequence

### 09-sequence-auth-register

~~~mermaid
sequenceDiagram
  autonumber
  actor U as Unauthenticated User
  participant R as Auth Route
  participant C as Auth Controller
  participant S as Auth Service
  participant Repo as Auth Repo
  participant DB as Prisma/PostgreSQL
  participant B as bcrypt
  participant J as JWT

  U->>R: POST /api/auth/register
  R->>C: register(request)
  C->>S: registerUser(payload)
  S->>Repo: findUserByEmail(email)
  Repo->>DB: User.findUnique(email)
  DB-->>Repo: existing user or null
  Repo-->>S: result

  alt Email already exists
    S-->>C: throw 409 conflict
    C-->>U: 409 response
  else New user
    S->>B: hash(password)
    B-->>S: hashedPassword
    S->>Repo: createUser(email, hashedPassword, name)
    Repo->>DB: User.create(...)
    DB-->>Repo: persisted user
    Repo-->>S: user
    S->>J: sign({ userId, email })
    J-->>S: access token
    S-->>C: { user, token }
    C-->>U: 201 Created
  end
~~~

### 10-sequence-auth-login

~~~mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant R as Auth Route
  participant C as Auth Controller
  participant S as Auth Service
  participant Repo as Auth Repo
  participant DB as Prisma/PostgreSQL
  participant B as bcrypt
  participant J as JWT

  U->>R: POST /api/auth/login
  R->>C: login(request)
  C->>S: loginUser(email, password)
  S->>Repo: findUserByEmail(email)
  Repo->>DB: User.findUnique(email)
  DB-->>Repo: user or null
  Repo-->>S: result

  alt User not found
    S-->>C: throw 401 unauthorized
    C-->>U: 401 response
  else User found
    S->>B: compare(password, user.password)
    B-->>S: isValid
    alt Invalid password
      S-->>C: throw 401 unauthorized
      C-->>U: 401 response
    else Valid password
      S->>J: sign({ userId, email })
      J-->>S: token
      S-->>C: { user, token }
      C-->>U: 200 OK
    end
  end
~~~

### 11-sequence-org-create

~~~mermaid
sequenceDiagram
  autonumber
  actor U as Authenticated User
  participant MW as Auth Middleware
  participant R as Org Route
  participant C as Org Controller
  participant S as Org Service
  participant Repo as Org Repo
  participant DB as Prisma/PostgreSQL

  U->>MW: POST /api/organizations + Bearer token
  MW-->>R: req.user
  R->>C: createOrganization(request)
  C->>S: createOrganizationService(userId, payload)
  S->>Repo: createOrganizationWithOwner(userId, orgData)
  Repo->>DB: Organization.create + Membership.create(OWNER)
  DB-->>Repo: organization and owner membership
  Repo-->>S: created organization aggregate
  S-->>C: result
  C-->>U: 201 Created
~~~

### 12-sequence-org-invite-member

~~~mermaid
sequenceDiagram
  autonumber
  actor A as Owner/Admin
  participant Auth as Auth Middleware
  participant OrgMW as Org Middleware
  participant R as Org Route
  participant C as Org Controller
  participant S as Org Service
  participant Repo as Org Repo
  participant DB as Prisma/PostgreSQL

  A->>Auth: PATCH /api/organizations/:orgId/members/:userId
  Auth-->>OrgMW: req.user
  OrgMW->>DB: Membership.findUnique(userId, orgId)
  DB-->>OrgMW: requester membership
  OrgMW-->>R: requester has access

  R->>C: inviteMember(payload)
  C->>S: inviteMemberInOrganizationService(...)
  S->>S: normalizeRole(requestedRole)
  S->>S: assertCanInviteRole(requesterRole, requestedRole)

  alt Role not permitted
    S-->>C: throw 403
    C-->>A: 403 response
  else Role permitted
    S->>Repo: inviteMemberInOrganization(...)
    Repo->>DB: Membership.create(userId, orgId, role)
    DB-->>Repo: membership
    Repo-->>S: membership
    S-->>C: success
    C-->>A: 200 OK
  end
~~~

### 13-sequence-org-update-member-role

~~~mermaid
sequenceDiagram
  autonumber
  actor A as Owner/Admin
  participant Auth as Auth Middleware
  participant OrgMW as Org Middleware
  participant R as Org Route
  participant C as Org Controller
  participant S as Org Service
  participant Repo as Org Repo
  participant DB as Prisma/PostgreSQL

  A->>Auth: PATCH /api/organizations/:orgId/members/:userId/role
  Auth-->>OrgMW: req.user
  OrgMW->>DB: Membership.findUnique(requester, org)
  DB-->>OrgMW: requester membership
  OrgMW-->>R: proceed

  R->>C: updateMemberRole(request)
  C->>S: updateMemberRoleInOrganizationService(...)
  S->>Repo: getMembershipByUserAndOrganization(targetUserId, orgId)
  Repo->>DB: Membership.findUnique(target)
  DB-->>Repo: target membership
  Repo-->>S: target membership

  S->>S: assertCanUpdateRole(requesterRole, targetRole, newRole)
  alt Policy violation
    S-->>C: throw 403
    C-->>A: 403 response
  else Allowed
    S->>Repo: updateMembershipRole(targetMembershipId, newRole)
    Repo->>DB: Membership.update(role)
    DB-->>Repo: updated membership
    Repo-->>S: updated record
    S-->>C: success
    C-->>A: 200 OK
  end
~~~

### 14-sequence-ticket-create-auto-assign

~~~mermaid
sequenceDiagram
  autonumber
  actor M as Member/Staff User
  participant Auth as Auth Middleware
  participant R as Ticket Route
  participant C as Ticket Controller
  participant S as Ticket Service
  participant Repo as Ticket Repo
  participant DB as Prisma/PostgreSQL

  M->>Auth: POST /api/tickets
  Auth-->>R: req.user
  R->>C: createTicket(request)
  C->>S: createTicketService(userId, payload)

  S->>Repo: getTicketOrganizationMembership(userId, orgId)
  Repo->>DB: Membership.findUnique(userId_orgId)
  DB-->>Repo: membership
  Repo-->>S: membership

  S->>Repo: createTicket(ticketData)
  Repo->>DB: Ticket.create + ActivityLog(TICKET_CREATED)
  DB-->>Repo: ticket
  Repo-->>S: ticket

  alt assignedToId not provided
    par Load candidate data
      S->>Repo: getOrganizationAvailableAgents(orgId)
      Repo->>DB: Membership.findMany(role=AGENT, isAvailable=true)
      DB-->>Repo: available agents
      Repo-->>S: agents
    and
      S->>Repo: getOrganizationAgentWorkloads(orgId)
      Repo->>DB: AgentWorkload.findMany(orgId)
      DB-->>Repo: workloads
      Repo-->>S: workloads
    end

    S->>S: filter eligible by daily/weekly limits
    alt Eligible agent exists
      S->>Repo: autoAssignTicket(ticketId, selectedAgentId)
      Repo->>DB: transaction(update ticket, upsert workload, activity log)
      DB-->>Repo: assigned ticket
      Repo-->>S: assigned ticket
    else No eligible agent
      S->>S: keep ticket OPEN and unassigned
    end
  end

  S-->>C: ticket response
  C-->>M: 201 Created
~~~

### 15-sequence-ticket-manual-assign

~~~mermaid
sequenceDiagram
  autonumber
  actor SUser as Staff User
  participant Auth as Auth Middleware
  participant R as Ticket Route
  participant C as Ticket Controller
  participant S as Ticket Service
  participant Repo as Ticket Repo
  participant DB as Prisma/PostgreSQL

  SUser->>Auth: PATCH /api/tickets/:ticketId/assign
  Auth-->>R: req.user
  R->>C: assignTicket(request)
  C->>S: assignTicketService(actorId, ticketId, assigneeId)

  S->>Repo: getTicketById(ticketId)
  Repo->>DB: Ticket.findUnique
  DB-->>Repo: ticket
  Repo-->>S: ticket

  S->>Repo: getTicketOrganizationMembership(actorId, orgId)
  Repo->>DB: Membership.findUnique(actor)
  DB-->>Repo: actor membership
  Repo-->>S: actor membership

  S->>S: canAssignTickets(actorRole)
  alt Not allowed
    S-->>C: throw 403
    C-->>SUser: 403 response
  else Allowed
    S->>Repo: validateTicketAssignee(orgId, assigneeId)
    Repo->>DB: Membership.findUnique(assignee)
    DB-->>Repo: assignee membership
    Repo-->>S: assignee membership

    S->>Repo: assignTicket(ticketId, assigneeId, actorId)
    Repo->>DB: Ticket.update + ActivityLog(TICKET_ASSIGNED)
    DB-->>Repo: updated ticket
    Repo-->>S: updated ticket
    S-->>C: success
    C-->>SUser: 200 OK
  end
~~~

### 16-sequence-ticket-status-update

~~~mermaid
sequenceDiagram
  autonumber
  actor U as Member/Staff User
  participant Auth as Auth Middleware
  participant R as Ticket Route
  participant C as Ticket Controller
  participant S as Ticket Service
  participant Repo as Ticket Repo
  participant DB as Prisma/PostgreSQL

  U->>Auth: PATCH /api/tickets/:ticketId/status
  Auth-->>R: req.user
  R->>C: updateTicketStatus(request)
  C->>S: updateTicketStatusService(actorId, ticketId, newStatus)

  S->>Repo: getTicketById(ticketId)
  Repo->>DB: Ticket.findUnique
  DB-->>Repo: ticket
  Repo-->>S: ticket

  S->>Repo: getTicketOrganizationMembership(actorId, organizationId)
  Repo->>DB: Membership.findUnique(actor)
  DB-->>Repo: membership
  Repo-->>S: membership

  S->>S: canEditAllOrganizationTickets(role)
  alt Not allowed and not ticket owner
    S-->>C: throw 403
    C-->>U: 403 response
  else Allowed
    S->>Repo: updateTicketStatus(ticketId, newStatus, oldStatus, actorId)
    Repo->>DB: Ticket.update + ActivityLog(TICKET_STATUS_UPDATED)
    DB-->>Repo: updated ticket
    Repo-->>S: updated ticket
    S-->>C: success
    C-->>U: 200 OK
  end
~~~

### 17-sequence-ticket-internal-comment

~~~mermaid
sequenceDiagram
  autonumber
  actor U as Member/Staff User
  participant Auth as Auth Middleware
  participant R as Ticket Route
  participant C as Ticket Controller
  participant S as Ticket Service
  participant Repo as Ticket Repo
  participant DB as Prisma/PostgreSQL

  U->>Auth: POST /api/tickets/:ticketId/comments
  Auth-->>R: req.user
  R->>C: createTicketComment(request)
  C->>S: createTicketCommentService(actorId, ticketId, message, isInternal)

  S->>Repo: getTicketById(ticketId)
  Repo->>DB: Ticket.findUnique
  DB-->>Repo: ticket
  Repo-->>S: ticket

  S->>Repo: getTicketOrganizationMembership(actorId, orgId)
  Repo->>DB: Membership.findUnique(actor)
  DB-->>Repo: membership
  Repo-->>S: membership

  alt isInternal = true
    S->>S: canCreateInternalComment(role)
    alt Not allowed
      S-->>C: throw 403
      C-->>U: 403 response
    else Allowed
      S->>Repo: createTicketComment(...)
      Repo->>DB: TicketComment.create
      DB-->>Repo: comment
      Repo-->>S: comment
      S->>Repo: createTicketActivityLog(COMMENT_ADDED)
      Repo->>DB: TicketActivityLog.create
      DB-->>Repo: log
      Repo-->>S: log
      S-->>C: success
      C-->>U: 201 Created
    end
  else isInternal = false
    S->>Repo: createTicketComment(...)
    Repo->>DB: TicketComment.create
    DB-->>Repo: comment
    Repo-->>S: comment
    S->>Repo: createTicketActivityLog(COMMENT_ADDED)
    Repo->>DB: TicketActivityLog.create
    DB-->>Repo: log
    Repo-->>S: log
    S-->>C: success
    C-->>U: 201 Created
  end
~~~

### 18-sequence-ticket-tagging

~~~mermaid
sequenceDiagram
  autonumber
  actor SUser as Staff User
  participant Auth as Auth Middleware
  participant R as Ticket Route
  participant C as Ticket Controller
  participant S as Ticket Service
  participant Repo as Ticket Repo
  participant DB as Prisma/PostgreSQL

  SUser->>Auth: POST /api/tickets/:ticketId/tags
  Auth-->>R: req.user
  R->>C: addTagToTicket(request)
  C->>S: addTagToTicketService(actorId, ticketId, tagId)

  S->>Repo: getTicketById(ticketId)
  Repo->>DB: Ticket.findUnique
  DB-->>Repo: ticket
  Repo-->>S: ticket

  S->>Repo: getTicketOrganizationMembership(actorId, organizationId)
  Repo->>DB: Membership.findUnique
  DB-->>Repo: membership
  Repo-->>S: membership

  S->>S: canEditAllOrganizationTickets(role)
  alt Not allowed
    S-->>C: throw 403
    C-->>SUser: 403 response
  else Allowed
    S->>Repo: addTagToTicket(ticketId, tagId)
    Repo->>DB: TicketTag.create
    DB-->>Repo: mapping
    Repo-->>S: mapping
    S->>Repo: createTicketActivityLog(TAG_ADDED)
    Repo->>DB: TicketActivityLog.create
    DB-->>Repo: log
    Repo-->>S: log
    S-->>C: success
    C-->>SUser: 200 OK
  end
~~~

### 19-sequence-agent-availability-update

~~~mermaid
sequenceDiagram
  autonumber
  actor A as Agent/Staff User
  participant Auth as Auth Middleware
  participant R as Agent Route
  participant C as Ticket Controller
  participant S as Ticket Service
  participant Repo as Ticket Repo
  participant DB as Prisma/PostgreSQL

  A->>Auth: PATCH /api/tickets/agents/me/availability
  Auth-->>R: req.user
  R->>C: updateMyAvailability(request)
  C->>S: updateMyAvailabilityService(userId, organizationId, isAvailable)

  S->>Repo: getStaffMemberships(userId)
  Repo->>DB: Membership.findMany(userId, role in OWNER/ADMIN/AGENT)
  DB-->>Repo: staff memberships
  Repo-->>S: memberships

  S->>S: verify requested organization scope
  alt Not staff in organization
    S-->>C: throw 403
    C-->>A: 403 response
  else Allowed
    S->>Repo: updateMembershipAvailability(userId, organizationId, isAvailable)
    Repo->>DB: Membership.update(isAvailable)
    DB-->>Repo: updated membership
    Repo-->>S: updated membership
    S-->>C: success
    C-->>A: 200 OK
  end
~~~

### 20-sequence-agent-stats

~~~mermaid
sequenceDiagram
  autonumber
  actor A as Agent/Staff User
  participant Auth as Auth Middleware
  participant R as Agent Route
  participant C as Ticket Controller
  participant S as Ticket Service
  participant Repo as Ticket Repo
  participant DB as Prisma/PostgreSQL

  A->>Auth: GET /api/tickets/agents/me/stats?organizationId=...
  Auth-->>R: req.user
  R->>C: getMyAgentStats(request)
  C->>S: getMyAgentStatsService(userId, organizationId)

  S->>Repo: getStaffMemberships(userId)
  Repo->>DB: Membership.findMany(userId, role in OWNER/ADMIN/AGENT)
  DB-->>Repo: memberships
  Repo-->>S: memberships

  alt No staff membership in scope
    S-->>C: throw 403
    C-->>A: 403 response
  else Allowed
    S->>Repo: getAgentTickets(userId, organizationId)
    Repo->>DB: Ticket.findMany(assignedToId=userId)
    DB-->>Repo: assigned tickets
    Repo-->>S: tickets

    S->>S: aggregate by status and priority
    S-->>C: stats summary
    C-->>A: 200 OK
  end
~~~

## Deployment

### 21-deployment-as-is

~~~mermaid
flowchart TB
  subgraph ClientLayer[Client Layer]
    Web[Web/Frontend Client]
  end

  subgraph RuntimeLayer[Runtime Layer]
    APIGW[api-gateway service\nNode.js + Express]
  end

  subgraph DataLayer[Data Layer]
    PG[(PostgreSQL)]
  end

  Web -->|HTTPS| APIGW
  APIGW -->|Prisma ORM| PG

  Note1[Current implemented deployment view]
  Note1 -.-> APIGW
~~~

### 22-deployment-to-be

~~~mermaid
flowchart TB
  subgraph Edge[Edge]
    Nginx[Nginx Reverse Proxy]
  end

  subgraph Client[Client]
    Frontend[React Frontend]
  end

  subgraph Services[Microservices]
    APIGW[API Gateway]
    AuthSvc[Auth Service]
    OrgSvc[Organization Service]
    TicketSvc[Ticket Service]
    DocSvc[Document Service]
    AISvc[AI Service]
    NotifySvc[Notification Service]
  end

  subgraph Async[Event and Worker Layer]
    Kafka[Kafka]
    Workers[Background Workers]
    N8n[n8n Automation]
  end

  subgraph Storage[Storage and Infra]
    PG[(PostgreSQL + pgvector)]
    Redis[(Redis)]
    S3[(S3/MinIO)]
    Prom[Prometheus]
    Grafana[Grafana]
  end

  Frontend --> Nginx
  Nginx --> APIGW

  APIGW --> AuthSvc
  APIGW --> OrgSvc
  APIGW --> TicketSvc
  APIGW --> DocSvc
  APIGW --> AISvc
  APIGW --> NotifySvc

  AuthSvc --> PG
  OrgSvc --> PG
  TicketSvc --> PG
  TicketSvc --> Redis
  DocSvc --> S3
  DocSvc --> PG
  AISvc --> PG
  AISvc --> Redis
  NotifySvc --> Kafka

  TicketSvc --> Kafka
  DocSvc --> Kafka
  AISvc --> Kafka
  Kafka --> Workers
  Workers --> PG
  Workers --> S3
  Workers --> Redis
  Workers --> N8n

  Prom --> APIGW
  Prom --> AuthSvc
  Prom --> OrgSvc
  Prom --> TicketSvc
  Prom --> DocSvc
  Prom --> AISvc
  Prom --> NotifySvc
  Grafana --> Prom

  Planned[Planned target deployment from roadmap]
  Planned -.-> Services
  Planned -.-> Async
  Planned -.-> Storage
~~~
