/**
 * Once-per-message dev warnings for the engine's INPUT boundaries — the places
 * where a malformed input used to degrade silently (a string-valued column
 * plotted as gaps, a `maxPoints` of 2 ignored, a log axis over values ≤ 0).
 *
 * Bounded: at most 100 distinct keys are remembered (leak class C) — past
 * that a repeat may warn again, which is harmless.
 */
const seen = /* @__PURE__ */ new Set<string>()

export function warnOnce(key: string, message: string): void {
  if (process.env.NODE_ENV === 'production') return
  if (seen.has(key)) return
  if (seen.size < 100) seen.add(key)
  console.warn(`[Pyreon] @pyreon/charts: ${message}`)
}

/** @internal — test hook. */
export function _resetWarnOnce(): void {
  seen.clear()
}
