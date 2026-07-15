import {
  _markRecompute,
  closeInlineBatch,
  enqueueEagerRefresh,
  enqueuePendingNotification,
  isBatching,
  openInlineBatch,
  propagateLazyDirty,
} from './batch'
import { _errorHandler } from './effect'
import { _captureCallerLocation, _rdRecordFire, _rdRegister } from './reactive-devtools'
import { getCurrentScope } from './scope'
import { runCollect, runVerify, trackSubscriber } from './tracking'

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

/** The dispatch half of {@link propagateEagerChange} — factored out so its
 * subscriber/direct branch sides exist ONCE, shared by both window arms. */
function dispatchEagerChange(read: ComputedFn<unknown>): void {
  if (read._s) propagateLazyDirty(read._s)
  if (read._d1) enqueuePendingNotification(read._d1)
  else if (read._d) for (const f of read._d) enqueuePendingNotification(f)
}

/**
 * Propagate an `{ equals }` computed's REAL value change: dirty-cascade its
 * subscribers + defer its direct (`_bindText`/`_bindDirect`) updaters to the
 * batch drain (glitch-freedom — same rationale as the lazy variant).
 *
 * `enqueuePendingNotification` requires an open batch window — a tier-1 drain
 * visit / mid-batch pull always has one; a stranded-dirty read outside any
 * window (a prior drain aborted by a throwing raw listener) opens its own.
 * Module-level (not a per-instance closure) so eager computeds allocate
 * nothing extra.
 */
function propagateEagerChange(read: ComputedFn<unknown>): void {
  if (isBatching()) {
    dispatchEagerChange(read)
  } else {
    openInlineBatch()
    try {
      dispatchEagerChange(read)
    } finally {
      closeInlineBatch()
    }
  }
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
    // DEFER direct-subscriber dispatch to the batch DRAIN — do NOT fire inline.
    //
    // A lazy recompute runs INLINE during the write's notify phase (see
    // batch.ts `propagateLazyDirty`), so `read._v` is TORN at this point in a
    // multi-write `batch(() => { a.set(); b.set() })` — `a` is written but `b`
    // is not yet. Firing the `_d1`/`_d` DIRECT subscriber (the compiled
    // `{someComputed()}` `_bindText`/`_bindDirect` shape) inline would read the
    // half-updated value AND re-fire on the next write (#2284 regression:
    // `[12, 30]` instead of one settled `[30]`; a torn read that THROWS would
    // even dispatch a phantom production error through `_errorHandler`).
    // Enqueuing into the effect tier makes each direct subscriber fire ONCE, in
    // the drain, after all writes + tier-1 eager recomputes have settled — the
    // exact glitch-free deferral a SIGNAL's `_d1` already gets under batch (see
    // `_set`). Idempotent: a re-entered recompute sees `_dirty === true` above
    // and early-returns, so the enqueue happens once per batch even before the
    // effect-tier's own `_eq` dedup.
    if (read._d1) enqueuePendingNotification(read._d1)
    else if (read._d) for (const f of read._d) enqueuePendingNotification(f)
    // Dirty-propagation cascade — iterative (explicit stack) so a deep chain
    // can't overflow. See propagateLazyDirty.
    if (read._s) propagateLazyDirty(read._s)
  }
  // Recompute marker → the batch router + `propagateLazyDirty` run this
  // recompute inline (dirty-mark-only, idempotent via the `_dirty` guard
  // above) instead of routing it through the queues. Pure-computed cascades
  // resolve during the notify phase.
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
 * Computed with custom equality — dirty-marked on notification, GUARANTEED to
 * re-evaluate in the tier-1 drain (before any effect), and only notifies
 * downstream if `equals(prev, next)` returns false.
 *
 * ── Topo-staleness fix (2026-07, pre-existing since 0.45.0) ──
 * The old design re-evaluated ONLY inside its queued `recompute` and never set
 * `_dirty` on notification. Tier-1 drains in SUBSCRIPTION order, not
 * topological order — so `outer = computed(() => s() + inner(), { equals })`
 * that subscribed to `s` BEFORE `inner` drained first, pull-read `inner()`
 * (enqueued-but-not-dirty → STALE cache), and `inner`'s later re-notify of
 * `outer` was dropped by the tier-1 Set-dedup (already visited) → `outer()`
 * was PERMANENTLY stale until the next write.
 *
 * New shape (the same architecture as the lazy variant, plus the equals
 * notify-gate + guaranteed tier-1 evaluation):
 *   - `recompute` (the source-subscribed callback) is an inline dirty-marking
 *     NOTIFY — it marks `_dirty` + enqueues the READ into the tier-1 queue
 *     (`enqueueEagerRefresh`). Marked `_markRecompute` so both
 *     `propagateLazyDirty` and the enqueue router run it INLINE during the
 *     write's notify phase — dirtiness is established BEFORE any drain visit.
 *   - The READ's dirty branch is the single evaluator ("refresh"): verify-eval
 *     + equals gate + propagate-on-change. A drain visit whose value was
 *     already pulled fresh by an earlier visitor skips via the `_dirty` guard
 *     (zero double evaluation); a pull-read of a dirty dep evaluates it
 *     in place, so subscription order no longer matters.
 *   - Direct (`_d1`/`_d`) subscribers are DEFERRED to the drain
 *     (`enqueuePendingNotification`) — same glitch-freedom rationale as the
 *     lazy variant's fix (a pull-refresh can run mid-batch on torn values;
 *     the deferred updater fires once, at the drain, reading settled `_v`).
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
      if (process.env.NODE_ENV !== 'production') {
        _countSink.__pyreon_count__?.('reactivity.computedRecompute')
        _rdRecordFire(read)
      }
      const wasInitialized = initialized
      let next: T
      try {
        // Collect-then-verify, same as the lazy variant: first eval COLLECTS
        // deps; re-evals VERIFY the previous dep list positionally.
        if (tracked) {
          next = runVerify(recompute, deps, fn)
        } else {
          next = runCollect(recompute, deps, fn)
          tracked = true
        }
      } catch (err) {
        _errorHandler(err)
        read._dirty = false
        initialized = true
        return read._value // keep the previous value on a throwing eval
      }
      read._dirty = false
      initialized = true
      // equals gate: keep the OLD value (stable reference — the memo
      // semantic) and notify nobody when structurally equal.
      if (!(wasInitialized && equals(read._value, next))) {
        read._value = next
        // Propagate the change (never on the FIRST eval — the actively-
        // tracking reader that triggered it is already subscribed and would
        // spuriously re-run).
        if (wasInitialized) propagateEagerChange(read)
      }
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
    // Inline dirty-marking NOTIFY (runs during the write's notify phase — see
    // the function-level comment). Idempotent via the `_dirty` guard, exactly
    // like the lazy variant. `enqueueEagerRefresh` books the guaranteed tier-1
    // evaluation; the unbatched-notify arm (a raw caller outside any write
    // window) opens its own window so the refresh still runs synchronously.
    if (read._disposed || read._dirty) return
    read._dirty = true
    if (isBatching()) {
      enqueueEagerRefresh(read as unknown as () => void)
    } else {
      // Raw external dispatch outside any write window (every in-tree notify
      // runs under one — signal writes open it; the drain holds depth 1):
      // open our own so the refresh still runs synchronously before return.
      openInlineBatch()
      try {
        enqueueEagerRefresh(read as unknown as () => void)
      } finally {
        closeInlineBatch()
      }
    }
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
