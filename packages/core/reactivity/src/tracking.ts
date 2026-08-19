import { enqueuePendingNotification, isBatching } from './batch'

let activeEffect: (() => void) | null = null

// The deps collector — every primitive that establishes a tracking scope
// (`effect` / `renderEffect` / `_bind` / `computed`) enters a FRAME via
// `runCollect` / `runVerify` below, which points this at the frame's own
// local `Set[]` BEFORE `activeEffect` goes live, so `trackSubscriber` always
// records deps inline here (no per-effect WeakMap). This is an INVARIANT, not
// a fast path: there is no fallback collector.
let _depsCollector: SubscriberHost[] | null = null

// ─── Verify-mode dep reuse ───────────────────────────────────────────────────
//
// A steady-state re-run reads the SAME sources in the SAME order, so instead of
// tearing down and rebuilding the dep list every time we keep the persistent
// per-effect `deps: SubscriberHost[]` and VERIFY it positionally:
//
//   - `runVerify(owner, deps, fn)` walks `deps` as reads arrive. Steady state is
//     ONE array-identity compare + increment per read: no Set.add, no
//     Set.delete, no push, no allocation, and the owner never leaves its
//     subscriber storage.
//   - Divergence (new dep / reorder / branch flip) → `divergeVerify` unsubscribes
//     the unconfirmed tail, repairs the confirmed prefix, and drops to collect
//     mode for the rest of the run.
//   - Shrink (read FEWER deps, never diverged) → handled at frame exit.
//
// `deps` records the HOST, not the host's subscriber Set. That is what lets the
// storage be two-tier (`_s1` inline slot / `_s` Set) — under the tier there is
// no Set object to record while a source has exactly one subscriber. It also
// makes verify mode strictly MORE stable than a Set-identity compare was: the
// `_suspendSoleSubscriber` container swap used to change `host._s`'s identity
// and spuriously diverge every effect tracking that signal; the host's identity
// never changes.
//
// Duplicate-read aliasing hazard: `deps` may hold the SAME host twice (one
// signal read twice). Removing the owner via a stale TAIL entry would also
// remove it from a CONFIRMED prefix position aliasing that host — so both
// removal sites re-`addSubscriber` across the confirmed prefix afterwards
// (idempotent, cold path).
//
// Why not preact-style linked-list Nodes: subscriber identity here is a bare
// `() => void` in `_s1`/`_s`, which the batch router, `signal.subscribe`,
// devtools and `_set`'s inline dispatch all consume. Nodes would force a rewrite
// of that tuned notify path plus one allocation per dependency edge.
//
// Mode is encoded in the SIGN of `_verifyIndex` (-1 = collect, >=0 = verify at
// that position) — folding the former separate owner flag into the index drops
// one module-var read from the hottest tracked-read line.
let _verifyIndex = -1

/**
 * Subscriber host — any reactive source that can have downstream subscribers.
 * Signals, computeds, and createSelector buckets all implement this interface.
 * The Set is created lazily — only allocated when an effect actually tracks this source.
 */
export interface SubscriberHost {
  /**
   * @internal SOLE tracking subscriber — inline slot, no Set allocation.
   * Mirrors the `_d1`/`_d` two-tier idiom already used for direct updaters.
   *
   * INVARIANT: `_s1 !== null` implies `_s === null`. The second subscriber
   * PROMOTES `_s1` into a fresh `_s` Set and nulls the slot; there is no
   * demotion (a Set that shrinks back to one entry stays a Set).
   */
  _s1: (() => void) | null
  /** @internal subscriber Set — allocated on PROMOTION from `_s1` (>=2 subscribers) */
  _s: Set<() => void> | null
}

/**
 * Add `sub` to `host`'s tracking subscribers. Idempotent.
 *
 * Tier 1 (`_s1`) is the dominant shape: a census of the row-list and
 * computed-chain workloads found the tracking subscriber count is exactly 1 in
 * 100% of cases, so the Set — and its hashed add/delete — is pure overhead
 * there. Duplicate registration (the `divergeVerify` prefix repair) resolves to
 * an identity compare instead of a hash probe.
 */
export function addSubscriber(host: SubscriberHost, sub: () => void): void {
  const s1 = host._s1
  if (s1 === sub) return // already the sole subscriber — idempotent, no hash
  if (s1 === null) {
    const s = host._s
    if (s === null) {
      host._s1 = sub
      return
    }
    s.add(sub)
    return
  }
  // Promote: the slot is occupied by a DIFFERENT subscriber.
  const set = new Set<() => void>()
  set.add(s1)
  set.add(sub)
  host._s1 = null
  host._s = set
}

/** Remove `sub` from `host`'s tracking subscribers. No-op when absent. */
export function removeSubscriber(host: SubscriberHost, sub: () => void): void {
  if (host._s1 === sub) {
    host._s1 = null
    return
  }
  host._s?.delete(sub)
}

/**
 * Register the active effect as a subscriber of the given reactive source.
 * Storage is created lazily on the host — sources read only outside effects
 * never allocate anything.
 */
