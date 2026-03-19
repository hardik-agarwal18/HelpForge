/**
 * Wrap a promise with a timeout.
 * @template T
 * @param {Promise<T>} promise - Promise to guard
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Error message on timeout
 * @returns {Promise<T>}
 */
export const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};
