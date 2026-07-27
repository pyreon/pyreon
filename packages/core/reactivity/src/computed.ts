import {
  _markLazyAndPropagate,
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
   * @internal Source location injected by `@pyreon/vite-plugin` at build time.
   * When present the runtime skips the `new Error().stack` capture in
   * `_rdRegister` — saves ~2.2us per computed creation when devtools is active.
   * User code should NOT set this.
   */
  __sourceLocation?: { file: string; line: number; col: number }
}

// Internal shape of a computed read function — state stored as PLAIN FIELDS on
// the function object (fast in-object properties, exactly like `signal`), with
// shareable methods on `ComputedProto`. The previous shape carried THREE
// `Object.defineProperty` accessors, which force the function into V8 dictionary
// mode; an A/B measured that at ~55% MORE retained heap per computed. `read` and
// `recompute` MUST stay per-instance closures — their identity is stored in
// dependency subscriber Sets and passed to `_markRecompute`.
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
 * Shared prototype for every computed — `direct` + the `_v` getter live here (one
 * allocation total) instead of per-instance closures. Mirrors `SignalProto`,
 * including the `setPrototypeOf(_, Function.prototype)` step so computeds keep
 * `instanceof Function === true` (consumers across the ecosystem discriminate
 * reactive values that way). `read`/`recompute`/`dispose` stay per-instance
 * closures for identity and per-variant cleanup semantics.
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
 * subscribers + defer its direct updaters to the batch drain (glitch-freedom —
 * same rationale as the lazy variant).
 *
 * `enqueuePendingNotification` requires an open batch window; a stranded-dirty
 * read outside any window (a prior drain aborted by a throwing raw listener)
 * opens its own. Module-level so eager computeds allocate nothing extra.
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
  // `computed(async () => …)` returns `Computed<Promise<T>>`, silently breaking
  // every consumer expecting `Computed<T>`: the recompute fires synchronously and
  // only tracks signals in the synchronous prefix.
  if (process.env.NODE_ENV !== 'production') {
    if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
      // oxlint-disable-next-line no-console
      console.warn(
        '[pyreon] computed() received an async function. The result type becomes `Computed<Promise<T>>`, and signal reads after the first `await` are NOT tracked. ' +
          'Use `createResource` for async-derived state, or compute synchronously over a signal that holds the awaited value.',
      )
    }
  }
  // Prefer the build-time-injected location (zero runtime cost) over the ~2.2us
  // stack-capture fallback — @pyreon/vite-plugin injects it at transform time.
  const loc = options?.__sourceLocation
  return options?.equals
    ? computedWithEquals(fn, options.equals, loc)
    : computedLazy(fn, loc)
}

/**
 * Default computed — lazy evaluation with verified dep reuse.
 *
 * On notification: marks dirty and propagates, no dep work. On a dirty read: the
 * first eval COLLECTS deps, re-evals VERIFY the previous dep list positionally
 * (zero Set ops in the steady state — see tracking.ts `runVerify`).
 *
 * The `if (dirty) return` early exit in recompute prevents double-propagation in
 * diamonds (a->b,c->d: b notifies d, c's attempt is skipped as already dirty).
 */
function computedLazy<T>(
  fn: () => T,
  injectedLoc?: { file: string; line: number; col: number },
): Computed<T> {
  let tracked = false
  const deps: Set<() => void>[] = []
  // `tracked`/`deps` are touched only by the per-instance `read`/`dispose`
  // closures, so they stay closure-captured. `recompute` is forward-declared for
  // the `read` body; `read` is never invoked before it is wired.
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
          // Deps already established — VERIFY them positionally (zero Set ops in
          // the steady state). A divergence unsubscribes the stale tail and
          // records the new shape, keeping the dep list exact on every re-eval.
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
    // Delegates to the CANONICAL lazy notify body in batch.ts, which marks dirty
    // (idempotent), DEFERS direct subscribers to the batch DRAIN, and cascades
    // into subscribers. The deferral is glitch-freedom: a lazy recompute runs
    // INLINE during the write's notify phase, so `read._v` is TORN mid-multi-
    // write-batch; the deferred updater fires once, at the drain, on the settled
    // value.
    //
    // This closure exists ONLY for its per-instance subscriber-set IDENTITY —
    // dispatch sites holding the `_c` back-ref call the helper directly.
    _markLazyAndPropagate(read)
  }
  // Recompute marker → the batch router and `propagateLazyDirty` run this inline
  // (dirty-mark-only, idempotent) instead of routing it through the queues, so
  // pure-computed cascades resolve during the notify phase. The second arg stamps
  // `recompute._c = read` so the cascade's fused single-subscriber walk can
  // dirty-mark these fields DIRECTLY — that walk inlines `_markLazyAndPropagate`,
  // so keep the two in lock-step.
  _markRecompute(recompute, read)

  read.dispose = () => {
    read._disposed = true
    cleanupLocalDeps(deps, recompute)
  }

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=2: skip this fn + `computed`, capture the user's call site.
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
 * downstream when `equals(prev, next)` returns false.
 *
 * Same architecture as the lazy variant plus the equals gate:
 *   - `recompute` (the source-subscribed callback) is an inline dirty-marking
 *     NOTIFY that also enqueues the READ into tier-1 (`enqueueEagerRefresh`),
 *     so dirtiness is established BEFORE any drain visit. This is what fixes
 *     topo-staleness: tier-1 drains in SUBSCRIPTION order, not topological
 *     order, so a visitor that pull-reads a dep must find it dirty-marked or it
 *     silently returns a stale cache.
 *   - The READ's dirty branch is the single evaluator (verify-eval + equals gate
 *     + propagate-on-change). A drain visit whose value was already pulled fresh
 *     skips via the `_dirty` guard — zero double evaluation.
 *   - Direct (`_d1`/`_d`) subscribers are DEFERRED to the drain for
 *     glitch-freedom: a pull-refresh can run mid-batch on torn values, so the
 *     updater must fire once, at the drain, reading a settled `_v`.
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
        // Collect-then-verify, same as the lazy variant.
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
      // equals gate: keep the OLD value (stable reference — the memo semantic)
      // and notify nobody when structurally equal.
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
    // Inline dirty-marking NOTIFY, idempotent via the `_dirty` guard exactly
    // like the lazy variant. `enqueueEagerRefresh` books the guaranteed tier-1
    // evaluation.
    if (read._disposed || read._dirty) return
    read._dirty = true
    if (isBatching()) {
      enqueueEagerRefresh(read as unknown as () => void)
    } else {
      // Raw external dispatch outside any write window (every in-tree notify
      // runs under one) — open our own so the refresh still runs synchronously.
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
    // skipFrames=2: skip this fn + `computed`, capture the user's call site.
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