export function trackSubscriber(host: SubscriberHost) {
  const ae = activeEffect
  if (ae === null) return
  const idx = _verifyIndex
  if (idx >= 0) {
    // Verify mode — steady-state re-run: one identity compare, no Set ops.
    // Safe to trust the index after the `ae === null` gate: `runUntracked`
    // suspends `activeEffect` only, so untracked code can't reach a stale index.
    const deps = _depsCollector as SubscriberHost[]
    if (idx < deps.length && deps[idx] === host) {
      _verifyIndex = idx + 1
      return
    }
    divergeVerify(host, ae)
    return
  }
  addSubscriber(host, ae)
  // INVARIANT (see `_depsCollector`): a collector is ALWAYS set while
  // activeEffect is live, so no null guard is needed here.
  ;(_depsCollector as SubscriberHost[]).push(host)
}

/**
 * Cold path — a verified re-run read a source that doesn't match the recorded
 * position (new dep / reorder / branch flip). Unsubscribe the unconfirmed
 * tail, repair the confirmed prefix (duplicate-alias hazard), and fall back
 * to plain collect mode for the remainder of this run.
 */
function divergeVerify(host: SubscriberHost, owner: () => void): void {
  const deps = _depsCollector as SubscriberHost[]
  const confirmed = _verifyIndex
  // 1. Unsubscribe the unconfirmed tail — those positions are stale-dep
  //    candidates; any that get re-read later in this run re-subscribe via
  //    the collect path below.
  for (let j = confirmed; j < deps.length; j++) removeSubscriber(deps[j] as SubscriberHost, owner)
  deps.length = confirmed
  // 2. Repair the confirmed prefix — step 1 may have removed the owner from a
  //    host that ALSO sits at a confirmed position (duplicate reads of the
  //    same source alias the same host).
  for (let j = 0; j < confirmed; j++) addSubscriber(deps[j] as SubscriberHost, owner)
  // 3. Exit verify mode (-1 = collect) — the rest of this run collects
  //    normally onto the preserved confirmed prefix.
  _verifyIndex = -1
  // 4. Record the current (diverging) read.
  addSubscriber(host, owner)
  deps.push(host)
}

/**
 * Enter a COLLECT tracking frame: `fn`'s reactive reads subscribe `owner` and
 * append their subscriber Sets to `deps`. Used for FIRST runs. Fully re-entrant
 * — saves and restores the complete tracking frame, so nested evaluations each
 * get an isolated frame and the outer frame resumes where it left off.
 */
export function runCollect<T>(owner: () => void, deps: SubscriberHost[], fn: () => T): T {
  const prevEffect = activeEffect
  const prevDeps = _depsCollector
  const prevIndex = _verifyIndex
  activeEffect = owner
  _depsCollector = deps
  _verifyIndex = -1 // collect mode
  try {
    return fn()
  } finally {
    activeEffect = prevEffect
    _depsCollector = prevDeps
    _verifyIndex = prevIndex
  }
}

/**
 * Enter a VERIFY tracking frame: `fn`'s reactive reads are checked positionally
 * against the previous run's `deps`. Steady state (same sources, same order)
 * costs one identity compare per read — no Set ops, no allocations, and the
 * owner never leaves its subscriber Sets.
 */
export function runVerify<T>(owner: () => void, deps: SubscriberHost[], fn: () => T): T {
  const prevEffect = activeEffect
  const prevDeps = _depsCollector
  const prevIndex = _verifyIndex
  activeEffect = owner
  _depsCollector = deps
  _verifyIndex = 0 // verify mode, position 0
  try {
    const result = fn()
    // Shrink: fn stayed in verify mode but read FEWER deps than last run —
    // unsubscribe + truncate the stale tail, then repair the confirmed prefix
    // (duplicate-alias hazard, same as divergeVerify).
    // Deliberately NOT in the finally: if fn threw, the unverified tail stays
    // subscribed + recorded (dispose still removes everything) and the next run
    // re-verifies from index 0.
    const idx = _verifyIndex
    if (idx >= 0 && idx < deps.length) {
      for (let j = idx; j < deps.length; j++) removeSubscriber(deps[j] as SubscriberHost, owner)
      deps.length = idx
      for (let j = 0; j < idx; j++) addSubscriber(deps[j] as SubscriberHost, owner)
    }
    return result
  } finally {
    activeEffect = prevEffect
    _depsCollector = prevDeps
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
    // Effects run inline. Under verify-mode dep reuse a steady-state re-run no
    // longer removes + re-adds itself, so the live Set is stable; the
    // original-size cap guards DIVERGING re-runs and raw subscribe() listeners
    // that mutate the set.
    const originalSize = subscribers.size
    let i = 0
    for (const sub of subscribers) {
      if (i >= originalSize) break
      sub()
      i++
    }
  }
}

// Thread-local collector for nested effects — captures `effect()` calls made
// inside another effect's body so the parent can dispose them on re-run.
// Lives here (not effect.ts) so `runUntracked` can suspend it in lock-step with
// `activeEffect`: without that, child component effects created inside
// `mountFor`'s `runUntracked` wrap would register as inner effects of the For's
// effect and be disposed on its NEXT re-run, silently dropping every
// subscription they had.
//
// Untyped (`unknown[]`) to avoid a circular dep with effect.ts.
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
