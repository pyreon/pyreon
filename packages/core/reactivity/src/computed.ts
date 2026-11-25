import { _errorHandler } from './errors'
import {
  F_COMPUTED,
  F_DIRECT_STALE,
  F_DIRTY,
  F_DISPOSED,
  F_HAS_DIRECT,
  F_HAS_VALUE,
  F_NOTIFYING,
  F_PENDING,
  F_QUEUED,
  F_RUNNING,
  type Link,
  type Source,
  type Subscriber,
  type WatcherNode,
  _b,
  _cx,
  _st,
  _t,
  drain,
  enqueueNode,
  link,
  purgeDeps,
  runUntracked,
  settleUnread,
  unconfirmed,
  unlinkAllDeps,
} from './graph'
import { _captureCallerLocation, _rdDirect, _rdRecordFire, _rdRegister } from './reactive-devtools'
import { _ownerScope } from './scope'
import { _addDirect, _removeDirect } from './signal'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

const F_MARKED = F_DIRTY | F_PENDING

// ─── The pull side of the graph ─────────────────────────────────────────────
// Everything that evaluates or resolves a computed. It lives here, not in
// graph.ts, so code that never creates a computed does not ship it; the effect
// and flush code reach `checkDirty` / `refreshComputed` through `_cx`, which
// `computed()` fills before it creates a node (see `ComputedOps` in graph.ts).

/**
 * A computed's graph node — a source AND a subscriber. A plain fixed-shape
 * object, NOT the callable the user holds: the walks read `_f` / `_subs` /
 * `_deps` on every node they visit, and on a function object those fields
 * live out of object (one more dependent load each). The callable is a thin
 * bound function over this node (`readComputed` below).
 */
export class ComputedNode implements Source, WatcherNode {
  _f: number = F_COMPUTED | F_DIRTY
  _value: unknown = undefined
  _fn: () => unknown
  _eq: ((prev: unknown, next: unknown) => boolean) | null
  _deps: Link | null = null
  _depsTail: Link | null = null
  _subs: Link | null = null
  _subsTail: Link | null = null
  /** Direct tier (see `DirectHost` in signal.ts). */
  _d1: (() => void) | null = null
  _d: Set<() => void> | null = null

  constructor(fn: () => unknown, eq: ((prev: unknown, next: unknown) => boolean) | null) {
    this._fn = fn
    this._eq = eq
  }

  /** At its queue turn (it has direct updaters). */
  run(): void {
    runComputedWatcher(this)
  }

  /** Drop every source; keeps the last value. Idempotent. */
  _dispose(): void {
    const f = this._f
    if ((f & F_DISPOSED) !== 0) return
    this._f = (f & ~F_MARKED) | F_DISPOSED
    unlinkAllDeps(this)
  }
}

/**
 * A computed's value changed when it was pulled: its PENDING subscribers now
 * know a source they read changed. A clean subscriber is left alone — it is
 * either the reader pulling right now (about to see the new value) or it never
 * read the old one.
 */
function shallowPropagate(head: Link): void {
  let l: Link | null = head
  do {
    const sub = l.sub
    const f = sub._f
    if ((f & (F_MARKED | F_DISPOSED)) === F_PENDING) sub._f = f | F_DIRTY
    l = l.nextSub
  } while (l !== null)
}

// ─── Computed evaluation ────────────────────────────────────────────────────

/**
 * Evaluate a computed in its own tracking frame. Returns true when the value
 * CHANGED (a first evaluation is not a change: nobody holds an old value). A
 * throwing evaluation (or a throwing `equals`) is reported and keeps the
 * previous value — and its unconfirmed dependency tail.
 */
