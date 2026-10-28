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
 * holds more than `maxKeys` entries, so a flood of distinct keys cannot grow it
 * without limit.
 *
 * Eviction never frees an attacker's budget. Forgetting a window resets that key's
 * count, so a full table makes room by evicting, in order: an expired window; else
 * the active window with the FEWEST attempts (oldest among ties) — never one that is
 * at its limit. When every slot holds a window that is at its limit, the NEW key is
 * refused (`allowed: false`, retrying when the oldest window ends) instead of
 * releasing a blocked one: the limiter fails closed. That makes a flood of distinct
 * keys able to delay first attempts from new keys — size `maxKeys` well above the
 * number of keys legitimately active in one window — but never able to buy a blocked
 * key more guesses. Resetting a partially-used window costs the flood at least that
 * many attempts on every other slot, so the gain is bounded by `1 / maxKeys`.
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
        // Evict expired windows from the front (they are the oldest).
        for (const [k, v] of windows) {
          if (t - v.start < windowMs) break
          windows.delete(k)
        }
        if (windows.size >= maxKeys) {
          const victim = leastUsedUnblocked(windows, max)
          if (victim === undefined) {
            // Every slot is a window at its limit. Freeing one would hand that key a
            // fresh budget, so refuse the newcomer until the oldest window ends.
            const oldest = windows.values().next().value as { start: number }
            return { allowed: false, retryAfterMs: oldest.start + windowMs - t }
          }
          windows.delete(victim)
        }
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

/**
 * The key of the active window with the fewest attempts that is NOT at its limit
 * (oldest among ties — Map order is window-start order), or undefined when every
 * window is blocking. Stops at the first single-attempt window: nothing can be lower.
 */
function leastUsedUnblocked(windows: Map<string, { count: number }>, max: number): string | undefined {
  let best: string | undefined
  let bestCount = Infinity
  for (const [k, v] of windows) {
    if (v.count >= max || v.count >= bestCount) continue
    best = k
    bestCount = v.count
    if (bestCount <= 1) break
  }
  return best
}
