// ─── Shared signal registry for cross-Example state ──────────────────
//
// Two `<Example file="..." share="cnt" />` calls on the same page get
// the SAME signal — so user-interactions in one Example reactively
// update the other. This is the signal-native docs DX advantage that
// no MDX-flavored framework can replicate: examples share live state
// without iframe postMessage, without iframe boundaries at all.
//
// Storage is a module-level Map keyed by the user's `share` string.
// First lookup for a key creates a signal with the supplied initial
// value; subsequent lookups return the same instance.
//
// `clearAll()` is exposed so test suites can isolate runs and so
// page-navigation handlers in the app shell can reset state if they
// want signals to be page-scoped instead of session-scoped. Default
// behavior (no reset) lets share keys persist across SPA navigations
// — useful for theme state, locale state, anything intentionally
// app-wide.

import { signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'

const registry = new Map<string, Signal<unknown>>()

/**
 * Get the shared signal for a key. Creates it with `initial` on the
 * first lookup; returns the same instance on subsequent lookups
 * (ignoring the `initial` arg on lookups 2+).
 *
 * Strongly typed: the caller asserts the value type via the generic.
 * If two callers disagree on T at the same key they'll get the same
 * runtime signal but mismatched compile-time types — author error.
 *
 * @internal exported for testing
 */
export function getOrCreateSharedSignal<T>(
  key: string,
  initial: T,
): Signal<T> {
  const existing = registry.get(key)
  if (existing !== undefined) return existing as Signal<T>
  const created = signal<T>(initial)
  registry.set(key, created as Signal<unknown>)
  return created
}

/**
 * Drop all shared signals. Test helpers + page-navigation lifecycle
 * call this to reset state when needed.
 */
export function clearAllSharedSignals(): void {
  registry.clear()
}

/**
 * Number of currently-registered keys. Test introspection only.
 *
 * @internal
 */
export function _sharedSignalCount(): number {
  return registry.size
}

/**
 * Whether a key has been registered yet. Test introspection only.
 *
 * @internal
 */
export function _hasSharedSignal(key: string): boolean {
  return registry.has(key)
}
