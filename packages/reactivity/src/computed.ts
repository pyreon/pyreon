import { getCurrentScope } from "./scope"
import {
  cleanupEffect,
  notifySubscribers,
  setDepsCollector,
  setSkipDepsCollection,
  trackSubscriber,
  withTracking,
} from "./tracking"

export interface Computed<T> {
  (): T
  /** Remove this computed from all its reactive dependencies. */
  dispose(): void
}

export interface ComputedOptions<T> {
  /**
   * Custom equality function. When provided, the computed eagerly re-evaluates
   * on dependency change and only notifies downstream if `equals(prev, next)`
   * returns false. Useful for derived objects/arrays to skip spurious updates.
   *
   * @example
   * const sorted = computed(() => items().slice().sort(), {
   *   equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
   * })
   */
  equals?: (prev: T, next: T) => boolean
}

/** Remove a computed from all dependency subscriber sets (local deps array). */
function cleanupLocalDeps(deps: Set<() => void>[], fn: () => void): void {
  for (let i = 0; i < deps.length; i++) (deps[i] as Set<() => void>).delete(fn)
  deps.length = 0
}

/** Re-track dependencies using the local deps array collector. */
function trackWithLocalDeps<T>(deps: Set<() => void>[], effect: () => void, fn: () => T): T {
  setDepsCollector(deps)
  const result = withTracking(effect, fn)
  setDepsCollector(null)
  return result
}

export function computed<T>(fn: () => T, options?: ComputedOptions<T>): Computed<T> {
  return options?.equals ? computedWithEquals(fn, options.equals) : computedLazy(fn)
}

/**
 * Default computed — lazy evaluation with deferred cleanup.
 *
 * On notification: just marks dirty and propagates (no cleanup/re-track).
 * On read: cleans up old deps, re-evaluates, re-tracks.
 *
 * The `if (dirty) return` early exit in recompute prevents double-propagation
 * in diamond patterns (a→b,c→d: b notifies d, c tries to notify d again —
 * skipped because d is already dirty).
 */
function computedLazy<T>(fn: () => T): Computed<T> {
  let value: T
  let dirty = true
  let disposed = false
  let tracked = false
  const deps: Set<() => void>[] = []
  const host: { _s: Set<() => void> | null } = { _s: null }

  const recompute = () => {
    if (disposed || dirty) return
    dirty = true
    if (host._s) notifySubscribers(host._s)
  }

  const read = (): T => {
    trackSubscriber(host)
    if (dirty) {
      if (tracked) {
        // Static deps fast path: already subscribed to our deps from first run.
        // Set.add in trackSubscriber is a no-op for existing members.
        // Skip cleanup (Set.delete) and collection (array.push) entirely.
        setSkipDepsCollection(true)
        value = withTracking(recompute, fn)
        setSkipDepsCollection(false)
      } else {
        // First evaluation — full tracking to record deps for dispose
        value = trackWithLocalDeps(deps, recompute, fn)
        tracked = true
      }
      dirty = false
    }
    return value as T
  }

  read.dispose = () => {
    disposed = true
    cleanupLocalDeps(deps, recompute)
  }

  getCurrentScope()?.add({ dispose: read.dispose })
  return read
}

/**
 * Computed with custom equality — eager evaluation on notification.
 *
 * Re-evaluates immediately when deps change and only notifies downstream
 * if `equals(prev, next)` returns false.
 */
function computedWithEquals<T>(fn: () => T, equals: (prev: T, next: T) => boolean): Computed<T> {
  let value: T
  let dirty = true
  let initialized = false
  let disposed = false
  const deps: Set<() => void>[] = []
  const host: { _s: Set<() => void> | null } = { _s: null }

  const recompute = () => {
    if (disposed) return
    cleanupLocalDeps(deps, recompute)
    const next = trackWithLocalDeps(deps, recompute, fn)
    if (initialized && equals(value as T, next)) return
    value = next
    dirty = false
    initialized = true
    if (host._s) notifySubscribers(host._s)
  }

  const read = (): T => {
    trackSubscriber(host)
    if (dirty) {
      cleanupLocalDeps(deps, recompute)
      value = trackWithLocalDeps(deps, recompute, fn)
      dirty = false
      initialized = true
    }
    return value as T
  }

  read.dispose = () => {
    disposed = true
    cleanupLocalDeps(deps, recompute)
    cleanupEffect(recompute)
  }

  getCurrentScope()?.add({ dispose: read.dispose })
  return read
}