function updateComputed(c: ComputedNode): boolean {
  if (process.env.NODE_ENV !== 'production') {
    _countSink.__pyreon_count__?.('reactivity.computedRecompute')
    _rdRecordFire(c)
  }
  const prevSub = _t.e
  _t.e = c
  c._depsTail = null
  const f0 = c._f
  c._f = (f0 & ~F_MARKED) | F_RUNNING
  let next: unknown
  let same: boolean
  try {
    const fn = c._fn
    next = fn()
    if ((f0 & F_HAS_VALUE) === 0) same = false
    else {
      const eq = c._eq
      same = eq === null ? Object.is(c._value, next) : eq(c._value, next)
    }
  } catch (err) {
    _t.e = prevSub
    // A throw keeps the previous value — which readers have seen even when
    // this was the first evaluation (`undefined`), so the next successful
    // evaluation compares against it.
    c._f = (c._f & ~F_RUNNING) | F_HAS_VALUE
    _errorHandler(err)
    settleUnread(unconfirmed(c))

    return false
  }
  _t.e = prevSub
  const f = c._f & ~F_RUNNING
  if ((f & F_DISPOSED) !== 0) {
    // Disposed during its own evaluation (a sweep its own read triggered):
    // this evaluation's result is still what the read returns and what the
    // disposed node keeps; drop what the run linked, notify nobody.
    if (!same) c._value = next
    c._f = f | F_HAS_VALUE
    unlinkAllDeps(c)

    return false
  }
  // Inline guard: a run that read the same deps as last time leaves nothing
  // after the cursor (the steady state), so the call is skipped.
  // (Re-read: the run moved the cursor since it was reset above.)
  const tail = c._depsTail as Link | null
  if ((tail !== null ? tail.nextDep : c._deps) !== null) purgeDeps(c)
  if (same) {
    c._f = f
    return false
  }
  c._value = next
  c._f = f | F_HAS_VALUE

  return (f0 & F_HAS_VALUE) !== 0
}

/**
 * After a computed's value changed: upgrade its readers, and its direct
 * updaters. `inCheck`: `checkDirty` evaluated it on behalf of the reader it is
 * checking — a SOLE subscriber is that reader, and the walk records the change
 * itself (`dirty`), so it is not re-marked.
 */
function computedChanged(c: ComputedNode, inCheck: boolean): void {
  const subs = c._subs
  if (subs !== null && (!inCheck || subs.nextSub !== null)) shallowPropagate(subs)
  if ((c._f & F_HAS_DIRECT) !== 0) directChanged(c)
}

/** A computed with direct updaters changed: fire them at its queue turn. */
function directChanged(c: ComputedNode): void {
  const f = c._f | F_DIRECT_STALE
  c._f = f
  // Normally the computed is already queued (marking reached it). Not when
  // it changed while unmarked — a direct updater added to a stale node.
  if ((f & (F_QUEUED | F_NOTIFYING)) === 0) {
    enqueueNode(c)
    if (_b.d === 0) {
      _b.d = 1
      drain()
    }
  }
}

/**
 * Resolve a marked computed: re-evaluate it if a source it read changed, else
 * clear the mark without running it. Never reached for a disposed computed:
 * disposal clears the marks, nothing marks a disposed node, and every caller
 * acts only on a marked one.
 */
export function refreshComputed(c: ComputedNode): void {
  if ((c._f & F_DIRTY) !== 0 || checkDirty(c)) {
    if (updateComputed(c)) computedChanged(c, false)
  } else c._f &= ~F_PENDING
}

/**
 * Resolve a PENDING subscriber's dependencies, iteratively and bottom-up
 * (alien-signals' shape). Descends into PENDING computeds, evaluates DIRTY
 * ones, and returns true as soon as one dependency of `root` really changed
 * (`root` must then re-evaluate / re-run). Deps are visited in the order the
 * last run read them and the walk stops at the first change: every dep before
 * it returned the same value, and a dep after it may belong to a branch the
 * next run no longer takes. A computed whose deps all came back unchanged is
 * cleared without running — the equality cutoff.
 *
 * Signals and selector buckets carry no flags and are skipped: a write to one
 * marks its subscribers DIRTY directly. Re-entrant: an evaluation inside the
 * walk may run its own check above `base`. Never throws (evaluations report
 * their own errors).
 */
