import { requestContext } from "../config/database.config.js";

/**
 * Get the current requestId from AsyncLocalStorage (if running inside an HTTP request).
 * Returns undefined when called outside a request context (e.g. cron jobs).
 */
export const getCurrentRequestId = () =>
  requestContext.getStore()?.requestId ?? undefined;

/**
 * Inject the current requestId into a job payload before enqueuing.
 * No-op if there is no active request context.
 */
export const withRequestId = (payload) => {
  const requestId = getCurrentRequestId();
  return requestId ? { ...payload, requestId: requestId } : payload;
};

/**
 * Run a worker job processor inside requestContext so that logger.mixin()
 * automatically includes the requestId from the originating HTTP request.
 *
 * Falls back to job.id when no requestId was captured at enqueue time
 * (e.g. jobs created by crons or internal triggers).
 */
export const runWithJobContext = (fn) => async (job, token) => {
  const requestId = job.data?.requestId ?? job.id;
  return requestContext.run({ requestId }, () => fn(job, token));
};
