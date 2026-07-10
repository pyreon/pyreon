import { _markRecompute } from './batch'
import { _errorHandler } from './effect'
import { _captureCallerLocation, _rdRecordFire, _rdRegister } from './reactive-devtools'
import { getCurrentScope } from './scope'
import { notifySubscribers, runCollect, runVerify, trackSubscriber } from './tracking'

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

// Internal shape of a computed read function — state stored as PLAIN FIELDS on
// the function object (fast in-object properties, exactly like `signal`), with
// the shareable methods on `ComputedProto`. This replaced a per-instance shape
// that carried THREE `Object.defineProperty` accessor getters (`_v`/`_d`/`_d1`)
// — accessor properties force the function into V8 dictionary (slow-properties)
// mode — plus a per-instance `direct` closure and a separate `host` object. A
// structurally-faithful A/B (node --expose-gc, NODE_ENV=production, 100k items)
// measured the accessor+closure shape at ~55% MORE retained heap per computed
// than this plain-field + shared-prototype shape. `read` and `recompute` MUST
// stay per-instance closures — their identity is stored in dependency
// subscriber Sets and passed to `_markRecompute` — so only the shareable
// methods (`direct`, the `_v` getter) move to the prototype.
interface ComputedFn<T> {
  (): T
  /** @internal cached value */
  _value: T
  /** @internal dirty flag — true when a dependency changed since last read */
  _dirty: boolean
  /** @internal disposed flag */
  _disposed: boolean
  /**
   * @internal subscriber set — who depends on THIS computed. Inlined onto the
   * read fn (was a separate `host` object), so `trackSubscriber(read)` works
   * exactly like `signal`. Eliminates one object allocation per computed.
   */
  _s: Set<() => void> | null
  /** @internal single direct-updater inline slot — mirrors `signal._d1` */
  _d1: (() => void) | null
  /** @internal direct-updater Set — allocated on PROMOTION from `_d1` (≥2 subscribers) */
  _d: Set<() => void> | null
  /** Cached value for compiler-emitted direct bindings — recomputes if dirty. */
  _v: T
  dispose(): void
  direct(updater: () => void): () => void
}

/**
 * Shared prototype for every computed — `direct` + the `_v` getter live here
 * (one allocation total) instead of a per-instance closure + a per-instance
 * `Object.defineProperty`. Mirrors `signal.ts`'s `SignalProto`, including the
 * `setPrototypeOf(_, Function.prototype)` step so computeds keep
 * `instanceof Function === true` (consumers across the ecosystem discriminate
 * reactive values via `x instanceof Function`). `read` + `recompute` + `dispose`
 * stay per-instance closures (identity / per-variant cleanup semantics).
 *
 * The two-tier direct-updater storage (`_d1` inline slot → `_d` Set on 2nd
 * subscribe) is identical between the lazy and equals variants, so it is shared
 * here verbatim. The `_v` getter is also identical (recompute-if-dirty, return
 * value), so both variants share it.
 */
const ComputedProto = {
  direct(this: ComputedFn<unknown>, updater: () => void): () => void {
    // Tier 1: empty → inline-slot the single subscriber (zero Set allocation).
    if (this._d1 === null && this._d === null) {
      this._d1 = updater
      const self = this
      return () => {
        // Promotion-aware disposer (mirrors signal's pattern): a 2nd subscriber
        // may have migrated `_d1` into `_d` before this dispose fires.
        if (self._d1 === updater) self._d1 = null
        else if (self._d) self._d.delete(updater)
      }
    }
    // Tier 2: promote inline slot → Set, then add the new entry.
    if (this._d === null) {
      this._d = new Set()
      this._d.add(this._d1 as () => void)
      this._d1 = null
    }
    const set = this._d
    set.add(updater)
    return () => {
      set.delete(updater)
    }
  },
  get _v() {
    // Getters can't declare a `this` param (TS2784); narrow inline.
    const self = this as unknown as ComputedFn<unknown>
    if (self._dirty) self() // ensure value is fresh
    return self._value
  },
}
Object.setPrototypeOf(ComputedProto, Function.prototype)

