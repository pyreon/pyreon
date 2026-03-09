import { notifySubscribers, trackSubscriber } from "./tracking"

export interface Signal<T> {
  (): T
  /** Read the current value WITHOUT registering a reactive dependency. */
  peek(): T
  set(value: T): void
  update(fn: (current: T) => T): void
  /**
   * Subscribe a static listener directly — no effect overhead (no withTracking,
   * no cleanupEffect, no effectDeps WeakMap). Use when the dependency is fixed
   * and dynamic re-tracking is not needed.
   * Returns a disposer that removes the subscription.
   */
  subscribe(listener: () => void): () => void
}

export function signal<T>(initialValue: T): Signal<T> {
  let value = initialValue
  // Lazily created — only allocated when an effect tracks this signal or
  // .subscribe() is called. Signals read only outside effects (e.g. label
  // signals accessed solely via .subscribe) never pay the Set cost at construction.
  let subscribers: Set<() => void> | null = null

  const getOrCreate = () => {
    if (!subscribers) subscribers = new Set()
    return subscribers
  }

  const read = () => {
    trackSubscriber(getOrCreate)
    return value
  }

  // peek() does not call trackSubscriber, so activeEffect never registers a dep here.
  // No need to go through runUntracked — just return the value directly.
  read.peek = () => value

  read.set = (newValue: T) => {
    if (Object.is(value, newValue)) return
    value = newValue
    if (subscribers) notifySubscribers(subscribers)
  }

  read.update = (fn: (current: T) => T) => {
    read.set(fn(value))
  }

  read.subscribe = (listener: () => void) => {
    getOrCreate().add(listener)
    return () => subscribers?.delete(listener)
  }

  return read
}
