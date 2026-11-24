/**
 * The propagation core: a dependency graph of `Link` edges, push-marking on
 * write, pull-checking on read, and one flush queue.
 *
 * ─── The graph ───────────────────────────────────────────────────────────────
 * Every SOURCE (signal, computed, `createSelector` key bucket) keeps its
 * subscribers as an intrusive doubly linked list (`_subs` / `_subsTail`).
 * Every SUBSCRIBER (computed, effect, render binding) keeps its dependencies as
 * a singly linked list (`_deps`) plus a CURSOR (`_depsTail`). One `Link` object
 * per edge sits in both lists: removing an edge is O(1) on the source side, and
 * a subscriber only ever drops edges from its own list's tail or as a whole.
 *
 * ─── Marks ───────────────────────────────────────────────────────────────────
 * Two bits say how stale a subscriber is:
 *   - `DIRTY`: a source it read changed — it must re-evaluate.
 *   - `PENDING`: something upstream MAY have changed — resolve its deps first.
 * A write marks the written source's direct subscribers DIRTY and everything
 * further down PENDING (`propagate`). Marking is TOTAL — it never stops early,
 * except at a node that is already marked (that is what makes a diamond linear)
 * — and it schedules only WATCHERS (effects, render bindings, computeds with
 * direct updaters). Nothing evaluates during a write.
 *
 * A read of a marked computed resolves it (`refreshComputed`): DIRTY
 * re-evaluates; PENDING walks the deps bottom-up with an explicit stack
 * (`checkDirty`), evaluating only the computeds whose own deps really changed.
 * A node whose deps all came back unchanged is cleared WITHOUT running — the
 * exact equality cutoff. No evaluation ever recurses through another node's
 * read: `checkDirty` evaluates bottom-up, so each getter's inner reads hit
 * clean caches.
 *
 * Two invariants the walks rely on instead of re-checking:
 *   - A watcher (effect, render binding) is QUEUED only together with a mark:
 *     marking sets both at once, and both are cleared before or as it runs (the
 *     flush and `settleFirstRun` take the queue flag off, then the run clears
 *     the marks; `settleDropped` clears both).
 *   - A marked, live subscriber holds a dependency edge: marking reaches it
 *     through one, a running subscriber is marked only through an edge its
 *     run already confirmed, and a completed run drops only unconfirmed edges.
 *
 * Signals carry no flags (a signal stays at its pre-graph size). A source
 * change is recorded only as DIRTY on its direct subscribers, which is why
 * `propagate` upgrades an already-PENDING direct subscriber to DIRTY.
 *
 * ─── Dependency tracking ────────────────────────────────────────────────────
 * A run resets its cursor and every tracked read calls `link`: a read of the
 * same source as the next recorded edge just advances the cursor (one compare,
 * no allocation — the steady state). A read that diverges inserts a new edge
 * at the cursor; a successful run then drops every edge after the cursor
 * (`purgeDeps`). A run that THROWS drops nothing: it keeps every dependency of
 * the last completed run until a run completes, and resolves any stale mark
 * among the ones it did not read (`settleUnread`).
 *
 * ─── Flush ──────────────────────────────────────────────────────────────────
 * One array queue. Watchers are appended in depth-first subscription order as
 * marking reaches them; signal direct updaters and `subscribe()` listeners
 * (plain functions) are appended by the write itself. The flush runs them in
 * order, holding the batch depth at 1 so writes from a run append instead of
 * nesting. A watcher that is reached again after it ran in the current pass
 * opens a new pass; more than `MAX_PASSES` passes drops the rest of the queue
 * with a message (an effect writing a signal it reads, without a guard).
 *
 * Every piece of hot module state lives on a `const` holder object, never a
 * module-level `let` (V8 pays a context load plus a hole check per access; see
 * `tests/no-hot-module-let.test.ts`).
 */
