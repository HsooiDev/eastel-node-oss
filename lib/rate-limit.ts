// ─────────────────────────────────────────────────────────────
// In-Memory Rate Limiter
// Simple sliding-window limiter for login attempts and API abuse
// ─────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()
const MAX_KEYS = 10_000

// ── Periodic Cleanup ─────────────────────────────────────────
// Prevent memory leaks from expired entries.
// Runs every 5 minutes; only starts once per process.

let cleanupScheduled = false

function scheduleCleanup(): void {
  if (cleanupScheduled) return
  cleanupScheduled = true

  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now >= entry.resetAt) {
        store.delete(key)
      }
    }
  }, CLEANUP_INTERVAL_MS).unref()
}

// ── Public API ───────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Check whether a request is allowed under the rate limit.
 *
 * @param key         Unique key, e.g. "login:192.168.1.1" or "login:user@example.com"
 * @param maxAttempts Maximum number of attempts within the window
 * @param windowMs    Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  scheduleCleanup()

  const now = Date.now()
  if (!key || key.length > 256) return { allowed: false, remaining: 0, resetAt: now + windowMs }
  if (!store.has(key) && store.size >= MAX_KEYS) {
    for (const [storedKey, entry] of store) if (now >= entry.resetAt) store.delete(storedKey)
    if (store.size >= MAX_KEYS) return { allowed: false, remaining: 0, resetAt: now + windowMs }
  }
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    // First request or window expired — start fresh
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: maxAttempts - 1, resetAt }
  }

  if (entry.count >= maxAttempts) {
    // Limit exceeded
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  // Increment counter
  entry.count += 1
  store.set(key, entry)
  return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt }
}

/**
 * Reset the rate limit for a given key.
 * Call after successful authentication to clear the counter.
 */
export function resetRateLimit(key: string): void {
  store.delete(key)
}
