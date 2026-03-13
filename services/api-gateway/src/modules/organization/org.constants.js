export const ROLE_POLICIES = {
  OWNER: {
    canInvite: ["ADMIN", "AGENT", "MEMBER"],
    canManage: ["ADMIN", "AGENT", "MEMBER"],
    canAssign: ["ADMIN", "AGENT", "MEMBER"],
  },
  ADMIN: {
    canInvite: ["AGENT", "MEMBER"],
    canManage: ["AGENT", "MEMBER"],
    canAssign: ["AGENT", "MEMBER"],
  },
  AGENT: {
    canInvite: [],
    canManage: [],
    canAssign: [],
  },
  MEMBER: {
    canInvite: [],
    canManage: [],
    canAssign: [],
  },
};
