/**
 * Counter registry — a single Map keyed by metric name.
 *
 * Writes are O(1) and cheap enough to leave enabled in dev builds without
 * measurable impact. Reads (`_snapshot`) materialise a plain object so
 * callers can JSON.stringify / diff without holding a live reference to
 * the registry.
 *
 * ## Cross-package write path
 *
 * Framework packages (styler, unistyle, router, …) are published to npm and
 * must not import from this (private) package — doing so would break npm
 * install for external consumers. Instead, each framework package calls
 * `globalThis.__pyreon_count__?.(name)` behind an `import.meta.env?.DEV`
 * gate. This has three nice properties:
 *
 * 1. Zero cross-package coupling — no `@pyreon/perf-harness` dep graph.
 * 2. Prod tree-shakes to zero bytes (the gate folds to `false`).
 * 3. Until someone calls `install()`, the global is undefined and the
 *    `?.` short-circuits — counter bookkeeping costs nothing.
 *
 * `install()` / `_enable()` sets `globalThis.__pyreon_count__ = _count`;
 * `_disable()` clears it. `_count` is also exported for direct use inside
 * this package and inside tests that want to bypass the global.
 */

export type CounterName = string

const counters = new Map<CounterName, number>()

// Enabled state. Default off — callers opt in with `install()` or `_enable()`.
let enabled = false

interface CountGlobal {
  __pyreon_count__?: (name: CounterName, n?: number) => void
}

/**
 * Increment a named counter. No-op when disabled. Direct export exists for
 * test isolation and for this package's own use; framework packages should
 * go through the `globalThis.__pyreon_count__` sink instead so they carry
 * zero import-time coupling to perf-harness.
 */
export function _count(name: CounterName, delta = 1): void {
  if (!enabled) return
  counters.set(name, (counters.get(name) ?? 0) + delta)
}

/** Reset all counters to zero. Does NOT change the enabled flag. */
export function _reset(): void {
  counters.clear()
}

/** Materialise current counter state as a plain object. */
export function _snapshot(): Record<CounterName, number> {
  const out: Record<CounterName, number> = {}
  for (const [k, v] of counters) out[k] = v
  return out
}

/** Enable counter writes and publish the global sink. */
export function _enable(): void {
  enabled = true
  ;(globalThis as unknown as CountGlobal).__pyreon_count__ = _count
}

/** Disable counter writes and remove the global sink. */
export function _disable(): void {
  enabled = false
  delete (globalThis as unknown as CountGlobal).__pyreon_count__
}

/** Whether counter writes are currently recorded. */
export function _isEnabled(): boolean {
  return enabled
}
