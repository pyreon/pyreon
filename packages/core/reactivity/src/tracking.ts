// Global subscriber tracking context

import { enqueuePendingNotification, isBatching } from './batch'

let activeEffect: (() => void) | null = null

// Tracks which subscriber sets each effect is registered in, so we can
// clean them up before a re-run (dynamic dependency tracking).
const effectDeps = new WeakMap<() => void, Set<Set<() => void>>>()

// Fast deps collector for renderEffect — avoids WeakMap overhead entirely.
// When set, trackSubscriber pushes subscriber sets here instead of effectDeps.
let _depsCollector: Set<() => void>[] | null = null

// Skip deps collection mode — for re-evaluating computeds/effects with static deps.
// When true, trackSubscriber only does Set.add (no-op if already subscribed) and skips
// the _depsCollector.push / WeakMap work entirely.
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
    if (_depsCollector) {
      // Fast path: renderEffect stores deps inline, no WeakMap
      _depsCollector.push(host._s)
    } else {
      // Record this dep so we can remove it on cleanup
      let deps = effectDeps.get(activeEffect)
      if (!deps) {
        deps = new Set()
        effectDeps.set(activeEffect, deps)
      }
      deps.add(host._s)
    }
  }
}

/**
 * Remove an effect from every subscriber set it was registered in,
 * then clear its dep record. Call this before each re-run and on dispose.
 */
export function cleanupEffect(fn: () => void): void {
  const deps = effectDeps.get(fn)
  if (deps) {
    for (const sub of deps) sub.delete(fn)
    deps.clear()
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

/** Read signals without subscribing. Alias: `untrack`. */
export function runUntracked<T>(fn: () => T): T {
  const prev = activeEffect
  activeEffect = null
  try {
    return fn()
  } finally {
    activeEffect = prev
  }
}
