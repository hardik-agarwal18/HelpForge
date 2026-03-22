/**
 * Circuit Breaker — chatbot service
 * ───────────────────────────────────
 * Stops the bridge worker from hammering a down Python service.
 *
 * Problem without it
 * ──────────────────
 * If chatbot-service is down, every BullMQ job will:
 *   1. Wait 60 s for the HTTP timeout
 *   2. Fail → BullMQ retries → repeat
 *   3. Worker concurrency slots are all blocked on dead requests
 *   4. New jobs pile up → Redis memory grows → everything degrades
 *
 * Solution
 * ────────
 * State machine with three states:
 *
 *   CLOSED    — normal; all requests pass through
 *   OPEN      — service is down; requests fail instantly (no HTTP call)
 *               jobs are moved to BullMQ's delayed set, NOT failed
 *   HALF_OPEN — probe state entered after recoveryTimeout ms;
 *               one request is allowed through to test recovery
 *
 * Transitions
 * ───────────
 *   CLOSED    → OPEN      after `failureThreshold` consecutive failures
 *   OPEN      → HALF_OPEN after `recoveryTimeout` ms
 *   HALF_OPEN → CLOSED    after `successThreshold` consecutive successes
 *   HALF_OPEN → OPEN      on any failure (back to waiting)
 *
 * BullMQ integration (in chatbot.bridge.worker.js)
 * ────────────────────────────────────────────────
 * When fire() throws CircuitOpenError the worker calls job.moveToDelayed()
 * instead of letting BullMQ count it as a retry failure.  The job wakes up
 * after remainingOpenMs() + 5 s, by which point the circuit may have probed
 * and closed.  Retry budget is preserved for real errors.
 */

import logger from "../../../config/logger.js";

// ── Error types ───────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(name, remainingMs) {
    super(`Circuit [${name}] OPEN — failing fast (recovers in ~${Math.ceil(remainingMs / 1000)}s)`);
    this.name = "CircuitOpenError";
    this.remainingMs = remainingMs;
  }
}

// ── Circuit Breaker ───────────────────────────────────────────────────────────

export class CircuitBreaker {
  // Private fields — prevents accidental external mutation
  #state = "CLOSED";
  #failures = 0;
  #successes = 0;
  #lastFailureTime = 0;

  /**
   * @param {Object}  opts
   * @param {string}  opts.name              Display name for logs
   * @param {number}  opts.failureThreshold  CLOSED→OPEN after N consecutive failures   (default 5)
   * @param {number}  opts.successThreshold  HALF_OPEN→CLOSED after N successes          (default 2)
   * @param {number}  opts.recoveryTimeout   ms before OPEN→HALF_OPEN probe              (default 30 000)
   */
  constructor({
    name = "circuit",
    failureThreshold = 5,
    successThreshold = 2,
    recoveryTimeout = 30_000,
  } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.recoveryTimeout = recoveryTimeout;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get state() {
    return this.#state;
  }

  /** How many ms remain before the circuit probes for recovery. */
  remainingOpenMs() {
    if (this.#state !== "OPEN") return 0;
    return Math.max(0, this.recoveryTimeout - (Date.now() - this.#lastFailureTime));
  }

  /**
   * Execute `fn`.  Throws CircuitOpenError immediately if the circuit is OPEN
   * and the recovery timeout hasn't elapsed.  Tracks successes and failures to
   * drive state transitions.
   *
   * @param {() => Promise<*>} fn  The async function to protect
   */
  async fire(fn) {
    if (this.#state === "OPEN") {
      const remaining = this.remainingOpenMs();
      if (remaining > 0) {
        throw new CircuitOpenError(this.name, remaining);
      }
      // Recovery timeout elapsed → allow one probe request
      this.#state = "HALF_OPEN";
      this.#successes = 0;
      logger.info({ circuit: this.name }, "Circuit → HALF_OPEN (probing recovery)");
    }

    try {
      const result = await fn();
      this.#onSuccess();
      return result;
    } catch (err) {
      if (err instanceof CircuitOpenError) throw err; // don't count as circuit failure
      this.#onFailure(err);
      throw err;
    }
  }

  // ── State transitions ──────────────────────────────────────────────────────

  #onSuccess() {
    this.#failures = 0;
    if (this.#state === "HALF_OPEN") {
      this.#successes++;
      if (this.#successes >= this.successThreshold) {
        this.#state = "CLOSED";
        this.#successes = 0;
        logger.info({ circuit: this.name }, "Circuit → CLOSED (service recovered)");
      } else {
        logger.debug(
          { circuit: this.name, successes: this.#successes, needed: this.successThreshold },
          "Circuit HALF_OPEN — probe success, waiting for threshold",
        );
      }
    }
  }

  #onFailure(err) {
    this.#lastFailureTime = Date.now();

    if (this.#state === "HALF_OPEN") {
      this.#state = "OPEN";
      this.#successes = 0;
      logger.warn(
        { circuit: this.name, err: err.message },
        "Circuit → OPEN (probe failed, service still down)",
      );
      return;
    }

    this.#failures++;
    logger.debug({ circuit: this.name, failures: this.#failures, threshold: this.failureThreshold }, "Circuit failure recorded");

    if (this.#failures >= this.failureThreshold) {
      this.#state = "OPEN";
      logger.error(
        { circuit: this.name, failures: this.#failures },
        "Circuit → OPEN (failure threshold exceeded)",
      );
    }
  }
}

// ── Singleton for the chatbot service connection ──────────────────────────────

export const chatbotCircuit = new CircuitBreaker({
  name: "chatbot-service",
  failureThreshold: 5,     // open after 5 consecutive HTTP errors
  successThreshold: 2,     // close after 2 successful probes
  recoveryTimeout: 30_000, // probe after 30 s of being open
});
