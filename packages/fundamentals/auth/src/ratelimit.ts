/**
 * In-memory attempt limiter for brute-forceable checks — TOTP codes, passkey and
 * password attempts. A 6-digit TOTP accepted in a ±1-step window is guessable by
 * an unthrottled attacker, so wrap every verification in one of these.
 *
 * Fixed window per key: at most `max` attempts per `windowMs`. PER PROCESS — a
 * deployment with several instances needs a shared store (Redis, the database)
 * with the same semantics; this is the reference and the single-process default.
 *
 * Bounded: expired windows are dropped as they are touched, and the table never
 * holds more than `maxKeys` entries (the oldest window is evicted first), so a
 * flood of distinct keys cannot grow it without limit.
 */
export interface AttemptLimiterOptions {
  /** Attempts allowed per window. Default 5. */
  max?: number
  /** Window length in ms. Default 15 minutes. */
  windowMs?: number
  /** Most keys tracked at once. Default 10 000. */
  maxKeys?: number
  /** Clock, for tests. */
  now?: () => number
}

export type AttemptResult = { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number }

export interface AttemptLimiter {
  /** Record one attempt for `key` (an account id, an IP) and say whether it may proceed. */
  attempt(key: string): AttemptResult
  /** Clear `key` — call after a SUCCESSFUL verification. */
  reset(key: string): void
}

export function createAttemptLimiter(opts: AttemptLimiterOptions = {}): AttemptLimiter {
  const max = opts.max ?? 5
  const windowMs = opts.windowMs ?? 15 * 60_000
  const maxKeys = opts.maxKeys ?? 10_000
  const now = opts.now ?? Date.now
  // Map order is insertion order, and a key is re-inserted when its window
  // restarts, so the first entry is always the oldest window.
  const windows = new Map<string, { start: number; count: number }>()

  return {
    attempt(key) {
      const t = now()
      let w = windows.get(key)
      if (w !== undefined && t - w.start >= windowMs) {
        windows.delete(key)
        w = undefined
      }
      if (w === undefined) {
        // Evict expired windows from the front, then cap the table.
        for (const [k, v] of windows) {
          if (t - v.start < windowMs) break
          windows.delete(k)
        }
        while (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string)
        w = { start: t, count: 0 }
        windows.set(key, w)
      }
      if (w.count >= max) return { allowed: false, retryAfterMs: w.start + windowMs - t }
      w.count++
      return { allowed: true, remaining: max - w.count }
    },
    reset(key) {
      windows.delete(key)
    },
  }
}