import { _errorHandler } from './errors'
import { _rdRecordFire } from './reactive-devtools'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Flags ────────────────────────────────────────────────────────────────────
// Plain numbers (not a `const enum`, which does not inline across modules under
// isolated transpilation). Kept in this one module where the hot paths read them.

/** A source this node read changed: it must re-evaluate. */
export const F_DIRTY = 1
/** Something upstream may have changed: resolve the deps before deciding. */
export const F_PENDING = 2
/** In the flush queue (dedup). */
export const F_QUEUED = 4
/** Evaluating / running right now. */
export const F_RUNNING = 8
/** Disposed: never runs, never re-links. */
export const F_DISPOSED = 16
/** The node is a computed (a source AND a subscriber). */
export const F_COMPUTED = 32
/** A computed that has evaluated at least once. */
export const F_HAS_VALUE = 64
/** A computed whose value changed since its direct updaters last fired. */
export const F_DIRECT_STALE = 128
/** Ran in the current flush pass (pass counting). */
export const F_RAN = 256
/** A computed being dispatched as a watcher right now (its own change must not re-queue it). */
export const F_NOTIFYING = 512
/** A `_bind` render binding: re-runs skip tracking (static deps). */
export const F_STATIC = 1024

const F_MARKED = F_DIRTY | F_PENDING

// ─── Shapes ─────────────────────────────────────────────────────────────────

/** One dependency edge: `sub` read `dep`. */
export class Link {
  dep: Source
  sub: Subscriber
  /** Next edge in `sub`'s dependency list. */
  nextDep: Link | null
  /** Neighbours in `dep`'s subscriber list. */
  prevSub: Link | null
  nextSub: Link | null

  constructor(dep: Source, sub: Subscriber, prevSub: Link | null) {
    this.dep = dep
    this.sub = sub
    this.nextDep = null
    this.prevSub = prevSub
    this.nextSub = null
  }
}

/**
 * Anything that can be read reactively: a signal, a computed, a selector key
 * bucket. Only computeds also carry `_f`.
 */
export interface Source {
  /** @internal first subscriber edge */
  _subs: Link | null
  /** @internal last subscriber edge (appends keep subscription order) */
  _subsTail: Link | null
}

/** Anything that reads sources: a computed, an effect, a render binding. */
export interface Subscriber {
  /** @internal flags (see `F_*`) */
  _f: number
  /** @internal first dependency edge */
  _deps: Link | null
  /** @internal cursor: the last edge confirmed by the current run */
  _depsTail: Link | null
}

/** A computed node: callable read function carrying both sides of the graph. */
export interface ComputedNode extends Source, Subscriber {
  (): unknown
  _value: unknown
  _fn: () => unknown
  _eq: ((prev: unknown, next: unknown) => boolean) | null
  _d1: (() => void) | null
  _d: Set<() => void> | null
}

/** An effect or render binding: runs from the flush queue. */
export interface WatcherNode extends Subscriber {
  run(): void
}

/** A plain function in the queue: a signal direct updater or `subscribe()` listener. */
type QueuedFn = (() => void) & { _f?: number }
type QueueEntry = WatcherNode | ComputedNode | QueuedFn

// ─── Hot module state ───────────────────────────────────────────────────────

/**
 * The tracking frame. Field names are one letter on purpose: a minifier
 * renames a `let` but never a property.
 */
interface TrackingFrame {
  /** The subscriber a tracked read links to — `null` outside any tracking scope. */
  e: Subscriber | null
  /**
   * Thread-local collector for nested effects — captures `effect()` calls made
   * inside another effect's body so the parent can dispose them on re-run.
   * Lives here so `runUntracked` can suspend it in lock-step with `e`: without
   * that, child component effects created inside `mountFor`'s `runUntracked`
   * wrap would register as inner effects of the For's effect and be disposed
   * on its NEXT re-run, silently dropping every subscription they had.
   */
  n: unknown[] | null
}

