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
  /** @internal staleness — 0 clean, 1 STRICT CHECK, 2 DIRTY, 3 disposed while marked; see `Stale` in batch.ts */
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
  /**
   * @internal the dependency list (hosts, in read order). A property rather
   * than a closure variable so `checkDirty` can walk the graph iteratively
   * from any node.
   */
  _deps: SubscriberHost[]
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
      // DIRTY already (or 3, disposed while marked): nothing to add. A STRICT
      // CHECK: its own subscribers were reached when it was marked,
      // so the change only has to be RECORDED on it — the upgrade is what makes
      // its pending dep refresh re-evaluate it. A marked computed is never
      // disposed (dispose turns a mark into 3), so `_disposed` is read only for
      // a clean one.
      if (st === 1) {
        c._dirty = 2
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

/** A computed as seen by the iterative dep check (signals carry no `_dirty`). */
interface CheckNode {
  (): unknown
  _dirty?: Stale
  _deps: SubscriberHost[]
}

/**
 * Scratch stack for {@link checkDirty}: the computeds being descended through
 * and the dep index to resume each at. Hot module state on a `const` holder
 * (see `TrackingFrame` in tracking.ts). Entries are POPPED as the walk climbs
 * back, so nothing is retained after a check (a throw truncates to the
 * caller's base in `finally`); capacity is bounded by the deepest marked
 * chain ever checked.
 */
const _ck: { n: CheckNode[]; i: number[] } = { n: [], i: [] }

/**
 * The CHECK-state resolution, ITERATIVE (alien-signals' `checkDirty` shape):
 * walk down the recorded deps of `root` with an explicit stack, descending
 * into each dep that is itself only CHECK-marked and evaluating each that is
 * DIRTY, then resolve bottom-up. A dep that re-evaluates to a new value
 * upgrades its subscribers to DIRTY (`propagateEagerChange`); a node found
 * DIRTY is evaluated (its deps are now fresh, so `fn` reads clean caches) and
 * the walk resumes in its parent; a node whose deps all came back unchanged is
 * marked clean WITHOUT running `fn` — the equality cutoff. Returns true when
 * `root` itself must re-evaluate (left DIRTY for the caller), false when it
 * was confirmed clean.
 *
 * Deps are visited in the order the last evaluation read them, stopping at
 * the first change: every dep before it returned the same value as last time,
 * so `fn` would read exactly those again, and a dep after it may belong to a
 * branch `fn` no longer takes (Preact's and alien-signals' rule). Signals and
 * selector buckets carry no `_dirty` and are skipped — a write to one marks
 * its subscribers DIRTY directly. The walk runs UNTRACKED (`root` already
 * registered with the outer frame), suspending the frame inline. Re-entrant:
 * an evaluation inside the walk may run its own check above `base`.
 */
function checkDirty(root: CheckNode): boolean {
  const prev = _t.e
  _t.e = null
  const ns = _ck.n
  const is = _ck.i
  const base = ns.length
  let node = root
  let deps = root._deps
  let i = 0
  try {
    for (;;) {
      if (node._dirty !== 2) {
        if (i < deps.length) {
          const d = deps[i] as unknown as CheckNode
          const st = d._dirty
          if (st === 1) {
            // Only maybe-stale: descend and resolve it first.
            ns.push(node)
            is.push(i)
            node = d
            deps = d._deps
            i = 0
            continue
          }
          // DIRTY (3) or disposed-while-marked (4): evaluate it in place. A
          // new value upgrades `node` to DIRTY, seen at the loop top.
          if (st === 2 || st === 3) d()
          i++
          continue
        }
        // Every dep came back unchanged: clean without running `fn`.
        node._dirty = 0
        if (ns.length === base) return false
      } else {
        if (ns.length === base) return true
        // DIRTY below the root: evaluate it now (its deps are fresh). A new
        // value upgrades the parent, seen when the walk resumes there.
        node()
      }
      node = ns.pop() as CheckNode
      i = (is.pop() as number) + 1
      deps = node._deps
    }
  } finally {
    _t.e = prev
    // Only a throw leaves frames above `base`; drop them (no retention).
    if (ns.length > base) {
      ns.length = base
      is.length = base
    }
  }
}

/**
 * The cold paths of a computed's read, kept OUT of the per-instance `read`
 * closure on purpose: V8 inlines a function only below a bytecode-size limit,
 * and the read closure sits close to it. Measured: with these inline the read
 * stopped being inlined into its callers (`--trace-turbo-inlining`: "exceeds
 * bytecode limit") and the computed diamond lost ~10% on V8.
 */
function readDisposed<T>(read: ComputedFn<T>, fn: () => T, first: boolean): T {
  read._dirty = 0
  // Disposed before its first evaluation: evaluate once, UNTRACKED.
  if (first) {
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
  // `initialized` is touched only by the per-instance `read` / `recompute` /
  // `dispose` closures, so it stays closure-captured. `recompute` is
  // forward-declared for the `read` body; `read` is never invoked before it is
  // wired.
  let initialized = false
  let recompute: () => void

  const read = (() => {
    trackSubscriber(read as unknown as SubscriberHost)
    const st = read._dirty
    if (st !== 0) {
      // 3 = disposed while marked (set by `dispose()`). A DISPOSED computed
      // must never re-link to its sources: `dispose()` empties its deps, so a
      // dirty read through `runVerify` would diverge at index 0 and
      // `addSubscriber` `recompute` back onto every source — a zombie
      // subscriber kept for the source's lifetime. `readDisposed` returns the
      // last value (evaluating once, UNTRACKED, if it never ran) and clears the
      // mark; a disposed computed is never marked again, so this runs once.
      if (st === 3) {
        const first = !initialized
        initialized = true
        return readDisposed(read, fn, first)
      }
      // STRICT CHECK (1): reached only below a self-gating node, so only an
      // upstream node MAY have changed. Resolve the deps first (`checkDirty`);
      // when none changed the cached value is still current and `fn` is
      // skipped, exactly as quiet as before such nodes were marked.
      if (st === 1 && !checkDirty(read)) return read._value
      if (process.env.NODE_ENV !== 'production') devRecordRecompute(read)
      const wasInitialized = initialized
      let next: T
      try {
        // VERIFY the dep list positionally (zero Set ops in the steady state). A
        // divergence unsubscribes the stale tail and records the new shape. The
        // first evaluation verifies an EMPTY list, which diverges at index 0
        // and collects — one path for both, which keeps this closure small
        // enough for V8 to inline.
        next = runVerify(recompute, read._deps, fn)
      } catch (err) {
        initialized = true
        return evalThrew(read, err) // keep the previous value on a throwing eval
      }
      read._dirty = 0
      initialized = true
      // Value gate: keep the OLD value (stable reference — the memo semantic)
      // and notify nobody when equal.
      if (!(wasInitialized && equals(read._value, next))) {
        read._value = next
        // The first evaluation never propagates (the reader that triggered it
        // is already subscribed); it trims the collected deps to an exact-size
        // copy (see `exactDeps`).
        if (wasInitialized) propagateEagerChange(read)
        else read._deps = exactDeps(read._deps)
      }
    }
    return read._value
  }) as unknown as ComputedFn<T>

  // Plain-field state (fast in-object properties) + shared prototype — see the
  // `ComputedFn` / `ComputedProto` comments above for the why.
  Object.setPrototypeOf(read, ComputedProto)
  read._value = undefined as T
  read._dirty = 2
  read._disposed = false
  read._s1 = null
  read._s = null
  read._d1 = null
  read._d = null
  read._deps = []

  recompute = eager
    ? (level?: Stale) => {
        // EAGER notify — an explicit `equals` places the gate at THIS node, so
        // book the tier-1 refresh unconditionally rather than waiting for a
        // runner to appear downstream. Idempotent via the `_dirty` guard, exactly
        // like the gated-lazy variant. The dirty walk passes STRICT CHECK (1) when it
        // reaches this node through one that was only marked; a source calling
        // it bare has really changed (DIRTY). A CHECK refresh re-evaluates only
        // if a computed dep turns out to have changed.
        if (read._disposed) return
        const lv: Stale = level === undefined ? 2 : level
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
        _markLazyAndPropagate(read, 2)
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
    if (read._dirty !== 0) read._dirty = 3
    cleanupLocalDeps(read._deps, recompute)
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
