export const PERMISSIONS = {
  // Organization management
  ORG_UPDATE: "org:update",
  ORG_DELETE: "org:delete",
  ORG_INVITE_MEMBER: "org:invite_member",
  ORG_MANAGE_MEMBER: "org:manage_member",
  ORG_VIEW_MEMBERS: "org:view_members",

  // Role management
  ROLE_CREATE: "role:create",
  ROLE_UPDATE: "role:update",
  ROLE_DELETE: "role:delete",

  // Tickets
  TICKET_VIEW_ALL: "ticket:view_all",
  TICKET_EDIT_ALL: "ticket:edit_all",
  TICKET_ASSIGN: "ticket:assign",
  TICKET_CREATE_INTERNAL_COMMENT: "ticket:create_internal_comment",
  TICKET_DELETE_ANY_COMMENT: "ticket:delete_any_comment",
  TICKET_DELETE_ANY_ATTACHMENT: "ticket:delete_any_attachment",

  // Agent
  AGENT_UPDATE_AVAILABILITY: "agent:update_availability",

  // AI configuration
  AI_MANAGE_CONFIG: "ai:manage_config",
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const DEFAULT_ROLES = [
  {
    name: "OWNER",
    level: 100,
    isSystem: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    name: "ADMIN",
    level: 75,
    isSystem: true,
    permissions: [
      PERMISSIONS.ORG_UPDATE,
      PERMISSIONS.ORG_INVITE_MEMBER,
      PERMISSIONS.ORG_MANAGE_MEMBER,
      PERMISSIONS.ORG_VIEW_MEMBERS,
      PERMISSIONS.ROLE_CREATE,
      PERMISSIONS.ROLE_UPDATE,
      PERMISSIONS.ROLE_DELETE,
      PERMISSIONS.TICKET_VIEW_ALL,
      PERMISSIONS.TICKET_EDIT_ALL,
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_CREATE_INTERNAL_COMMENT,
      PERMISSIONS.TICKET_DELETE_ANY_COMMENT,
      PERMISSIONS.TICKET_DELETE_ANY_ATTACHMENT,
      PERMISSIONS.AI_MANAGE_CONFIG,
    ],
  },
  {
    name: "AGENT",
    level: 50,
    isSystem: true,
    permissions: [
      PERMISSIONS.ORG_VIEW_MEMBERS,
      PERMISSIONS.TICKET_VIEW_ALL,
      PERMISSIONS.TICKET_EDIT_ALL,
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_CREATE_INTERNAL_COMMENT,
      PERMISSIONS.TICKET_DELETE_ANY_COMMENT,
      PERMISSIONS.TICKET_DELETE_ANY_ATTACHMENT,
      PERMISSIONS.AGENT_UPDATE_AVAILABILITY,
    ],
  },
  {
    name: "MEMBER",
    level: 10,
    isSystem: true,
    permissions: [PERMISSIONS.ORG_VIEW_MEMBERS],
  },
];
