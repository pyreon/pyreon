import {
  type Stale,
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
import {
  removeSubscriber,
  exactDeps,
  runUntracked,
  runVerify,
  _t,
  type SubscriberHost,
  trackSubscriber,
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
   * Custom equality comparator. A computed ALREADY gates on value by default
   * (`Object.is`, like `signal.set`), so pass this only when identity is the
   * wrong test — typically a derivation that rebuilds a fresh array/object whose
   * CONTENTS are unchanged, which `Object.is` can never gate.
   *
   * Passing `equals` also makes the computed EAGER: it re-evaluates on every
   * dependency change rather than waiting for a downstream consumer, so the gate
   * sits at THIS node instead of at the nearest node above a live consumer. That
   * is usually the point — a cheap identity-preserving lookup placed above a
   * fresh-object consumer that could never gate on its own. It costs one
   * evaluation per dependency change even with no reader, so keep the body cheap.
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
  /** @internal staleness — 0 clean, 1 STRICT CHECK, 2 CHECK, 3 DIRTY, 4 disposed while marked; see `Stale` in batch.ts */
  _dirty: Stale
  /** @internal disposed flag */
  _disposed: boolean
  /**
   * @internal subscriber set — who depends on THIS computed. Inlined onto the
   * read fn (was a separate `host` object), so `trackSubscriber(read)` works
   * exactly like `signal`. Eliminates one object allocation per computed.
   */
  _s1: (() => void) | null
  /** @internal second inline subscriber (a function) OR the promoted Set — see `SubscriberHost` */
  _s: Set<() => void> | (() => void) | null
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
    if (self._dirty !== 0) self() // ensure value is fresh
    return self._value
  },
}
Object.setPrototypeOf(ComputedProto, Function.prototype)

/** Remove a computed from all dependency subscriber sets (local deps array). */
function cleanupLocalDeps(deps: SubscriberHost[], fn: () => void): void {
  for (let i = 0; i < deps.length; i++) removeSubscriber(deps[i] as SubscriberHost, fn)
  deps.length = 0
}

/** The dispatch half of {@link propagateEagerChange} — factored out so its
 * subscriber/direct branch sides exist ONCE, shared by both window arms. */
/** A lazy computed's notify callback carries a back-ref to its read fn (`_c`,
 *  stamped by `_markRecompute`); effects and eager computeds do not. */
type LazyNotifyFn = (() => void) & { _c?: { _dirty: Stale; _disposed: boolean } }

