# HelpForge UML Diagram Set

This directory contains the complete UML diagram suite for the current API Gateway implementation and planned platform deployment.

## Structural Diagrams

1. `01-use-case.mmd` - Actor capabilities across auth, organization, and ticketing.
2. `02-component-current.mmd` - Current component architecture.
3. `03-package-api-gateway.mmd` - Internal package/layer dependencies.
4. `04-class-domain-prisma.mmd` - Prisma domain model class view.

## Behavioral Diagrams

1. `06-activity-auto-assignment.mmd` - Ticket auto-assignment decision process.
2. `07-activity-role-management.mmd` - Organization member role update process.
3. `08-activity-ticket-status-update.mmd` - Ticket status update process.

## State Diagram

1. `05-state-ticket-lifecycle.mmd` - Ticket lifecycle states and transitions.

## Sequence Diagrams

1. `09-sequence-auth-register.mmd`
2. `10-sequence-auth-login.mmd`
3. `11-sequence-org-create.mmd`
4. `12-sequence-org-invite-member.mmd`
5. `13-sequence-org-update-member-role.mmd`
6. `14-sequence-ticket-create-auto-assign.mmd`
7. `15-sequence-ticket-manual-assign.mmd`
8. `16-sequence-ticket-status-update.mmd`
9. `17-sequence-ticket-internal-comment.mmd`
10. `18-sequence-ticket-tagging.mmd`
11. `19-sequence-agent-availability-update.mmd`
12. `20-sequence-agent-stats.mmd`

## Deployment Diagrams

1. `21-deployment-as-is.mmd` - Current implemented runtime deployment.
2. `22-deployment-to-be.mmd` - Planned target deployment from roadmap.

## Notes

- Current-state diagrams are based on implemented code under `services/api-gateway`.
- Planned deployment is explicitly marked as target architecture and not fully implemented.
- Mermaid format is used for version-controlled diagram sources.
