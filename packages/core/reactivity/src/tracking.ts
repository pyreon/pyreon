import { enqueuePendingNotification, isBatching } from './batch'

let activeEffect: (() => void) | null = null

// The deps collector — every primitive that establishes a tracking scope
// (`effect` / `renderEffect` / `_bind` / `computed`) sets this to its own
// local `Set[]` BEFORE `activeEffect` goes live, so `trackSubscriber` always
// records deps inline here (no per-effect WeakMap). This is an INVARIANT, not
// a fast path: there is no fallback collector. A legacy `effectDeps` WeakMap
// branch used to exist for a "tracking with activeEffect but no collector"
// case that no code path ever produced (every `withTracking` call site sets a
// collector or `_skipDepsCollection`); it was dead code + a phantom WeakMap in
// the hottest module, removed in the perf-cleanup pass.
let _depsCollector: Set<() => void>[] | null = null

// Skip deps collection mode — for re-evaluating computeds/effects with static deps.
// When true, trackSubscriber only does Set.add (no-op if already subscribed) and skips
// the _depsCollector.push work entirely.
let _skipDepsCollection = false

export function setDepsCollector(collector: Set<() => void>[] | null): void {
  _depsCollector = collector
}

export function setSkipDepsCollection(skip: boolean): void {
  _skipDepsCollection = skip
}

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
  if (activeEffect) {
    if (!host._s) host._s = new Set()
    host._s.add(activeEffect)
    // Skip collection mode: we're already subscribed (Set.add is no-op),
    // just need activeEffect set for nested computed reads to work.
    if (_skipDepsCollection) return
    // INVARIANT (see _depsCollector docs): a collector is always set while
    // activeEffect is live, so the dep is recorded inline for O(1) cleanup.
    if (_depsCollector) _depsCollector.push(host._s)
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
    // Effects run inline and may call cleanupEffect (removes) + trackSubscriber (re-adds).
    // Instead of snapshotting with [...subscribers] (allocates an array), we iterate the
    // live Set but cap iterations at the original size to prevent infinite loops from
    // re-inserted entries. This is safe because:
    //   - cleanupEffect removes the effect from the Set (no double-fire)
    //   - trackSubscriber may re-add it (but we stop after originalSize iterations)
    //   - Any effects re-added during this pass are already up-to-date (just ran)
    const originalSize = subscribers.size
    let i = 0
    for (const sub of subscribers) {
      if (i >= originalSize) break
      sub()
      i++
    }
  }
}

export function withTracking<T>(fn: () => void, compute: () => T): T {
  const prev = activeEffect
  activeEffect = fn
  try {
    return compute()
  } finally {
    activeEffect = prev
  }
}

// Stack for inlined tracking in renderEffect — avoids withTracking function call overhead.
let _prevEffect: (() => void) | null = null

export function _setActiveEffect(fn: () => void): void {
  _prevEffect = activeEffect
  activeEffect = fn
}

export function _restoreActiveEffect(): void {
  activeEffect = _prevEffect
  _prevEffect = null
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
// consumer is effect.ts which knows the real `Effect[]` shape.
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