export const _t: TrackingFrame = { e: null, n: null }

/** Batch state. */
interface BatchState {
  /** Open batch windows (explicit `batch()`, inline write windows, first runs, the flush). */
  d: number
}

export const _b: BatchState = { d: 0 }

/**
 * The flush queue. Entries are appended while a batch window is open and run
 * by `drain()` when the outermost window closes; `drain` empties it in its
 * `finally`, so nothing is retained past a flush.
 */
export const _q: QueueEntry[] = []

/**
 * Scratch stacks for `propagateDeep` (`p`) and `checkDirty` (`c`). Entries are
 * popped as the walks climb back, so nothing is retained after a walk; each
 * walk works above the length it found (`base`), which makes nested walks safe.
 * Capacity is bounded by the deepest fan-out ever walked.
 */
const _st: { p: Link[]; c: Link[] } = { p: [], c: [] }

export const MAX_PASSES = 32

// ─── Links ──────────────────────────────────────────────────────────────────

/** Remove `l` from its source's subscriber list. */
function unlinkSub(l: Link): void {
  const dep = l.dep
  const p = l.prevSub
  const n = l.nextSub
  if (n !== null) n.prevSub = p
  else dep._subsTail = p
  if (p !== null) p.nextSub = n
  else dep._subs = n
}

/**
 * Record that `sub` read `dep` in its current run. Steady state (the same
 * source as the next recorded edge) advances the cursor and allocates nothing.
 */
export function link(dep: Source, sub: Subscriber): void {
  const prev = sub._depsTail
  // The same source read again right after itself (`a(); a()`): one edge.
  if (prev !== null && prev.dep === dep) return
  const next = prev !== null ? prev.nextDep : sub._deps
  if (next !== null) {
    if (next.dep === dep) {
      sub._depsTail = next
      return
    }
  } else {
    // Nothing unconfirmed is left, so every edge `sub` holds was read by this
    // run: a source whose newest edge comes from `sub` was read earlier in it
    // (`a(); b(); a()`) and keeps its one edge.
    const last = dep._subsTail
    if (last !== null && last.sub === sub) return
  }
  // A new source, a reorder or a branch flip: insert the edge at the cursor.
  // The unconfirmed tail after it stays linked until the run completes
  // (`purgeDeps` drops it then); a run that throws keeps it.
  const tail = dep._subsTail
  const nl = new Link(dep, sub, tail)
  nl.nextDep = next
  if (prev !== null) prev.nextDep = nl
  else sub._deps = nl
  sub._depsTail = nl
  if (tail !== null) tail.nextSub = nl
  else dep._subs = nl
  dep._subsTail = nl
}

/** Link `dep` to the subscriber of the current tracking frame, if any. */
export function trackSubscriber(dep: Source): void {
  const sub = _t.e
  if (sub !== null) link(dep, sub)
}

/** Drop every edge after the cursor — the end of a successful run. */
export function purgeDeps(sub: Subscriber): void {
  const tail = sub._depsTail
  let l = tail !== null ? tail.nextDep : sub._deps
  if (l === null) return
  if (tail !== null) tail.nextDep = null
  else sub._deps = null
  do {
    unlinkSub(l)
    l = l.nextDep
  } while (l !== null)
}

/** Drop every edge of `sub` — disposal. */
export function unlinkAllDeps(sub: Subscriber): void {
  let l = sub._deps
  sub._deps = null
  sub._depsTail = null
  while (l !== null) {
    unlinkSub(l)
    l = l.nextDep
  }
}

/**
 * Whether `l` was already read by `sub`'s CURRENT run (it sits at or before
 * the cursor). Asked only for a subscriber that is running when a mark
 * reaches it: an edge the run has not re-read yet must not re-queue it,
 * because the run will read the new value itself (or not read it at all).
 */
