// Global subscriber tracking context

import { enqueuePendingNotification, isBatching } from "./batch"

let activeEffect: (() => void) | null = null

// Tracks which subscriber sets each effect is registered in, so we can
// clean them up before a re-run (dynamic dependency tracking).
const effectDeps = new WeakMap<() => void, Set<Set<() => void>>>()

// Fast deps collector for renderEffect — avoids WeakMap overhead entirely.
// When set, trackSubscriber pushes subscriber sets here instead of effectDeps.
let _depsCollector: Array<Set<() => void>> | null = null

export function setDepsCollector(collector: Array<Set<() => void>> | null): void {
  _depsCollector = collector
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
    const subscribers = host._s
    subscribers.add(activeEffect)
    if (_depsCollector) {
      // Fast path: renderEffect stores deps inline, no WeakMap
      _depsCollector.push(subscribers)
    } else {
      // Record this dep so we can remove it on cleanup
      let deps = effectDeps.get(activeEffect)
      if (!deps) {
        deps = new Set()
        effectDeps.set(activeEffect, deps)
      }
      deps.add(subscribers)
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
    // Snapshot first to prevent the iterator from visiting re-inserted entries → infinite loop.
    for (const sub of [...subscribers]) sub()
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

export function runUntracked<T>(fn: () => T): T {
  const prev = activeEffect
  activeEffect = null
  try {
    return fn()
  } finally {
    activeEffect = prev
  }
}
