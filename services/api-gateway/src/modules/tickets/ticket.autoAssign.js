import { ApiError } from "../../utils/errorHandler.js";
import {
  autoAssignTicket,
  getOrganizationAvailableAgents,
  getOrganizationAgentWorkloads,
} from "./ticket.repo.js";
import { startOfDay, startOfWeek } from "./ticket.utils.js";

export const getWorkloadMap = (workloads) =>
  new Map(workloads.map((workload) => [workload.userId, workload]));

export const getEffectiveWorkload = (workload, now) => {
  if (!workload) {
    return {
      assignedToday: 0,
      assignedThisWeek: 0,
    };
  }

  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const lastDailyReset = workload.lastDailyReset
    ? new Date(workload.lastDailyReset)
    : null;
  const lastWeeklyReset = workload.lastWeeklyReset
    ? new Date(workload.lastWeeklyReset)
    : null;

  return {
    assignedToday:
      lastDailyReset && lastDailyReset >= dayStart ? workload.assignedToday : 0,
    assignedThisWeek:
      lastWeeklyReset && lastWeeklyReset >= weekStart
        ? workload.assignedThisWeek
        : 0,
  };
};

export const isEligibleForAutoAssignment = (membership, workload, now) => {
  const effectiveWorkload = getEffectiveWorkload(workload, now);

  if (
    membership.maxTicketsPerDay !== null &&
    membership.maxTicketsPerDay !== undefined &&
    effectiveWorkload.assignedToday >= membership.maxTicketsPerDay
  ) {
    return false;
  }

  if (
    membership.maxTicketsPerWeek !== null &&
    membership.maxTicketsPerWeek !== undefined &&
    effectiveWorkload.assignedThisWeek >= membership.maxTicketsPerWeek
  ) {
    return false;
  }

  return true;
};

export const findBestAutoAssignAgent = async (organizationId) => {
  const [agents, workloads] = await Promise.all([
    getOrganizationAvailableAgents(organizationId),
    getOrganizationAgentWorkloads(organizationId),
  ]);
  const now = new Date();
  const workloadMap = getWorkloadMap(workloads);
  const eligibleAgents = agents.filter((membership) =>
    isEligibleForAutoAssignment(
      membership,
      workloadMap.get(membership.userId),
      now,
    ),
  );

  if (eligibleAgents.length === 0) {
    return null;
  }

  const [leastLoadedAgent] = eligibleAgents.sort((left, right) => {
    const leftWorkload = getEffectiveWorkload(
      workloadMap.get(left.userId),
      now,
    );
    const rightWorkload = getEffectiveWorkload(
      workloadMap.get(right.userId),
      now,
    );

    if (leftWorkload.assignedToday !== rightWorkload.assignedToday) {
      return leftWorkload.assignedToday - rightWorkload.assignedToday;
    }

    return leftWorkload.assignedThisWeek - rightWorkload.assignedThisWeek;
  });

  return leastLoadedAgent.userId;
};

export const autoAssignTicketForOrganization = async (ticket) => {
  const autoAssignedUserId = await findBestAutoAssignAgent(
    ticket.organizationId,
  );

  if (!autoAssignedUserId) {
    throw new ApiError(422, "No available agent found for auto-assignment", "NO_AGENT_AVAILABLE");
  }

  const autoAssignedTicket = await autoAssignTicket(
    ticket.id,
    ticket.organizationId,
    autoAssignedUserId,
  );

  if (!autoAssignedTicket || !autoAssignedTicket.id) {
    throw new ApiError(500, "Failed to auto-assign ticket", "AUTO_ASSIGN_FAILED");
  }

  return autoAssignedTicket;
};