export function checkDirty(root: Subscriber): boolean {
  // Every node this walk visits is marked PENDING, so it holds a dependency
  // edge (see "Marks" in the module header).
  let l = root._deps as Link
  let sub: Subscriber = root
  const stack = _st.c
  const base = stack.length
  let dirty = false
  top: for (;;) {
    if ((sub._f & F_DIRTY) !== 0) dirty = true
    else {
      const dep = l.dep as Source & Partial<ComputedNode>
      const df = dep._f
      if (df !== undefined && (df & F_DISPOSED) === 0) {
        if ((df & F_DIRTY) !== 0) {
          if (updateComputed(dep as ComputedNode)) {
            computedChanged(dep as ComputedNode, true)
            dirty = true
          }
        } else if ((df & F_PENDING) !== 0) {
          stack.push(l)
          l = dep._deps as Link
          sub = dep as ComputedNode
          continue
        }
      }
    }
    if (!dirty) {
      const nd: Link | null = l.nextDep
      if (nd !== null) {
        l = nd
        continue
      }
    }
    while (stack.length > base) {
      const pl = stack.pop() as Link
      // A dependency evaluated in this walk may have WRITTEN a source `sub`
      // read, upgrading `sub` to DIRTY. It is marked and (for a computed)
      // unqueued, so later writes stop at it: it must resolve now, or it and
      // everything above it stay stale for good.
      if (dirty || (sub._f & F_DIRTY) !== 0) {
        if (updateComputed(sub as ComputedNode)) {
          computedChanged(sub as ComputedNode, true)
          dirty = true
          sub = pl.sub
          continue
        }
        dirty = false
      } else sub._f &= ~F_PENDING
      sub = pl.sub
      const nd: Link | null = pl.nextDep
      if (nd !== null) {
        l = nd
        continue top
      }
    }

    // Same for the root: a write made by a dependency it just evaluated can
    // upgrade it to DIRTY after its own check at the top of the walk.
    return dirty || (root._f & F_DIRTY) !== 0
  }
}

/** A computed with direct updaters, at its queue turn. */
function runComputedWatcher(c: ComputedNode): void {
  let f = c._f
  if ((f & F_DISPOSED) !== 0) return
  if ((f & F_MARKED) !== 0) {
    c._f = f | F_NOTIFYING
    refreshComputed(c)
    c._f &= ~F_NOTIFYING
    f = c._f
  }
  if ((f & F_DIRECT_STALE) === 0) return
  c._f = f & ~F_DIRECT_STALE
  // Fire once, on the settled value. A Set may gain members while it is
  // iterated (an updater registering another); those wait for the next change.
  const d1 = c._d1
  if (d1 !== null) d1()
  else {
    const d = c._d
    if (d !== null) {
      const n = d.size
      let i = 0
      for (const fn of d) {
        if (i++ >= n) break
        fn()
      }
    }
  }
}

// ─── The callable ───────────────────────────────────────────────────────────

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
   * When the comparator says the new value equals the previous one, the
   * computed keeps the PREVIOUS value (a stable reference) and nothing that
   * reads it re-runs. Like every computed it is lazy: it evaluates only when
   * something reads it (directly, or through an effect, binding or computed
   * that depends on it), never just because a dependency changed.
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

// The callable a user holds is a BOUND function over the graph node
// (`ComputedNode` in graph.ts, a plain fixed-shape object), with shareable
// methods on `ComputedProto` and one own property: `_n`, the node. The node is
// what readers link to, what the scope disposes and what the walks visit; the
// callable only reads it. (A bound function needs no closure context, which
// keeps a computed at the size it had as one function object.)
interface ComputedFn<T> {
  (): T
  /** @internal the graph node */
  _n: ComputedNode
  _v: T
  dispose(): void
  direct(updater: () => void): () => void
}

/**
 * Shared prototype for every computed callable — `direct`, `dispose` and the
 * `_v` getter live here (one allocation total). Mirrors `SignalProto`,
 * including the `setPrototypeOf(_, Function.prototype)` step so computeds keep
 * `instanceof Function === true` (consumers across the ecosystem discriminate
 * reactive values that way).
 */
const ComputedProto = {
  direct(this: ComputedFn<unknown>, updater: () => void): () => void {
    // Dev: instrumented wrapper — see `_directFn` in signal.ts.
    if (process.env.NODE_ENV !== 'production') updater = _rdDirect(updater)
    const n = this._n
    _addDirect(n, updater)
    n._f |= F_HAS_DIRECT
    return () => {
      _removeDirect(n, updater)
      // The last updater left: marking stops queueing the node (it is lazy again).
      if (n._d1 === null && (n._d === null || n._d.size === 0)) n._f &= ~F_HAS_DIRECT
    }
  },
  /**
   * Public disposer — works detached (`onCleanup(c.dispose)`). Removes the
   * computed from all its sources; it keeps its last value and never
   * re-links: reading it later returns that value (or, if it never
   * evaluated, evaluates once, untracked).
   */
  get dispose(): () => void {
    const n = (this as unknown as ComputedFn<unknown>)._n
    return () => n._dispose()
  },
  get _v() {
    // Getters can't declare a `this` param (TS2784); narrow inline.
    const n = (this as unknown as ComputedFn<unknown>)._n
    const f = n._f
    if ((f & (F_DIRTY | F_PENDING)) !== 0) refreshComputed(n)
    else if ((f & (F_HAS_VALUE | F_DISPOSED)) === F_DISPOSED) readDisposedFirst(n)
    return n._value
  },
}
Object.setPrototypeOf(ComputedProto, Function.prototype)