/** Remove a computed from all dependency subscriber sets (local deps array). */
function cleanupLocalDeps(deps: Set<() => void>[], fn: () => void): void {
  for (let i = 0; i < deps.length; i++) (deps[i] as Set<() => void>).delete(fn)
  deps.length = 0
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
 * Default computed — lazy evaluation with verified dep reuse.
 *
 * On notification: just marks dirty and propagates (no dep work).
 * On read (dirty): first eval COLLECTS deps; re-evals VERIFY the previous
 * dep list positionally (zero Set operations in the steady state — see
 * tracking.ts `runVerify`), unsubscribing stale branches / recording new
 * reads only on divergence.
 *
 * The `if (dirty) return` early exit in recompute prevents double-propagation
 * in diamond patterns (a→b,c→d: b notifies d, c tries to notify d again —
 * skipped because d is already dirty).
 */
function computedLazy<T>(
  fn: () => T,
  injectedLoc?: { file: string; line: number; col: number },
): Computed<T> {
  // `tracked` and `deps` are touched only by the per-instance `read` + `dispose`
  // closures (never by a prototype method), so they stay closure-captured.
  let tracked = false
  const deps: Set<() => void>[] = []
  // Forward-declared so the `read` body can reference it; assigned below. `read`
  // is never invoked until after `recompute` is wired (signal change / first
  // read both happen post-setup).
  let recompute: () => void

  const read = (() => {
    trackSubscriber(read as unknown as { _s: Set<() => void> | null })
    if (read._dirty) {
      if (process.env.NODE_ENV !== 'production') {
        _countSink.__pyreon_count__?.('reactivity.computedRecompute')
        _rdRecordFire(read)
      }
      try {
        if (tracked) {
          // Deps already established from a previous run — VERIFY them
          // positionally (zero Set ops for the steady-state re-eval; see
          // tracking.ts). A divergence (branch flip / new dep) unsubscribes
          // the stale tail and records the new shape — the old skip-mode
          // path left stale deps subscribed forever AND never recorded
          // newly-read sources (so dispose() couldn't remove them); verify
          // mode keeps the recorded dep list exact on every re-eval.
          read._value = runVerify(recompute, deps, fn)
        } else {
          read._value = runCollect(recompute, deps, fn)
          tracked = true
        }
      } catch (err) {
        _errorHandler(err)
      }
      read._dirty = false
    }
    return read._value
  }) as unknown as ComputedFn<T>

  // Plain-field state (fast in-object properties) + shared prototype — see the
  // `ComputedFn` / `ComputedProto` comments above for the why.
  Object.setPrototypeOf(read, ComputedProto)
  read._value = undefined as T
  read._dirty = true
  read._disposed = false
  read._s = null
  read._d1 = null
  read._d = null

  recompute = () => {
    if (read._disposed || read._dirty) return
    read._dirty = true
    if (read._s) notifySubscribers(read._s)
    if (read._d1) read._d1()
    else if (read._d) for (const f of read._d) f()
  }
  _markRecompute(recompute)

  read.dispose = () => {
    read._disposed = true
    cleanupLocalDeps(deps, recompute)
  }

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=2: skip computedLazy/computedWithEquals + computed, capture user's call site.
    // `read` is now the subscriber host (carries `_s`), so it's passed as the
    // host arg (was the separate `host` object).
    _rdRegister(
      read,
      'derived',
      read as unknown as { _s: Set<() => void> | null },
      recompute,
      undefined,
      injectedLoc ?? _captureCallerLocation(2),
    )

  getCurrentScope()?.add({ dispose: read.dispose })
  return read as unknown as Computed<T>
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
  // `initialized`, `tracked`, and `deps` are touched only by per-instance closures.
  let initialized = false
  let tracked = false
  const deps: Set<() => void>[] = []
  let recompute: () => void

  const read = (() => {
    trackSubscriber(read as unknown as { _s: Set<() => void> | null })
    if (read._dirty) {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('reactivity.computedRecompute')
      try {
        // Collect-only: in the equals variant, `_dirty` is true ONLY before
        // the first successful eval — recompute (the sole re-evaluator)
        // runs eagerly and clears it before any read can observe it. A
        // throwing first read retries here with `tracked` still false, so
        // collect is exact; verified re-evals live in `recompute` below.
        read._value = runCollect(recompute, deps, fn)
        tracked = true
      } catch (err) {
        _errorHandler(err)
      }
      read._dirty = false
      initialized = true
    }
    return read._value
  }) as unknown as ComputedFn<T>

  Object.setPrototypeOf(read, ComputedProto)
  read._value = undefined as T
  read._dirty = true
  read._disposed = false
  read._s = null
  read._d1 = null
  read._d = null

  recompute = () => {
    // Defensive: `recompute` is the source-subscriber callback, unsubscribed
    // on dispose, so a disposed computed is never re-driven by a source — this
    // guard only fires if a recompute is already queued when dispose lands.
    /* v8 ignore next */
    if (read._disposed) return
    if (process.env.NODE_ENV !== 'production') {
      _countSink.__pyreon_count__?.('reactivity.computedRecompute')
      _rdRecordFire(read)
    }
    try {
      // Same collect-then-verify shape as the read path above.
      let next: T
      if (tracked) {
        next = runVerify(recompute, deps, fn)
      } else {
        next = runCollect(recompute, deps, fn)
        tracked = true
      }
      if (initialized && equals(read._value, next)) return
      read._value = next
      read._dirty = false
      initialized = true
    } catch (err) {
      _errorHandler(err)
      return
    }
    if (read._s) notifySubscribers(read._s)
    if (read._d1) read._d1()
    else if (read._d) for (const f of read._d) f()
  }
  _markRecompute(recompute)

  read.dispose = () => {
    read._disposed = true
    cleanupLocalDeps(deps, recompute)
  }

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=2: skip computedLazy/computedWithEquals + computed, capture user's call site.
    _rdRegister(
      read,
      'derived',
      read as unknown as { _s: Set<() => void> | null },
      recompute,
      undefined,
      injectedLoc ?? _captureCallerLocation(2),
    )

  getCurrentScope()?.add({ dispose: read.dispose })
  return read as unknown as Computed<T>
}
