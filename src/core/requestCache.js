/**
 * requestCache.js — short-lived read cache for Supabase GET requests.
 *
 * Even after Phase 1–3 optimisations, several app views read the same small
 * Supabase tables (subjects, settings, curriculum) on nearly every boot and on
 * every page navigation. Without a cache, 1,000 concurrent students means
 * 1,000 identical GET requests hitting Supabase within seconds.
 *
 * This module caches GET responses for a short TTL (default 10 seconds) and
 * deduplicates in-flight requests: if three components ask for the same URL at
 * the same time, only one HTTP request is made and all three share its result.
 *
 * Writes (POST/PATCH/DELETE) must call `cacheInvalidate(table)` so the next
 * read doesn't return stale data. `supabase.js` does this automatically.
 *
 * Usage:
 *   import { cacheGet, cacheInvalidate } from "./requestCache.js?v=mwz1jos9";
 *   const rows = await cacheGet(`GET /rest/v1/chapters`, () => selectRows("chapters"), 15000);
 */

const cache = new Map(); // key => { value, expiry, _inFlight }

/**
 * Return a cached value if it is still fresh; otherwise run `fetcher`, cache
 * the result, and return it. If the same key is already being fetched
 * (in-flight), all callers share the same promise.
 *
 * @param {string}   key      Cache key (e.g. `GET /rest/v1/chapters`)
 * @param {Function} fetcher  Function returning a Promise
 * @param {number}   ttlMs    Cache lifetime in ms (default 10,000)
 * @returns {Promise}
 */
export function cacheGet(key, fetcher, ttlMs = 10000) {
  const now = Date.now();
  const entry = cache.get(key);

  // Fresh cached value → return immediately.
  if (entry && !entry._inFlight && now < entry.expiry) {
    return Promise.resolve(entry.value);
  }

  // Already in flight → share the existing promise.
  if (entry && entry._inFlight) {
    return entry.value;
  }

  const promise = fetcher().then(
    (value) => {
      cache.set(key, { value, expiry: now + ttlMs, _inFlight: false });
      return value;
    },
    (err) => {
      cache.delete(key); // remove failed entry so the next call retries
      throw err;
    },
  );

  cache.set(key, { value: promise, expiry: now + ttlMs, _inFlight: true });
  return promise;
}

/** Remove every cache entry whose key starts with `prefix` (e.g. a table name). */
export function cacheInvalidate(prefix) {
  if (!prefix) return;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Clear the entire cache. */
export function cacheClear() {
  cache.clear();
}
