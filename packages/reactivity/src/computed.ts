import { trackSubscriber, notifySubscribers, withTracking, cleanupEffect } from "./tracking"
import { getCurrentScope } from "./scope"

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

export function computed<T>(fn: () => T, options?: ComputedOptions<T>): Computed<T> {
  let value: T
  let dirty = true
  let initialized = false
  let disposed = false
  const customEquals = options?.equals

  // SubscriberHost — _s is lazily allocated by trackSubscriber
  const host: { _s: Set<() => void> | null } = { _s: null }

  const recompute = () => {
    if (disposed) return
    // Remove from all current deps before re-evaluating (dynamic deps support)
    cleanupEffect(recompute)
    if (customEquals) {
      // Eager evaluation: only notify downstream if the value actually changed
      const next = withTracking(recompute, fn)
      if (initialized && customEquals(value as T, next)) return
      value = next
      dirty = false
      initialized = true
      if (host._s) notifySubscribers(host._s)
    } else {
      dirty = true
      if (host._s) notifySubscribers(host._s)
    }
  }

  const read = (): T => {
    trackSubscriber(host)
    if (dirty) {
      value = withTracking(recompute, fn)
      dirty = false
      initialized = true
    }
    return value as T
  }

  read.dispose = () => {
    disposed = true
    cleanupEffect(recompute)
  }

  // Auto-register with the active EffectScope (if any)
  getCurrentScope()?.add({ dispose: read.dispose })

  return read
}
