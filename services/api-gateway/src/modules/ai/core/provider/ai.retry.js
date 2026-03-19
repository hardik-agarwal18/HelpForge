const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async function with a fixed delay.
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {Object} [options]
 * @param {number} [options.retries=3] - Number of retries after initial try
 * @param {number} [options.delayMs=500] - Delay between retries in milliseconds
 * @param {(error: unknown, retriesRemaining: number) => void} [options.onRetry]
 * @returns {Promise<T>}
 */
export const withRetry = async (fn, options = {}) => {
  const { retries = 3, delayMs = 500, onRetry } = options;

  let retriesRemaining = retries;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (retriesRemaining <= 0) {
        throw error;
      }

      if (onRetry) {
        onRetry(error, retriesRemaining);
      }

      retriesRemaining -= 1;
      await sleep(delayMs);
    }
  }
};