function dispatchEagerChange(read: ComputedFn<unknown>): void {
  if (read._s1 !== null || read._s !== null) propagateLazyDirty(read)
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
  // Nothing to propagate when there are no direct updaters and the only
  // subscriber is a lazy computed that is already dirty (or disposed) — the
  // exact case `propagateLazyDirty` returns from on its first check. It is the
  // common one on a PULL: a dirty computed is re-evaluated because its reader,
  // itself dirty, is evaluating right now. Skipping here also skips opening and
  // closing a batch window per hop, which a 50-deep chain paid 50 times a read.
  if (read._d1 === null && read._d === null && read._s === null) {
    const s1 = read._s1 as (LazyNotifyFn | null)
    if (s1 === null) return
    const c = s1._c
    if (c !== undefined) {
      const st = c._dirty
      // DIRTY already (or 4, disposed while marked): nothing to add. A CHECK
      // (strict or not): its own subscribers were reached when it was marked,
      // so the change only has to be RECORDED on it — the upgrade is what makes
      // its pending dep refresh re-evaluate it. A marked computed is never
      // disposed (dispose turns a mark into 4), so `_disposed` is read only for
      // a clean one.
      if (st === 1 || st === 2) {
        c._dirty = 3
        return
      }
      if (st !== 0 || c._disposed) return
    }
  }
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

/**
 * The CHECK-state dep refresh: pull each COMPUTED dep that is itself marked,
 * in the order the last evaluation read them, and stop at the first one whose
 * change upgrades `read` to DIRTY. Returns whether `read` must re-evaluate.
 *
 * Order and the early stop are what make this sound: every dep before the
 * first changed one returned the same value as last time, so `fn` would read
 * exactly those deps again — a dep after it may belong to a branch `fn` no
 * longer takes, and is never pulled here (Preact's and alien-signals' rule).
 *
 * Signals and selector buckets carry no `_dirty` (`undefined > 0` is false);
 * a write to one notifies its subscribers DIRTY directly, so a CHECK node never
 * needs to look at them. The pulls run UNTRACKED — `read` already registered
 * with the outer frame — by suspending the frame's subscriber inline rather
 * than through a `runUntracked` closure per pull. Recursion depth equals the
 * depth of the marked chain, as for the evaluation it replaces.
 */
function refreshDeps(read: ComputedFn<unknown>, deps: SubscriberHost[]): boolean {
  const prev = _t.e
  _t.e = null
  try {
    for (let i = 0; i < deps.length; i++) {
      const d = deps[i] as unknown as { (): unknown; _dirty?: Stale }
      if ((d._dirty as number) > 0) {
        d()
        if (read._dirty === 3) return true
      }
    }
  } finally {
    _t.e = prev
  }
  return false
}

/**
 * The cold paths of a computed's read, kept OUT of the per-instance `read`
 * closure on purpose: V8 inlines a function only below a bytecode-size limit,
 * and the read closure sits close to it. Measured: with these inline the read
 * stopped being inlined into its callers (`--trace-turbo-inlining`: "exceeds
 * bytecode limit") and the computed diamond lost ~10% on V8.
 */
function readDisposed<T>(read: ComputedFn<T>, fn: () => T, flags: number): T {
  read._dirty = 0
  // Disposed before its first evaluation: evaluate once, UNTRACKED.
  if ((flags & 1) === 0) {
    try {
      read._value = runUntracked(fn)
    } catch (err) {
      _errorHandler(err)
    }
  }
  return read._value
}

function evalThrew<T>(read: ComputedFn<T>, err: unknown): T {
  _errorHandler(err)
  read._dirty = 0
  return read._value
}

/** CHECK resolution: true (and the computed marked clean) when no dep changed. */
function refreshClean(read: ComputedFn<unknown>, deps: SubscriberHost[]): boolean {
  if (refreshDeps(read, deps)) return false
  read._dirty = 0
  return true
}

function devRecordRecompute(read: ComputedFn<unknown>): void {
  _countSink.__pyreon_count__?.('reactivity.computedRecompute')
  _rdRecordFire(read)
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
  // An EXPLICIT `equals` is a statement about WHERE the gate belongs — the author
  // wants this node to stop the cascade, typically because everything below it
  // rebuilds a fresh object and so could never gate on its own. Honour that by
  // keeping the eager variant, which refreshes on every notification. The DEFAULT
  // gate has no such placement intent, so it stays lazy until a runner appears.
  return createComputed(fn, options?.equals ?? Object.is, options?.equals !== undefined, loc)
}

/**
 * The one computed implementation, in two propagation modes.
 *
 * `eager: false` (the DEFAULT, no `equals` passed) — LAZY propagation with a
 * VALUE GATE. Two properties hold at once, and it is the combination that is the
 * design; either alone was already available:
 *
 *  - **Lazy while nobody is listening.** A notification marks the computed dirty
 *    and cascades that flag through downstream computeds without evaluating
 *    anything. A computed with no subscribers, or whose subscribers are all
 *    themselves un-listened-to computeds, still evaluates ZERO times across any
 *    number of dependency writes. Repeat writes coalesce for free via the
 *    `_dirty` early-exit.
 *
 *  - **Gated once something will actually run.** The moment the dirty cascade
 *    reaches a RUNNER — an effect notify, a raw listener, or a `direct()`
 *    updater — the cascade stops and books a tier-1 refresh of the computed
 *    sitting immediately above it (`enqueueEagerRefresh`, from
 *    `propagateLazyDirty` / `_markLazyAndPropagate`). That refresh is this
 *    `read`: it evaluates, compares against the previous value, and propagates
 *    ONLY on a real change. The evaluation is not extra work — the runner was
 *    going to pull this value during the drain anyway; it is the same evaluation
 *    moved earlier so the comparison can happen before N runners fire.
 *
 * The comparator defaults to `Object.is`, matching `signal.set`'s write gate and
 * Solid `createMemo` / Vue `computed` / Svelte `$derived`.
 *
 * `eager: true` (an EXPLICIT `equals`) — unchanged from before the default gate:
 * every notification books a tier-1 refresh, so the gate sits at THIS node
 * regardless of what is downstream. That is the point of passing `equals`
 * yourself: it is a placement decision. The canonical shape is a cheap
 * identity-preserving lookup sitting above a consumer that rebuilds a fresh
 * object on every run and so could never gate on its own (`@pyreon/flow`'s
 * `_edgeById` above edge geometry; `@pyreon/router`'s `DepthEntry` above
 * `RouterView`). It costs one evaluation per dependency change even with no
 * reader — keep such bodies cheap.
 *
 * Mechanics that must not regress (each locked by a named regression suite):
 *
 *  - `recompute` (the source-subscribed callback) is a dirty-mark-only,
 *    idempotent NOTIFY run INLINE during the write's notify phase — the
 *    `_dirty` early exit is what stops double-propagation in diamonds.
 *  - The READ's dirty branch is the SINGLE evaluator. A tier-1 visit whose value
 *    was already pulled fresh by an earlier visitor skips via the `_dirty`
 *    guard — zero double evaluation, and pull-reads of an enqueued-but-unvisited
 *    dep evaluate in place rather than returning a stale cache (tier-1 drains in
 *    SUBSCRIPTION order, not topological order — `tier1-topo-staleness.test.ts`).
 *  - Direct (`_d1`/`_d`) subscribers are DEFERRED to the drain via
 *    `propagateEagerChange`: a refresh can run mid-batch on torn values, so the
 *    updater must fire once, at the drain, reading a settled `_v`
 *    (`batch-glitch-freedom.test.ts`).
 *  - The first evaluation never propagates: the actively-tracking reader that
 *    triggered it is already subscribed and would spuriously re-run.
 */
function createComputed<T>(
  fn: () => T,
  equals: (prev: T, next: T) => boolean,
  eager: boolean,
  injectedLoc?: { file: string; line: number; col: number },
): Computed<T> {
  // `flags` and `deps` are touched only by the per-instance `read` / `recompute`
  // / `dispose` closures, so they stay closure-captured. `recompute` is
  // forward-declared for the `read` body; `read` is never invoked before it is
  // wired.
  //
  // `flags` packs three things into one closure slot (one slot fewer than the
  // two booleans it replaced):
  //  - bit 0 (1): initialized — evaluated at least once (bit 1 is unused);
  //  - bits 2–3: the CUTOFF PREDICTOR, a 2-bit saturating counter (0..3,
  //    starting at 1). A CHECK read can either refresh its computed deps first
  //    and skip `fn` when none changed (pays a dep walk, saves `fn` on a
  //    cutoff), or evaluate `fn` directly (always correct — it is what a DIRTY
  //    read does — and cheapest when the value is going to change anyway). The
  //    counter jumps to 3 when a CHECK resolved to "unchanged" and drops by one
  //    when it changed; at 2 or more the read refreshes deps first. So a node
  //    never wastes two evaluations in a row, a node below an unchanged gate
  //    stops evaluating after at most one wasted run, a node in an all-change
  //    chain keeps the direct path with no dep walk, and one change in a
  //    mostly-cutoff node does not flip it.
  let flags = 4
  // `let`: re-pointed at an exact-size copy after the first collect (see
  // `exactDeps` in tracking.ts).
  let deps: SubscriberHost[] = []
  let recompute: () => void

  const read = (() => {
    trackSubscriber(read as unknown as SubscriberHost)
    const st = read._dirty
    if (st !== 0) {
      // A DISPOSED computed must never re-link to its sources. `dispose()`
      // empties `deps`, so a dirty read through `runVerify` would diverge at
      // index 0 and `addSubscriber` `recompute` back onto every source — a
      // zombie subscriber that is never evaluated again (`recompute` and every
      // dirty-marker bail on `_disposed`) yet stays for the source's lifetime.
      // The window is a read after a write dirty-marked it and before anything
      // pulled it: e.g. a batched write + dispose whose already-enqueued
      // dispatch still reads the computed. Return the last value; a computed
      // disposed before its first evaluation evaluates once, UNTRACKED. Only
      // the dirty branch pays this check — clean reads are untouched.
      // `flags` is read ONCE into a local and written back once per exit: each
      // closure-slot access of a `let` carries a TDZ hole check, and the read
      // closure must stay under V8's inlining bytecode limit (see
      // `readDisposed`).
      let f = flags
      // 4 = disposed while marked (set by `dispose()`). `readDisposed` clears
      // it, and a disposed computed is never marked again, so this runs once.
      if (st === 4) return readDisposed(read, fn, f)
      // CHECK: only an upstream node MAY have changed. A STRICT check always —
      // and a plain check when the predictor expects a cutoff — refreshes the
      // computed deps in recorded order; one that re-evaluates to a new value
      // upgrades this node to DIRTY through `propagateEagerChange`. If none
      // does, the cached value is still current — the equality cutoff: `fn` is
      // skipped.
      if ((st === 1 || (st === 2 && (f & 8) !== 0)) && refreshClean(read, deps)) return read._value
      if (process.env.NODE_ENV !== 'production') devRecordRecompute(read)
      let next: T
      try {
        // VERIFY the dep list positionally (zero Set ops in the steady state). A
        // divergence unsubscribes the stale tail and records the new shape. The
        // first evaluation verifies an EMPTY list, which diverges at index 0
        // and collects — one path for both, which keeps this closure small
        // enough for V8 to inline. The first successful collect is then trimmed
        // to an exact-size copy (`exactDeps`).
        next = runVerify(recompute, deps, fn)
        if ((f & 1) === 0) deps = exactDeps(deps)
      } catch (err) {
        flags = f | 1
        return evalThrew(read, err) // keep the previous value on a throwing eval
      }
      read._dirty = 0
      if ((f & 1) !== 0 && equals(read._value, next)) {
        // Value gate: keep the OLD value (stable reference — the memo
        // semantic) and notify nobody. A CHECK that turned out unchanged moves
        // the predictor to refresh-deps-first.
        if (st === 2 && (f & 12) !== 12) flags = f | 12
      } else {
        // First evaluation: store, but never propagate — the actively-tracking
        // reader that triggered it is already subscribed. Otherwise a CHECK that
        // changed leans toward evaluating directly next time. Flags are stored
        // BEFORE propagating, which can re-enter this read. Stored only when it
        // changes: the steady state (an all-change node) writes nothing.
        if ((f & 1) === 0) flags = f | 1
        else if (st === 2 && (f & 12) !== 0) flags = f - 4
        read._value = next
        if ((f & 1) !== 0) propagateEagerChange(read)
      }
    }
    return read._value
  }) as unknown as ComputedFn<T>

  // Plain-field state (fast in-object properties) + shared prototype — see the
  // `ComputedFn` / `ComputedProto` comments above for the why.
  Object.setPrototypeOf(read, ComputedProto)
  read._value = undefined as T
  read._dirty = 3
  read._disposed = false
  read._s1 = null
  read._s = null
  read._d1 = null
  read._d = null

  recompute = eager
    ? (level?: Stale) => {
        // EAGER notify — an explicit `equals` places the gate at THIS node, so
        // book the tier-1 refresh unconditionally rather than waiting for a
        // runner to appear downstream. Idempotent via the `_dirty` guard, exactly
        // like the gated-lazy variant. The dirty walk passes CHECK (1) when it
        // reaches this node through one that was only marked; a source calling
        // it bare has really changed (DIRTY). A CHECK refresh re-evaluates only
        // if a computed dep turns out to have changed.
        if (read._disposed) return
        const lv: Stale = level === undefined ? 3 : level
        const st = read._dirty
        if (st !== 0) {
          if (st < lv) read._dirty = lv
          return
        }
        read._dirty = lv
        // Its own subscribers are marked STRICT CHECK as well, so a pull that lands
        // before the tier-1 refresh (inside a batch, or from an earlier refresh
        // in the same drain) re-validates through this node rather than reading
        // a stale cache. A runner below gates on this node, which is already
        // booked.
        if (isBatching()) {
          enqueueEagerRefresh(read as unknown as () => void)
          if (read._s1 !== null || read._s !== null) propagateLazyDirty(read, read, 1)
        } else {
          // Raw external dispatch outside any write window (every in-tree notify
          // runs under one) — open our own so the refresh still runs synchronously.
          openInlineBatch()
          try {
            enqueueEagerRefresh(read as unknown as () => void)
            if (read._s1 !== null || read._s !== null) propagateLazyDirty(read, read, 1)
          } finally {
            closeInlineBatch()
          }
        }
      }
    : () => {
        // GATED-LAZY notify — delegates to the CANONICAL body in batch.ts: mark
        // dirty (idempotent), then either cascade the dirty flag onward (nothing
        // downstream runs yet) or — when a runner sits below — book this
        // computed's tier-1 refresh so its gate decides whether the runner fires.
        //
        // This closure exists ONLY for its per-instance subscriber-set IDENTITY —
        // dispatch sites holding the `_c` back-ref call the helper directly.
        // A source calling this directly has really changed: DIRTY.
        _markLazyAndPropagate(read, 3)
      }
  // Recompute marker → the batch router and `propagateLazyDirty` run this inline
  // (dirty-mark-only, idempotent) instead of routing it through the queues, so
  // pure-computed cascades resolve during the notify phase. The second arg stamps
  // `recompute._c = read` so the cascade's fused single-subscriber walk can
  // dirty-mark these fields DIRECTLY — that walk inlines `_markLazyAndPropagate`,
  // so keep the two in lock-step. An EAGER notify does more than dirty-marking,
  // so it is deliberately left unstamped and routed through its own closure.
  _markRecompute(recompute, eager ? undefined : read)

  read.dispose = () => {
    read._disposed = true
    // Disposed while marked: the next read takes `readDisposed` (4) instead of
    // evaluating and re-linking to its sources.
    if (read._dirty !== 0) read._dirty = 4
    cleanupLocalDeps(deps, recompute)
  }

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=2: skip this fn + `computed`, capture the user's call site.
    _rdRegister(
      read,
      'derived',
      read as unknown as SubscriberHost,
      recompute,
      undefined,
      injectedLoc ?? _captureCallerLocation(2),
    )

  getCurrentScope()?.add({ dispose: read.dispose })
  return read as unknown as Computed<T>
}
