import { enqueuePendingNotification, isBatching } from './batch'

let activeEffect: (() => void) | null = null

// The deps collector — every primitive that establishes a tracking scope (`effect` / `renderEffect`
// / `_bind` / `computed`) enters a FRAME via `runCollect` / `runVerify` below.
let _depsCollector: Set<() => void>[] | null = null

// ─── Verify-mode dep reuse ─────────────────────────────────────────────────── A steady-state
// re-run reads the SAME sources in the SAME order.
let _verifyIndex = -1

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
  const idx = _verifyIndex
  if (idx >= 0) {
    // Verify mode — steady-state re-run: one identity compare, no Set ops.
    const deps = _depsCollector as Set<() => void>[]
    if (idx < deps.length && deps[idx] === host._s) {
      _verifyIndex = idx + 1
      return
    }
    divergeVerify(host, ae)
    return
  }
  if (!host._s) host._s = new Set()
  host._s.add(ae)
  // INVARIANT (see `_depsCollector`): a collector is ALWAYS set while
  // activeEffect is live, so no null guard is needed here.
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
  // 1. Unsubscribe the unconfirmed tail — those positions are stale-dep candidates; any that get
  // re-read later in this run re-subscribe via the collect path below.
  for (let j = confirmed; j < deps.length; j++) (deps[j] as Set<() => void>).delete(owner)
  deps.length = confirmed
  // 2. Repair the confirmed prefix — step 1 may have deleted the owner from a Set that ALSO sits at
  // a confirmed position (duplicate reads of the same source alias the same Set).
  for (let j = 0; j < confirmed; j++) (deps[j] as Set<() => void>).add(owner)
  // 3. Exit verify mode (-1 = collect) — the rest of this run collects
  //    normally onto the preserved confirmed prefix.
  _verifyIndex = -1
  // 4. Record the current (diverging) read.
  if (!host._s) host._s = new Set()
  host._s.add(owner)
  deps.push(host._s)
}

/**
 * Enter a COLLECT tracking frame: `fn`'s reactive reads subscribe `owner` and
 * append their subscriber Sets to `deps`. Used for FIRST runs. Fully re-entrant
 * — saves and restores the complete tracking frame, so nested evaluations each
 * get an isolated frame and the outer frame resumes where it left off.
 */
export function runCollect<T>(owner: () => void, deps: Set<() => void>[], fn: () => T): T {
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
export function runVerify<T>(owner: () => void, deps: Set<() => void>[], fn: () => T): T {
  const prevEffect = activeEffect
  const prevDeps = _depsCollector
  const prevIndex = _verifyIndex
  activeEffect = owner
  _depsCollector = deps
  _verifyIndex = 0 // verify mode, position 0
  try {
    const result = fn()
    // Shrink: fn stayed in verify mode but read FEWER deps than last run — unsubscribe + truncate
    // the stale tail, then repair the confirmed prefix.
    const idx = _verifyIndex
    if (idx >= 0 && idx < deps.length) {
      for (let j = idx; j < deps.length; j++) (deps[j] as Set<() => void>).delete(owner)
      deps.length = idx
      for (let j = 0; j < idx; j++) (deps[j] as Set<() => void>).add(owner)
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
    // Effects run inline.
    const originalSize = subscribers.size
    let i = 0
    for (const sub of subscribers) {
      if (i >= originalSize) break
      sub()
      i++
    }
  }
}

// Thread-local collector for nested effects — captures `effect()` calls made inside another
// effect's body so the parent can dispose them on re-run.
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