function isConfirmed(l: Link, sub: Subscriber): boolean {
  const tail = sub._depsTail
  if (tail === null) return false
  // A non-null cursor is always an edge of `sub`'s own list (`link` sets it to
  // an edge it inserted or advanced to; `purgeDeps` keeps it), so this walk
  // meets `tail` before running off the end.
  let x = sub._deps as Link
  while (x !== l) {
    if (x === tail) return false
    x = x.nextDep as Link
  }

  return true
}

// ─── Queue ──────────────────────────────────────────────────────────────────

/** Append a watcher node (effect, binding, computed with direct updaters). */
function enqueueNode(n: Subscriber): void {
  const f = n._f
  if ((f & F_QUEUED) === 0) {
    n._f = f | F_QUEUED
    _q.push(n as QueueEntry)
  }
}

/**
 * Append a plain function (a signal direct updater or `subscribe()`
 * listener). Its queue flag is an own property created on first enqueue, so a
 * function that is never queued stays a bare function.
 */
export function enqueueFn(fn: () => void): void {
  const q = fn as QueuedFn
  const f = q._f
  if (f === undefined) {
    q._f = F_QUEUED
    _q.push(q)
  } else if ((f & F_QUEUED) === 0) {
    q._f = f | F_QUEUED
    _q.push(q)
  }
}

// ─── Marking ────────────────────────────────────────────────────────────────

/**
 * A source changed: mark its direct subscribers DIRTY and everything below
 * PENDING, queueing every watcher reached. Runs no user code.
 */
export function propagate(head: Link): void {
  let l: Link | null = head
  do {
    const sub: Subscriber = l.sub
    const f = sub._f
    if ((f & (F_MARKED | F_DISPOSED)) === 0) {
      if ((f & F_RUNNING) === 0 || isConfirmed(l, sub)) {
        if ((f & F_COMPUTED) !== 0) {
          sub._f = f | F_DIRTY
          const c = sub as ComputedNode
          if (c._d1 !== null || c._d !== null) enqueueNode(c)
          const s = c._subs
          if (s !== null) propagateDeep(s)
        } else {
          // An unmarked watcher is never queued (see "Marks" in the header).
          sub._f = f | F_DIRTY | F_QUEUED
          _q.push(sub as QueueEntry)
        }
      }
    } else if ((f & (F_DIRTY | F_DISPOSED)) === 0) {
      // Already PENDING (reached through another path, its subtree already
      // marked and its watchers queued): record that a source it READ changed.
      sub._f = f | F_DIRTY
    }
    l = l.nextSub
  } while (l !== null)
}

