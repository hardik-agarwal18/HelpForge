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

export const PERMISSION_DETAILS = {
  [PERMISSIONS.ORG_UPDATE]: {
    name: PERMISSIONS.ORG_UPDATE,
    description: "Update organization settings",
    resource: "org",
    action: "update",
  },
  [PERMISSIONS.ORG_DELETE]: {
    name: PERMISSIONS.ORG_DELETE,
    description: "Delete the organization",
    resource: "org",
    action: "delete",
  },
  [PERMISSIONS.ORG_INVITE_MEMBER]: {
    name: PERMISSIONS.ORG_INVITE_MEMBER,
    description: "Invite members to the organization",
    resource: "org",
    action: "invite_member",
  },
  [PERMISSIONS.ORG_MANAGE_MEMBER]: {
    name: PERMISSIONS.ORG_MANAGE_MEMBER,
    description: "Manage organization members",
    resource: "org",
    action: "manage_member",
  },
  [PERMISSIONS.ORG_VIEW_MEMBERS]: {
    name: PERMISSIONS.ORG_VIEW_MEMBERS,
    description: "View organization members",
    resource: "org",
    action: "view_members",
  },
  [PERMISSIONS.ROLE_CREATE]: {
    name: PERMISSIONS.ROLE_CREATE,
    description: "Create custom roles",
    resource: "role",
    action: "create",
  },
  [PERMISSIONS.ROLE_UPDATE]: {
    name: PERMISSIONS.ROLE_UPDATE,
    description: "Update custom roles",
    resource: "role",
    action: "update",
  },
  [PERMISSIONS.ROLE_DELETE]: {
    name: PERMISSIONS.ROLE_DELETE,
    description: "Delete custom roles",
    resource: "role",
    action: "delete",
  },
  [PERMISSIONS.TICKET_VIEW_ALL]: {
    name: PERMISSIONS.TICKET_VIEW_ALL,
    description: "View all organization tickets",
    resource: "ticket",
    action: "view_all",
  },
  [PERMISSIONS.TICKET_EDIT_ALL]: {
    name: PERMISSIONS.TICKET_EDIT_ALL,
    description: "Edit all organization tickets",
    resource: "ticket",
    action: "edit_all",
  },
  [PERMISSIONS.TICKET_ASSIGN]: {
    name: PERMISSIONS.TICKET_ASSIGN,
    description: "Assign organization tickets",
    resource: "ticket",
    action: "assign",
  },
  [PERMISSIONS.TICKET_CREATE_INTERNAL_COMMENT]: {
    name: PERMISSIONS.TICKET_CREATE_INTERNAL_COMMENT,
    description: "Create internal ticket comments",
    resource: "ticket",
    action: "create_internal_comment",
  },
  [PERMISSIONS.TICKET_DELETE_ANY_COMMENT]: {
    name: PERMISSIONS.TICKET_DELETE_ANY_COMMENT,
    description: "Delete any ticket comment",
    resource: "ticket",
    action: "delete_any_comment",
  },
  [PERMISSIONS.TICKET_DELETE_ANY_ATTACHMENT]: {
    name: PERMISSIONS.TICKET_DELETE_ANY_ATTACHMENT,
    description: "Delete any ticket attachment",
    resource: "ticket",
    action: "delete_any_attachment",
  },
  [PERMISSIONS.AGENT_UPDATE_AVAILABILITY]: {
    name: PERMISSIONS.AGENT_UPDATE_AVAILABILITY,
    description: "Update agent availability",
    resource: "agent",
    action: "update_availability",
  },
  [PERMISSIONS.AI_MANAGE_CONFIG]: {
    name: PERMISSIONS.AI_MANAGE_CONFIG,
    description: "Manage AI configuration",
    resource: "ai",
    action: "manage_config",
  },
};

export const ALL_PERMISSION_DETAILS = ALL_PERMISSIONS.map(
  (permission) => PERMISSION_DETAILS[permission],
);

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
