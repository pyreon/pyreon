import { enqueuePendingNotification, isBatching } from './batch'

let activeEffect: (() => void) | null = null

// The deps collector — every primitive that establishes a tracking scope
// (`effect` / `renderEffect` / `_bind` / `computed`) enters a FRAME via
// `runCollect` / `runVerify` below, which points this at the frame's own
// local `Set[]` BEFORE `activeEffect` goes live, so `trackSubscriber` always
// records deps inline here (no per-effect WeakMap). This is an INVARIANT, not
// a fast path: there is no fallback collector.
let _depsCollector: Set<() => void>[] | null = null

// ─── Verify-mode dep reuse (versioned-reuse, adapted to arrays) ──────────────
//
// The steady-state re-run of an effect/computed reads the SAME reactive
// sources in the SAME order as its previous run. The old design paid for that
// stability anyway: every re-run tore down the dep list (one `Set.delete` per
// dep) and rebuilt it (one `Set.add` + one array push per read). That is the
// per-rerun dep-Set teardown @preact/signals-core avoids with its versioned
// doubly-linked source nodes (mark all nodes `_version = -1`, reuse on
// re-read, unsubscribe only what stayed -1).
//
// Pyreon's equivalent keeps the persistent per-effect `deps: Set[]` array as
// the "source list" and VERIFIES it positionally instead of rebuilding it:
//
//   - `runVerify(owner, deps, fn)` enters verify mode: `_verifyOwner` is the
//     subscriber identity (the effect's `run` / computed's `recompute`) and
//     `_verifyIndex` walks the deps array as reads arrive.
//   - Steady state: each `trackSubscriber` is ONE array-identity compare +
//     increment — no `Set.add`, no `Set.delete`, no push, no allocation. The
//     owner never leaves the subscriber Sets, so `_s` membership is stable
//     across re-runs (better for iteration-cap safety in notify paths too).
//   - Divergence (a read that doesn't match the recorded position — new dep,
//     reorder, branch flip): `divergeVerify` unsubscribes the unconfirmed
//     tail, repairs the confirmed prefix (duplicate-read aliasing hazard —
//     see below), and drops to plain collect mode for the rest of the run.
//     Cost on that run ≈ the old full-teardown path; subsequent runs verify
//     the new shape.
//   - Shrink (fn read FEWER deps and never diverged): handled at frame exit
//     in `runVerify` — unsubscribe + truncate the stale tail, then repair the
//     prefix for the same aliasing hazard.
//
// Duplicate-read aliasing hazard: the deps array may contain the SAME Set
// twice (fn read one signal twice → two pushes in collect mode). Deleting the
// owner from a stale TAIL entry would then also remove it from a CONFIRMED
// prefix position that aliases the same Set. Both removal sites therefore
// re-`add` the owner across the confirmed prefix afterwards (idempotent, cold
// path only).
//
// Why not literal linked-list Nodes (the preact shape): subscriber identity
// in Pyreon is a bare `() => void` stored in `_s: Set` — the batch flush
// routes on that identity (`_recomputes` WeakSet), `signal.subscribe`,
// devtools, and `wrapSignal` all consume the Set shape, and `_set`'s inline
// single-subscriber dispatch reads `_s` directly. Node objects would force a
// rewrite of that tuned notify path and add one allocation per dependency
// edge; positional verify gets the same steady-state O(1)-reuse with zero
// signal-side changes.
let _verifyOwner: (() => void) | null = null
let _verifyIndex = 0

/**
 * Subscriber host — any reactive source that can have downstream subscribers.
 * Signals, computeds, and createSelector buckets all implement this interface.
 * The Set is created lazily — only allocated when an effect actually tracks this source.
 */
export interface SubscriberHost {
  /** @internal subscriber set — null until first tracked by an effect */
  _s: Set<() => void> | null
}

/**
 * Register the active effect as a subscriber of the given reactive source.
 * The subscriber Set is created lazily on the host — sources read only outside
 * effects never allocate a Set.
 */
export function trackSubscriber(host: SubscriberHost) {
  const ae = activeEffect
  if (ae === null) return
  if (_verifyOwner !== null) {
    // Verify mode — steady-state re-run: one identity compare, no Set ops.
    const deps = _depsCollector as Set<() => void>[]
    if (_verifyIndex < deps.length && deps[_verifyIndex] === host._s) {
      _verifyIndex++
      return
    }
    divergeVerify(host, ae)
    return
  }
  if (!host._s) host._s = new Set()
  host._s.add(ae)
  // INVARIANT (see _depsCollector docs): a collector is ALWAYS set while
  // activeEffect is live — `runCollect`/`runVerify` are the only ways to set
  // activeEffect and both install a collector, so no null guard is needed
  // (a guard here would be an uncoverable branch).
  ;(_depsCollector as Set<() => void>[]).push(host._s)
}

/**
 * Cold path — a verified re-run read a source that doesn't match the recorded
 * position (new dep / reorder / branch flip). Unsubscribe the unconfirmed
 * tail, repair the confirmed prefix (duplicate-alias hazard), and fall back
 * to plain collect mode for the remainder of this run.
 */
function divergeVerify(host: SubscriberHost, owner: () => void): void {
  const deps = _depsCollector as Set<() => void>[]
  const confirmed = _verifyIndex
  // 1. Unsubscribe the unconfirmed tail — those positions are stale-dep
  //    candidates; any that get re-read later in this run re-subscribe via
  //    the collect path below.
  for (let j = confirmed; j < deps.length; j++) (deps[j] as Set<() => void>).delete(owner)
  deps.length = confirmed
  // 2. Repair the confirmed prefix — step 1 may have deleted the owner from a
  //    Set that ALSO sits at a confirmed position (duplicate reads of the
  //    same source alias the same Set).
  for (let j = 0; j < confirmed; j++) (deps[j] as Set<() => void>).add(owner)
  // 3. Exit verify mode — the rest of this run collects normally onto the
  //    preserved confirmed prefix.
  _verifyOwner = null
  // 4. Record the current (diverging) read.
  if (!host._s) host._s = new Set()
  host._s.add(owner)
  deps.push(host._s)
}