/** A computed disposed before it ever evaluated: evaluate once, UNTRACKED. */
function readDisposedFirst(c: ComputedNode): void {
  c._f |= F_HAS_VALUE
  try {
    c._value = runUntracked(c._fn)
  } catch (err) {
    _errorHandler(err)
  }
}

/**
 * The read, bound to the node. Resolves its own marks first
 * (`refreshComputed`: re-evaluate if a source changed, else clear without
 * running), THEN links to the reader — so a change found by this very read
 * never re-queues the reader that is reading the new value right now.
 *
 * Kept this small on purpose so V8 inlines it into its callers; the cold
 * paths (resolution, disposal) live in module functions.
 */
function readComputed(this: ComputedNode): unknown {
  const f = this._f
  if ((f & (F_DIRTY | F_PENDING)) !== 0) refreshComputed(this)
  // Disposed before it ever evaluated: evaluate once, untracked. (A LIVE
  // computed is also unmarked without a value DURING its first evaluation —
  // a re-entrant read then returns `undefined`, it must not evaluate again.)
  else if ((f & (F_HAS_VALUE | F_DISPOSED)) === F_DISPOSED) readDisposedFirst(this)
  const sub = _t.e
  if (sub !== null) link(this, sub)
  return this._value
}

/**
 * @internal The graph node behind a computed callable (white-box tests and
 * the devtools walkers; not exported from the package entry).
 */
export function _computedNode(c: unknown): ComputedNode {
  return (c as ComputedFn<unknown>)._n
}

export function computed<T>(fn: () => T, options?: ComputedOptions<T>): Computed<T> {
  // `computed(async () => …)` returns `Computed<Promise<T>>`, silently breaking
  // every consumer expecting `Computed<T>`: the evaluation runs synchronously
  // and only tracks signals in the synchronous prefix.
  if (process.env.NODE_ENV !== 'production') {
    if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
      // oxlint-disable-next-line no-console
      console.warn(
        '[pyreon] computed() received an async function. The result type becomes `Computed<Promise<T>>`, and signal reads after the first `await` are NOT tracked. ' +
          'Use `createResource` for async-derived state, or compute synchronously over a signal that holds the awaited value.',
      )
    }
  }

  // The pull side reaches the effect and flush code from here (see `ComputedOps`
  // in graph.ts): installed before the first node exists, which is before
  // anything can be marked PENDING or depend on a computed.
  if (_cx.r !== refreshComputed) {
    _cx.k = checkDirty
    _cx.r = refreshComputed
  }
  const node = new ComputedNode(fn as () => unknown, (options?.equals as ComputedNode['_eq'] | undefined) ?? null)
  const read = readComputed.bind(node) as unknown as ComputedFn<T>
  Object.setPrototypeOf(read, ComputedProto)
  read._n = node

  if (process.env.NODE_ENV !== 'production') {
    // skipFrames=1: skip `computed`, capture the user's call site. The
    // callable is the registered identity (`_rdNodeId(c)`); the node is the
    // host the graph walkers read and the subscriber edges point at, and it
    // carries the same id so its evaluations record as this node's fires.
    const id = _rdRegister(
      read,
      'derived',
      node,
      node,
      undefined,
      options?.__sourceLocation ?? _captureCallerLocation(1),
    )
    Object.defineProperty(node, '__pxRdId', { value: id, enumerable: false, configurable: true })
  }

  // The scope stores the node itself; `stop()` calls its `_dispose`.
  // `_ownerScope()`: the current scope WITHOUT pinning it, else the server
  // request's scope.
  _ownerScope()?.add(node)
  return read as unknown as Computed<T>
}
