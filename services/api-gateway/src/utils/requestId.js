import { requestContext } from "../config/database.config.js";
import { RequestAbortedError } from "./errorHandler.js";

/**
 * Get the current requestId from AsyncLocalStorage (if running inside an HTTP request).
 * Returns undefined when called outside a request context (e.g. cron jobs).
 */
export const getCurrentRequestId = () =>
  requestContext.getStore()?.requestId ?? undefined;

/**
 * Get the AbortSignal for the current request from AsyncLocalStorage.
 * Returns undefined when called outside a request context or in workers.
 */
export const getRequestSignal = () =>
  requestContext.getStore()?.signal ?? undefined;

/**
 * Throw if the current request has been aborted (timeout or client disconnect).
 * Call between expensive sequential steps to bail early.
 * No-op outside a request context (workers, crons).
 */
export const checkAbort = () => {
  const signal = getRequestSignal();
  if (signal?.aborted) {
    throw new RequestAbortedError(signal.reason?.message ?? "unknown");
  }
};

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