/**
 * Enter a COLLECT tracking frame: `fn`'s reactive reads subscribe `owner` and
 * append their subscriber Sets to `deps`. Used for FIRST runs (no previous
 * dep list to verify). Fully re-entrant — saves and restores the complete
 * tracking frame (activeEffect + collector + verify state), so nested
 * evaluations (an effect reading a dirty computed that reads another
 * computed…) each get an isolated frame and the outer frame resumes exactly
 * where it left off.
 */
export function runCollect<T>(owner: () => void, deps: Set<() => void>[], fn: () => T): T {
  const prevEffect = activeEffect
  const prevDeps = _depsCollector
  const prevOwner = _verifyOwner
  const prevIndex = _verifyIndex
  activeEffect = owner
  _depsCollector = deps
  _verifyOwner = null
  try {
    return fn()
  } finally {
    activeEffect = prevEffect
    _depsCollector = prevDeps
    _verifyOwner = prevOwner
    _verifyIndex = prevIndex
  }
}

/**
 * Enter a VERIFY tracking frame: `fn`'s reactive reads are checked
 * positionally against the previous run's `deps`. Steady state (same sources,
 * same order) costs one identity compare per read — no Set operations, no
 * allocations, and the owner never leaves its subscriber Sets. See the
 * verify-mode design comment above for divergence/shrink semantics.
 */
export function runVerify<T>(owner: () => void, deps: Set<() => void>[], fn: () => T): T {
  const prevEffect = activeEffect
  const prevDeps = _depsCollector
  const prevOwner = _verifyOwner
  const prevIndex = _verifyIndex
  activeEffect = owner
  _depsCollector = deps
  _verifyOwner = owner
  _verifyIndex = 0
  try {
    const result = fn()
    // Shrink: fn completed still in verify mode but read FEWER deps than the
    // previous run — unsubscribe + truncate the stale tail, then repair the
    // confirmed prefix (duplicate-alias hazard, same as divergeVerify).
    // Deliberately NOT in the finally: if fn threw, the unverified tail stays
    // subscribed + recorded (memory-safe — dispose still removes everything),
    // and the next run re-verifies from index 0.
    if (_verifyOwner !== null && _verifyIndex < deps.length) {
      for (let j = _verifyIndex; j < deps.length; j++) (deps[j] as Set<() => void>).delete(owner)
      deps.length = _verifyIndex
      for (let j = 0; j < _verifyIndex; j++) (deps[j] as Set<() => void>).add(owner)
    }
    return result
  } finally {
    activeEffect = prevEffect
    _depsCollector = prevDeps
    _verifyOwner = prevOwner
    _verifyIndex = prevIndex
  }
}

export function notifySubscribers(subscribers: Set<() => void>) {
  if (subscribers.size === 0) return
  // Single-subscriber fast path: avoid any iteration overhead.
  if (subscribers.size === 1) {
    const sub = subscribers.values().next().value as () => void
    if (isBatching()) enqueuePendingNotification(sub)
    else sub()
    return
  }
  if (isBatching()) {
    // Effects are queued not run inline — no re-entrancy risk, iterate the live Set directly.
    for (const sub of subscribers) enqueuePendingNotification(sub)
  } else {
    // Effects run inline. Under verify-mode dep reuse an effect's re-run no
    // longer removes + re-adds itself (steady state), so the live Set is
    // stable during iteration in the common case; the original-size cap stays
    // as the guard for DIVERGING re-runs (which still delete + re-add) and
    // for raw subscribe() listeners that mutate the set.
    const originalSize = subscribers.size
    let i = 0
    for (const sub of subscribers) {
      if (i >= originalSize) break
      sub()
      i++
    }
  }
}

// Thread-local collector for nested effects — captures effect() calls made
// inside another effect's fn() body so the parent can dispose them on
// re-run / disposal. Lives here (not in effect.ts) so `runUntracked` can
// suspend it in lock-step with `activeEffect` — the semantic is "fully
// isolate this work from the outer reactive context, including the
// nested-effect auto-cleanup chain."
//
// Without suspending the collector in `runUntracked`, child component
// effects created inside `mountFor`'s `runUntracked` wrap (around
// child mounts) would be auto-registered as inner effects of the For's
// effect — and disposed on the For's NEXT re-run (W23 from the kanban
// audit): after the For source signal first re-fires, child component
// effects silently lose every subscription they had.
//
// Untyped here (`unknown[]`) to avoid a circular dep with effect.ts. The
// consumer is effect.ts which knows the real `Effect[]` shape (including the
// lazy-window sentinel — see effect.ts `LAZY_INNER`).
let _innerEffectCollector: unknown[] | null = null

export function getInnerEffectCollector(): unknown[] | null {
  return _innerEffectCollector
}

export function setInnerEffectCollector(c: unknown[] | null): void {
  _innerEffectCollector = c
}

/** Read signals without subscribing AND prevent auto-registration of new
 * effects with the surrounding outer effect's inner-effect collector.
 * Alias: `untrack`. */
export function runUntracked<T>(fn: () => T): T {
  const prevActive = activeEffect
  const prevCollector = _innerEffectCollector
  activeEffect = null
  _innerEffectCollector = null
  try {
    return fn()
  } finally {
    activeEffect = prevActive
    _innerEffectCollector = prevCollector
  }
}
