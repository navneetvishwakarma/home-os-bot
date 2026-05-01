'use strict';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, { retryOn = [503, 429], maxAttempts = 3, baseDelayMs = 1000, _sleep = sleep } = {}) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status ?? err.statusCode ?? err.response?.status;
      if (!retryOn.includes(status)) throw err;
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        await _sleep(delay);
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };
