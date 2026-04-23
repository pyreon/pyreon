import { _errorHandler } from './effect'
import { getCurrentScope } from './scope'
import {
  cleanupEffect,
  notifySubscribers,
  setDepsCollector,
  setSkipDepsCollection,
  trackSubscriber,
  withTracking,
} from './tracking'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
interface ViteMeta {
  readonly env?: { readonly DEV?: boolean }
}
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export interface Computed<T> {
  (): T
  /** Remove this computed from all its reactive dependencies. */
  dispose(): void
  /** Cached value for compiler-emitted direct bindings (_bindText, _bindDirect). */
  _v: T
  /** Register a direct updater — used by compiler-emitted _bindText/_bindDirect. */
  direct(updater: () => void): () => void
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
  let directFns: ((() => void) | null)[] | null = null

  const recompute = () => {
    if (disposed || dirty) return
    dirty = true
    if (host._s) notifySubscribers(host._s)
    if (directFns) for (const f of directFns) f?.()
  }

  const read = (): T => {
    trackSubscriber(host)
    if (dirty) {
      if ((import.meta as ViteMeta).env?.DEV === true)
        _countSink.__pyreon_count__?.('reactivity.computedRecompute')
      try {
        if (tracked) {
          // Deps already established from first run — skip adding to
          // subscriber Sets again (they already contain recompute).
          // Still need withTracking so activeEffect is set correctly
          // for any NEW signals read on this evaluation.
          setSkipDepsCollection(true)
          value = withTracking(recompute, fn)
          setSkipDepsCollection(false)
        } else {
          value = trackWithLocalDeps(deps, recompute, fn)
          tracked = true
        }
      } catch (err) {
        _errorHandler(err)
      }
      dirty = false
    }
    return value as T
  }

  read.dispose = () => {
    disposed = true
    cleanupLocalDeps(deps, recompute)
  }

  Object.defineProperty(read, '_v', {
    get: () => {
      if (dirty) read() // ensure value is fresh
      return value
    },
    enumerable: false,
  })

  read.direct = (updater: () => void): (() => void) => {
    if (!directFns) directFns = []
    const arr = directFns
    const idx = arr.length
    arr.push(updater)
    return () => {
      arr[idx] = null
    }
  }

  getCurrentScope()?.add({ dispose: read.dispose })
  return read as Computed<T>
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
  let directFns: ((() => void) | null)[] | null = null

  const recompute = () => {
    if (disposed) return
    if ((import.meta as ViteMeta).env?.DEV === true)
      _countSink.__pyreon_count__?.('reactivity.computedRecompute')
    cleanupLocalDeps(deps, recompute)
    try {
      const next = trackWithLocalDeps(deps, recompute, fn)
      if (initialized && equals(value as T, next)) return
      value = next
      dirty = false
      initialized = true
    } catch (err) {
      _errorHandler(err)
      return
    }
    if (host._s) notifySubscribers(host._s)
    if (directFns) for (const f of directFns) f?.()
  }

  const read = (): T => {
    trackSubscriber(host)
    if (dirty) {
      if ((import.meta as ViteMeta).env?.DEV === true)
        _countSink.__pyreon_count__?.('reactivity.computedRecompute')
      cleanupLocalDeps(deps, recompute)
      try {
        value = trackWithLocalDeps(deps, recompute, fn)
      } catch (err) {
        _errorHandler(err)
      }
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

  Object.defineProperty(read, '_v', {
    get: () => {
      if (dirty) read()
      return value
    },
    enumerable: false,
  })

  read.direct = (updater: () => void): (() => void) => {
    if (!directFns) directFns = []
    const arr = directFns
    const idx = arr.length
    arr.push(updater)
    return () => {
      arr[idx] = null
    }
  }

  getCurrentScope()?.add({ dispose: read.dispose })
  return read as Computed<T>
}