/** Mark PENDING below a changed node — iterative, stops at marked nodes. */
function propagateDeep(head: Link): void {
  const stack = _st.p
  const base = stack.length
  let l: Link | null = head
  for (;;) {
    if (l === null) {
      if (stack.length === base) return
      l = stack.pop() as Link
      continue
    }
    const sub: Subscriber = l.sub
    const next: Link | null = l.nextSub
    const f = sub._f
    if ((f & (F_MARKED | F_DISPOSED)) === 0 && ((f & F_RUNNING) === 0 || isConfirmed(l, sub))) {
      if ((f & F_COMPUTED) !== 0) {
        sub._f = f | F_PENDING
        const c = sub as ComputedNode
        if (c._d1 !== null || c._d !== null) enqueueNode(c)
        const s = c._subs
        if (s !== null) {
          if (next !== null) stack.push(next)
          l = s
          continue
        }
      } else {
        sub._f = f | F_PENDING | F_QUEUED
        _q.push(sub as QueueEntry)
      }
    }
    l = next
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
export function updateComputed(c: ComputedNode): boolean {
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
  purgeDeps(c)
  if (same) {
    c._f = f
    return false
  }
  c._value = next
  c._f = f | F_HAS_VALUE

  return (f0 & F_HAS_VALUE) !== 0
}

/**
 * A run that THREW keeps the dependencies it did not reach (`link` drops them
 * only on divergence, `purgeDeps` only after a successful run). Resolve any of
 * them still marked: a dependency left marked above a subscriber that is now
 * clean would stop every later write's marking at itself, and the subscriber
 * would never be reached again. Starts at `from` (the first edge the run did
 * not confirm; a static binding passes its first edge). Evaluations report
 * their own errors, so this never throws.
 */
export function settleUnread(from: Link | null): void {
  for (let l = from; l !== null; l = l.nextDep) {
    const dep = l.dep as Source & Partial<ComputedNode>
    const df = dep._f
    if (df !== undefined && (df & F_MARKED) !== 0 && (df & F_DISPOSED) === 0) refreshComputed(dep as ComputedNode)
  }
}

/** The first edge `sub`'s current run has not confirmed. */
export function unconfirmed(sub: Subscriber): Link | null {
  const tail = sub._depsTail
  return tail !== null ? tail.nextDep : sub._deps
}

/** After a computed's value changed: upgrade its readers, and its direct updaters. */
function computedChanged(c: ComputedNode): void {
  const subs = c._subs
  if (subs !== null) shallowPropagate(subs)
  if (c._d1 !== null || c._d !== null) {
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
}

/**
 * Resolve a marked computed: re-evaluate it if a source it read changed, else
 * clear the mark without running it. Never reached for a disposed computed:
 * disposal clears the marks, nothing marks a disposed node, and every caller
 * acts only on a marked one.
 */
export function refreshComputed(c: ComputedNode): void {
  if ((c._f & F_DIRTY) !== 0 || checkDirty(c)) {
    if (updateComputed(c)) computedChanged(c)
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
            computedChanged(dep as ComputedNode)
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
      if (dirty) {
        if (updateComputed(sub as ComputedNode)) {
          computedChanged(sub as ComputedNode)
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

    return dirty
  }
}

// ─── Flush ──────────────────────────────────────────────────────────────────

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

function dispatch(e: QueueEntry): void {
  if (typeof e !== 'function') (e as WatcherNode).run()
  else if (((e as QueuedFn)._f! & F_COMPUTED) !== 0) runComputedWatcher(e as ComputedNode)
  else (e as QueuedFn)()
}

/**
 * A queue entry the flush will not run (a throw escaped, or `MAX_PASSES`):
 * clear its marks so a later write reaches it again. A watcher's marked
 * computed deps are resolved first — a computed left marked above a clean
 * subscriber would stop every later write's marking there.
 */
function settleDropped(e: QueueEntry): void {
  if (typeof e !== 'function' || ((e as QueuedFn)._f! & F_COMPUTED) !== 0) {
    const n = e as Subscriber
    if ((n._f & F_DISPOSED) === 0) {
      for (let l = n._deps; l !== null; l = l.nextDep) {
        const dep = l.dep as Source & Partial<ComputedNode>
        const df = dep._f
        if (df !== undefined && (df & F_MARKED) !== 0) refreshComputed(dep as ComputedNode)
      }
    }
    n._f &= ~(F_MARKED | F_QUEUED | F_RAN | F_DIRECT_STALE)
  } else (e as QueuedFn)._f = 0
}

function warnMaxPasses(dropped: number): void {
  if (process.env.NODE_ENV !== 'production') {
    // oxlint-disable-next-line no-console
    console.warn(
      '[pyreon] batch effect flush exceeded MAX_PASSES (32) — possible infinite re-enqueue loop. ' +
        `${dropped} pending effects dropped. ` +
        'Common cause: an effect that writes to a signal it also reads, without a guard. ' +
        'See packages/core/reactivity/src/graph.ts for the multi-pass flush contract.',
    )
  } else {
    // Surface in production TOO — dropping queued effects leaves the reactive
    // graph inconsistent (some ran, some didn't), a silent correctness failure.
    // oxlint-disable-next-line no-console
    console.error('[pyreon] MAX_PASSES exceeded — effects dropped (effect writing a signal it reads?)')
  }
}

/**
 * Run the queue to empty. The caller holds `_b.d = 1` (so writes from a run
 * append instead of flushing nested); this resets it to 0 in its `finally`.
 *
 * Passes: an entry that already ran in the current pass opens the next one
 * (an effect re-queued by its own write, `ErrorBoundary`'s self-dispatch).
 * Distinct entries appended mid-pass stay in the pass, so a long chain of
 * different effects each writing the next never counts as a loop.
 */
export function drain(): void {
  const q = _q
  const prevSub = _t.e
  // Runs dispatched from the flush are top-level: a `_bind` re-run (which does
  // not open a tracking frame) must not link to whatever was tracking when the
  // outermost write happened.
  _t.e = null
  let i = 0
  let passStart = 0
  let passes = 0
  try {
    for (; i < q.length; i++) {
      const e = q[i] as QueueEntry
      const f = (e as Subscriber)._f
      if ((f & F_RAN) !== 0) {
        for (let k = passStart; k < i; k++) (q[k] as Subscriber)._f &= ~F_RAN
        passStart = i
        if (++passes >= MAX_PASSES) {
          warnMaxPasses(q.length - i)
          break
        }
      }
      ;(e as Subscriber)._f = (f & ~F_QUEUED) | F_RAN
      dispatch(e)
    }
  } finally {
    for (let k = passStart; k < i && k < q.length; k++) (q[k] as Subscriber)._f &= ~F_RAN
    // Anything not run: a throw escaped a raw listener or render binding, or
    // MAX_PASSES dropped the rest. The length is re-read: settling can append.
    for (let k = i; k < q.length; k++) settleDropped(q[k] as QueueEntry)
    // A one-entry flush (one write, one effect) empties with `pop()`, which
    // keeps the backing store; `length = 0` drops it. The queue is never empty
    // here: a drain starts with an entry and nothing removes the entry it runs.
    if (q.length === 1) q.pop()
    else q.length = 0
    _t.e = prevSub
    _b.d = 0
  }
}

/**
 * After a watcher's FIRST run (which runs inside its own batch window): if the
 * run re-queued the watcher itself — it wrote a signal it had already read —
 * re-run it now, iteratively, until it settles. So the re-run happens right
 * after the first run returns and before `effect()` / `renderEffect()` returns,
 * in the same surrounding context as the first run (design D9), even when the
 * first run is nested inside another window. Capped by MAX_PASSES like the
 * flush. Other work the first run queued waits for the outermost close.
 */
export function settleFirstRun(node: WatcherNode): void {
  let passes = 0
  for (;;) {
    const f = node._f
    if ((f & (F_QUEUED | F_DISPOSED)) !== F_QUEUED) return
    // Take its queue entry out (it was pushed during the run just finished, so
    // it sits after anything a flush in progress is dispatching).
    const q = _q
    const at = q.lastIndexOf(node as QueueEntry)
    if (at !== -1) q.splice(at, 1)
    if (++passes >= MAX_PASSES) {
      warnMaxPasses(1)
      settleDropped(node as QueueEntry)
      return
    }
    node._f = f & ~F_QUEUED
    node.run()
  }
}

/** Close a batch window opened with `_b.d++`; flushes at the outermost close. */
export function endBatch(): void {
  if (--_b.d === 0 && _q.length !== 0) {
    _b.d = 1
    drain()
  }
}

// ─── Untracked reads, frame helpers ─────────────────────────────────────────

/** Read signals without subscribing AND prevent auto-registration of new
 * effects with the surrounding outer effect's inner-effect collector.
 * Alias: `untrack`. */
export function runUntracked<T>(fn: () => T): T {
  const prevActive = _t.e
  const prevCollector = _t.n
  _t.e = null
  _t.n = null
  try {
    return fn()
  } finally {
    _t.e = prevActive
    _t.n = prevCollector
  }
}
