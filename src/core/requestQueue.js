/**
 * requestQueue.js — frontend concurrency limiter + retry queue.
 *
 * PADHLE.WTF talks directly to Supabase (PostgREST) from the browser. On the
 * Supabase Free plan the shared Micro instance allows only ~200 pooled
 * connections. If hundreds of students boot the app at the same moment, the
 * browser would open far more simultaneous HTTP requests than that, causing
 * timeouts, 503s, and "connection refused" errors.
 *
 * This module caps how many Supabase requests are in flight at once. Extra
 * requests wait in a queue and run as earlier ones finish. It also retries
 * with exponential backoff on retryable errors (429 rate-limit, 502/503/504
 * upstream failures) so a brief spike doesn't permanently fail a user's action.
 *
 * Usage:
 *   import { enqueue } from "./requestQueue.js?v=mwz6nuk5";
 *   await enqueue(() => fetchJson(url, opts));
 */

const MAX_CONCURRENT = 6;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

let running = 0;
const queue = [];

function processQueue() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const { task, resolve, reject } = queue.shift();
    running++;
    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        processQueue();
      });
  }
}

/**
 * Enqueue a task (a function returning a Promise). Runs under a concurrency cap
 * so the app never opens more than MAX_CONCURRENT simultaneous connections to
 * Supabase. Retries on 429 / 502 / 503 / 504 with exponential backoff.
 *
 * @param {Function} task   Function that returns a Promise
 * @param {Object}   options
 * @param {number}   options.retries  Max retry attempts (default 3)
 * @returns {Promise} The task's resolved value, or rejects with the last error.
 */
export function enqueue(task, { retries = MAX_RETRIES } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const run = async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          const status = err?.status ?? 0;
          const retryable = status === 429 || status === 502 || status === 503 || status === 504;
          if (retryable && left > 0) {
            const delay = BASE_BACKOFF_MS * (MAX_RETRIES - left + 1);
            setTimeout(() => attempt(left - 1), delay);
          } else {
            reject(err);
          }
        }
      };
      if (running < MAX_CONCURRENT) {
        run();
      } else {
        queue.push({ task: run, resolve, reject });
      }
    };
    attempt(retries);
  });
}

