export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const TICKET_SOURCES = ["WEB", "EMAIL", "CHAT", "API"];

export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export const TICKET_ROLE_POLICIES = {
  OWNER: {
    canViewAll: true,
    canEditAll: true,
    canAssign: true,
    canCreateInternalComment: true,
    canDeleteAnyComment: true,
  },
  ADMIN: {
    canViewAll: true,
    canEditAll: true,
    canAssign: true,
    canCreateInternalComment: true,
    canDeleteAnyComment: true,
  },
  AGENT: {
    canViewAll: true,
    canEditAll: true,
    canAssign: true,
    canCreateInternalComment: true,
    canDeleteAnyComment: true,
  },
  MEMBER: {
    canViewAll: false,
    canEditAll: false,
    canAssign: false,
    canCreateInternalComment: false,
    canDeleteAnyComment: false,
  },
};

export const AUTO_ASSIGNABLE_STATUSES = ["OPEN", "IN_PROGRESS"];

export const AUTO_ASSIGNMENT_MAX_ACTIVE_TICKETS = 5;
