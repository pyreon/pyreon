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
 * clean caches. That pull side lives in computed.ts and is reached from here
 * through `_cx`, so it ships only with `computed()` (see `ComputedOps`).
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
 * An unbatched write whose only subscriber is one watcher skips the push and
 * runs it in place as the flush's first entry (`deliver`), in exactly the
 * state the queue would have dispatched it in. Marking alone opens no window.
 *
 * Every piece of hot module state lives on a `const` holder object, never a
 * module-level `let` (V8 pays a context load plus a hole check per access; see
 * `tests/no-hot-module-let.test.ts`).
 */
import type { ComputedNode } from './computed'

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
/**
 * A computed whose direct tier (`_d1` / `_d`) holds an updater: marking queues
 * it like a watcher. Kept in step with the tier by `ComputedProto.direct`.
 */
export const F_HAS_DIRECT = 2048

const F_MARKED = F_DIRTY | F_PENDING

// ─── Shapes ─────────────────────────────────────────────────────────────────

/** One dependency edge: `sub` read `dep`. */
export class Link {
  // `declare`: the constructor assigns every field, in this order, so a field
  // declaration would only emit (and run) a redundant `undefined` define first.
  declare dep: Source
  declare sub: Subscriber
  /** Next edge in `sub`'s dependency list. */
  declare nextDep: Link | null
  /** Neighbours in `dep`'s subscriber list. */
  declare prevSub: Link | null
  declare nextSub: Link | null

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

/** An effect, render binding or computed with direct updaters: runs from the flush queue. */
export interface WatcherNode extends Subscriber {
  run(): void
}

/** A plain function in the queue: a signal direct updater or `subscribe()` listener. */
type QueuedFn = (() => void) & { _f?: number }
type QueueEntry = WatcherNode | QueuedFn

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
 * Scratch stacks for `propagate` (`p`) and `checkDirty` (`c`). Entries are
 * popped as the walks climb back, so nothing is retained after a walk; each
 * walk works above the length it found (`base`), which makes nested walks safe.
 * Capacity is bounded by the deepest fan-out ever walked.
 */
export const _st: { p: Link[]; c: Link[] } = { p: [], c: [] }

export const MAX_PASSES = 32

/**
 * Computed resolution, reached from the effect and flush code through this
 * holder instead of an import: `checkDirty` / `refreshComputed` and the
 * evaluation code under them live in computed.ts, so a bundle (or a page) that
 * never creates a computed does not carry them. `computed()` installs both
 * before it creates its node.
 *
 * Until then the placeholders are unreachable, not merely harmless: only a
 * computed's descent marks a node PENDING (`propagate`), and only a computed
 * dependency carries the `_f` that sends a settle loop here.
 */
interface ComputedOps {
  /** `checkDirty`: did a dependency of this PENDING subscriber really change? */
  k: (sub: Subscriber) => boolean
  /** `refreshComputed`: resolve this marked computed. */
  r: (c: ComputedNode) => void
}

const _noOp = (): boolean => false

export const _cx: ComputedOps = { k: _noOp, r: _noOp }

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
export function enqueueNode(n: Subscriber): void {
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
 *
 * One iterative walk (alien-signals' shape): `next` is the continuation at the
 * current level, the scratch stack holds the continuations of the levels above
 * (only non-null ones — a level whose last node is being descended needs none).
 * `depth` counts the continuations this walk has on the stack (the stack is
 * touched only to push one). Level 0 pushes its continuation at depth 0; once
 * level 0 descends from its LAST node nothing of it is left, so from then on
 * a continuation popped back to depth 0 belongs to a deeper level (`zero`
 * becomes -1).
 */
export function propagate(head: Link): void {
  let depth = 0
  let zero = 0
  let l: Link = head
  let mark = F_DIRTY
  for (;;) {
    const sub: Subscriber = l.sub
    const next: Link | null = l.nextSub
    const f = sub._f
    if ((f & (F_MARKED | F_DISPOSED)) === 0 && ((f & F_RUNNING) === 0 || isConfirmed(l, sub))) {
      if ((f & F_COMPUTED) === 0) {
        // An unmarked watcher is never queued (see "Marks" in the header).
        sub._f = f | mark | F_QUEUED
        _q.push(sub as QueueEntry)
      } else {
        sub._f = f | mark
        if ((f & F_HAS_DIRECT) !== 0) enqueueNode(sub)
        const s = (sub as ComputedNode)._subs
        if (s !== null) {
          if (next !== null) {
            _st.p.push(next)
            depth++
          } else if (mark === F_DIRTY) zero = -1
          mark = F_PENDING
          l = s
          continue
        }
      }
    } else if (mark === F_DIRTY && (f & (F_MARKED | F_DISPOSED)) === F_PENDING) {
      // Already PENDING (reached through another path, its subtree already
      // marked and its watchers queued): record that a source it READ changed.
      sub._f = f | F_DIRTY
    }
    if (next !== null) l = next
    else {
      if (depth === 0) return
      l = _st.p.pop() as Link
      if (--depth === zero) mark = F_DIRTY
    }
  }
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
    if (df !== undefined && (df & F_MARKED) !== 0 && (df & F_DISPOSED) === 0) _cx.r(dep as ComputedNode)
  }
}

/** The first edge `sub`'s current run has not confirmed. */
export function unconfirmed(sub: Subscriber): Link | null {
  const tail = sub._depsTail
  return tail !== null ? tail.nextDep : sub._deps
}

// ─── Flush ──────────────────────────────────────────────────────────────────

function dispatch(e: QueueEntry): void {
  if (typeof e !== 'function') e.run()
  else e()
}

/**
 * A queue entry the flush will not run (a throw escaped, or `MAX_PASSES`):
 * clear its marks so a later write reaches it again. A watcher's marked
 * computed deps are resolved first — a computed left marked above a clean
 * subscriber would stop every later write's marking there.
 */
function settleDropped(e: QueueEntry): void {
  if (typeof e !== 'function') {
    const n = e
    if ((n._f & F_DISPOSED) === 0) settleUnread(n._deps)
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
  const prevSub = _t.e
  // Runs dispatched from the flush are top-level: a `_bind` re-run (which does
  // not open a tracking frame) must not link to whatever was tracking when the
  // outermost write happened.
  _t.e = null
  drainFrom(null, true, prevSub)
}

/**
 * The flush loop. `head` is a watcher `deliver` already ran OUT OF LINE as the
 * flush's first entry, without a queue slot (`headOk`: its run returned):
 * it belongs to pass 0 like any first entry, so a re-queue of itself opens
 * pass 1, and if its run threw nothing queued runs — everything is dropped,
 * itself first, exactly as a throw escaping the first queue entry would.
 * `_t.e` is already null; `prevSub` is restored at the end.
 */
function drainFrom(head: WatcherNode | null, headOk: boolean, prevSub: Subscriber | null): void {
  const q = _q
  let i = 0
  let passStart = 0
  let passes = 0
  // `head` while it still counts as a member of the current pass.
  let h = head
  try {
    if (headOk) {
      for (; i < q.length; i++) {
        const e = q[i] as QueueEntry
        const f = (e as Subscriber)._f
        if ((f & F_RAN) !== 0) {
          for (let k = passStart; k < i; k++) (q[k] as Subscriber)._f &= ~F_RAN
          if (h !== null) {
            h._f &= ~F_RAN
            h = null
          }
          passStart = i
          if (++passes >= MAX_PASSES) {
            warnMaxPasses(q.length - i)
            break
          }
        }
        ;(e as Subscriber)._f = (f & ~F_QUEUED) | F_RAN
        dispatch(e)
      }
    }
  } finally {
    // A head that threw is dropped like a queue entry that threw (first, as it
    // ran first); one that ran leaves the pass like its other members.
    if (h !== null) {
      if (headOk) h._f &= ~F_RAN
      else settleDropped(h)
    }
    for (let k = passStart; k < i && k < q.length; k++) (q[k] as Subscriber)._f &= ~F_RAN
    // Anything not run: a throw escaped a raw listener or render binding, or
    // MAX_PASSES dropped the rest. The length is re-read: settling can append.
    for (let k = i; k < q.length; k++) settleDropped(q[k] as QueueEntry)
    // A one-entry flush (one write, one effect) empties with `pop()`, which
    // keeps the backing store; `length = 0` drops it, and costs a slow store
    // even on an already-empty array.
    const n = q.length
    if (n === 1) q.pop()
    else if (n !== 0) q.length = 0
    _t.e = prevSub
    _b.d = 0
  }
}

/**
 * Deliver a change of a source to its tracked subscribers (`subs`) outside any
 * batch window, when no direct-tier entry has to run first. Marking runs no
 * user code, so it needs no window; one opens only if marking queued work.
 *
 * The dominant shape — one effect or render binding reading the source,
 * nothing marked, nothing running — skips the queue: it is marked as marking
 * would mark it (DIRTY) and as the flush marks the entry it dispatches (RAN,
 * not QUEUED), and run here as the flush's first entry, inside the window and
 * with no tracking frame, as the flush would. That is exactly the order the
 * queue gives (it would be the only entry): what its run queues runs after it
 * (`drainFrom`), a re-queue of itself counts as pass 1, and a throw drops the
 * rest.
 */
export function deliver(subs: Link): void {
  if (subs.nextSub === null) {
    const sub = subs.sub
    const f = sub._f
    // Unmarked implies unqueued (see "Marks" in the module header); a running
    // or computed subscriber takes the general walk.
    if ((f & (F_MARKED | F_RUNNING | F_DISPOSED | F_COMPUTED)) === 0) {
      sub._f = f | F_DIRTY | F_RAN
      _b.d = 1
      const prevSub = _t.e
      _t.e = null
      let ok = false
      try {
        ;(sub as WatcherNode).run()
        ok = true
      } finally {
        if (ok && _q.length === 0) {
          sub._f &= ~F_RAN
          _t.e = prevSub
          _b.d = 0
        } else drainFrom(sub as WatcherNode, ok, prevSub)
      }

      return
    }
  }
  propagate(subs)
  if (_q.length !== 0) {
    _b.d = 1
    drain()
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
