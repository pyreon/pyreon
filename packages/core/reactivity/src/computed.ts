import { _markRecompute } from './batch'
import { _errorHandler } from './effect'
import { _captureCallerLocation, _rdRecordFire, _rdRegister } from './reactive-devtools'
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
  /**
   * @internal — source location injected by `@pyreon/vite-plugin` at build
   * time. When present, the runtime skips the `new Error().stack` capture
   * in `_rdRegister` — saves ~2.2µs per computed creation when devtools is
   * active. Plain user code should NOT set this; the field is opaque
   * (no public type) so it's not part of the public API surface.
   *
   * Shape: `{ file: string; line: number; col: number }` matching
   * `@pyreon/reactivity`'s `SourceLocation`.
   */
  __sourceLocation?: { file: string; line: number; col: number }
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
  // Dev warning for async computed callbacks.
  // `computed(async () => …)` returns `Computed<Promise<T>>`, which silently
  // breaks every consumer that expects `Computed<T>`. There's no scenario
  // where async makes sense here — the recompute fires synchronously and
  // tracks signals only in the synchronous prefix. For async-derived
  // state, use `createResource` or a `signal<T>` updated from an effect.
  if (process.env.NODE_ENV !== 'production') {
    if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
      // oxlint-disable-next-line no-console
      console.warn(
        '[pyreon] computed() received an async function. The result type becomes `Computed<Promise<T>>`, and signal reads after the first `await` are NOT tracked. ' +
          'Use `createResource` for async-derived state, or compute synchronously over a signal that holds the awaited value.',
      )
    }
  }
  // Prefer build-time-injected location (zero runtime cost) over the
  // ~2.2µs stack-capture fallback. @pyreon/vite-plugin's `injectSignalNames`
  // rewrites `computed(() => …)` to `computed(() => …, { __sourceLocation: {…} })`
  // at transform time so most dev-mode computeds never pay the stack-capture cost.
  const loc = options?.__sourceLocation
  return options?.equals
    ? computedWithEquals(fn, options.equals, loc)
    : computedLazy(fn, loc)
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
function computedLazy<T>(
  fn: () => T,
  injectedLoc?: { file: string; line: number; col: number },
): Computed<T> {
  let value: T
  let dirty = true
  let disposed = false
  let tracked = false
  const deps: Set<() => void>[] = []
  const host: { _s: Set<() => void> | null } = { _s: null }
  // Set, not a never-compacted flat array. The array form's disposal
  // only nulled the slot (`arr[idx] = null`) and never shrank, so a
  // long-lived computed (a derived theme/locale/auth value, or one read
  // inside churning `<For>` rows) bound by mount/unmount churn grew one
  // permanent dead slot per ever-registered binding — app-lifetime
  // memory growth AND `recompute` iterating O(total-ever) instead of
  // O(live). Identical bug class already fixed for `signal._d`
  // (signal.ts `_directFn`); `computed` was left on the broken pattern.
  //
  // Two-tier storage (mirrors `signal()._d` after PR #1177): `directFn1`
  // is the inline slot for the FIRST direct subscriber (zero Set
  // allocation, zero iterator overhead); promotion to `directFns: Set`
  // happens on 2nd subscribe. Smaller win than for signal in practice
  // — computeds rarely have many direct subscribers — but applied for
  // symmetry and to verify the inline-slot pattern generalizes cleanly.
  let directFn1: (() => void) | null = null
  let directFns: Set<() => void> | null = null

  const recompute = () => {
    if (disposed || dirty) return
    dirty = true
    if (host._s) notifySubscribers(host._s)
    if (directFn1) directFn1()
    else if (directFns) for (const f of directFns) f()
  }
  _markRecompute(recompute)

  const read = (): T => {
    trackSubscriber(host)
    if (dirty) {
      if (process.env.NODE_ENV !== 'production') {
        _countSink.__pyreon_count__?.('reactivity.computedRecompute')
        _rdRecordFire(read)
      }
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

  // @internal — mirrors `signal._d` / `signal._d1` (PR #1177 two-tier).
  // Single subscriber lives in `_d1` inline slot; promotion to `_d` Set
  // happens on 2nd subscribe. Both getters exposed so tests + future
  // tooling can inspect storage tier directly.
  Object.defineProperty(read, '_d', {
    get: () => directFns,
    enumerable: false,
  })
  Object.defineProperty(read, '_d1', {
    get: () => directFn1,
    enumerable: false,
  })

  read.direct = (updater: () => void): (() => void) => {
    // Tier 1: empty → inline-slot the single subscriber.
    if (directFn1 === null && directFns === null) {
      directFn1 = updater
      return () => {
        // Promotion-aware disposer (mirrors signal's pattern). If a 2nd
        // subscriber arrived before this dispose fires, `directFn1` was
        // migrated into `directFns` and cleared — check both tiers.
        if (directFn1 === updater) directFn1 = null
        else if (directFns) directFns.delete(updater)
      }
    }
    // Tier 2: promote inline slot → Set, then add the new entry.
    if (directFns === null) {
      directFns = new Set()
      directFns.add(directFn1!)
      directFn1 = null
    }
    const set = directFns
    set.add(updater)
    return () => {
      set.delete(updater)
    }
  }

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=2: skip computedLazy/computedWithEquals + computed, capture user's call site.
    _rdRegister(
      read,
      'derived',
      host,
      recompute,
      undefined,
      injectedLoc ?? _captureCallerLocation(2),
    )

  getCurrentScope()?.add({ dispose: read.dispose })
  return read as Computed<T>
}

/**
 * Computed with custom equality — eager evaluation on notification.
 *
 * Re-evaluates immediately when deps change and only notifies downstream
 * if `equals(prev, next)` returns false.
 */
function computedWithEquals<T>(
  fn: () => T,
  equals: (prev: T, next: T) => boolean,
  injectedLoc?: { file: string; line: number; col: number },
): Computed<T> {
  let value: T
  let dirty = true
  let initialized = false
  let disposed = false
  const deps: Set<() => void>[] = []
  const host: { _s: Set<() => void> | null } = { _s: null }
  // Set, not a never-compacted flat array. The array form's disposal
  // only nulled the slot (`arr[idx] = null`) and never shrank, so a
  // long-lived computed (a derived theme/locale/auth value, or one read
  // inside churning `<For>` rows) bound by mount/unmount churn grew one
  // permanent dead slot per ever-registered binding — app-lifetime
  // memory growth AND `recompute` iterating O(total-ever) instead of
  // O(live). Identical bug class already fixed for `signal._d`
  // (signal.ts `_directFn`); `computed` was left on the broken pattern.
  //
  // Two-tier storage (mirrors `signal()._d` after PR #1177): `directFn1`
  // is the inline slot for the FIRST direct subscriber; promotion to
  // `directFns: Set` happens on 2nd subscribe. See computedLazy above
  // for the same pattern.
  let directFn1: (() => void) | null = null
  let directFns: Set<() => void> | null = null

  const recompute = () => {
    if (disposed) return
    if (process.env.NODE_ENV !== 'production') {
      _countSink.__pyreon_count__?.('reactivity.computedRecompute')
      _rdRecordFire(read)
    }
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
    if (directFn1) directFn1()
    else if (directFns) for (const f of directFns) f()
  }
  _markRecompute(recompute)

  const read = (): T => {
    trackSubscriber(host)
    if (dirty) {
      if (process.env.NODE_ENV !== 'production')
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

  // @internal — mirrors `signal._d` / `signal._d1` (PR #1177 two-tier).
  // Single subscriber lives in `_d1` inline slot; promotion to `_d` Set
  // happens on 2nd subscribe. Both getters exposed so tests + future
  // tooling can inspect storage tier directly.
  Object.defineProperty(read, '_d', {
    get: () => directFns,
    enumerable: false,
  })
  Object.defineProperty(read, '_d1', {
    get: () => directFn1,
    enumerable: false,
  })

  read.direct = (updater: () => void): (() => void) => {
    // Tier 1: empty → inline-slot the single subscriber.
    if (directFn1 === null && directFns === null) {
      directFn1 = updater
      return () => {
        // Promotion-aware disposer (mirrors signal's pattern). If a 2nd
        // subscriber arrived before this dispose fires, `directFn1` was
        // migrated into `directFns` and cleared — check both tiers.
        if (directFn1 === updater) directFn1 = null
        else if (directFns) directFns.delete(updater)
      }
    }
    // Tier 2: promote inline slot → Set, then add the new entry.
    if (directFns === null) {
      directFns = new Set()
      directFns.add(directFn1!)
      directFn1 = null
    }
    const set = directFns
    set.add(updater)
    return () => {
      set.delete(updater)
    }
  }

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=2: skip computedLazy/computedWithEquals + computed, capture user's call site.
    _rdRegister(
      read,
      'derived',
      host,
      recompute,
      undefined,
      injectedLoc ?? _captureCallerLocation(2),
    )

  getCurrentScope()?.add({ dispose: read.dispose })
  return read as Computed<T>
}
