import { effect } from './effect'
import { trackSubscriber } from './tracking'

/**
 * Notify a subscriber bucket without snapshot allocation.
 * Caps iteration at the original size to avoid infinite loops from
 * re-inserted entries (same pattern as notifySubscribers in tracking.ts).
 */
function notifyBucket(bucket: Set<() => void>): void {
  if (bucket.size === 0) return
  if (bucket.size === 1) {
    ;(bucket.values().next().value as () => void)()
    return
  }
  const originalSize = bucket.size
  let i = 0
  for (const fn of bucket) {
    if (i >= originalSize) break
    fn()
    i++
  }
}

/** Selector predicate with a `dispose()` method to release internal state. */
export interface Selector<T> {
  (value: T): boolean
  /**
   * Stop the source-tracking effect AND clear the per-value subscriber/host
   * Maps. After dispose, calls to the selector return the last-known result
   * but no longer track. Required for selectors over dynamic value spaces
   * (UUIDs, ephemeral IDs) created outside an `EffectScope` — without it,
   * each unique queried value adds a permanent entry to the internal Maps,
   * leaking memory for the lifetime of the program. Idempotent.
   */
  dispose(): void
}

/**
 * Create an equality selector — returns a reactive predicate that is true
 * only for the currently selected value.
 *
 * Unlike a plain `() => source() === value`, this only triggers the TWO
 * affected subscribers (deselected + newly selected) instead of ALL
 * subscribers, making selection O(1) regardless of list size.
 *
 * @example
 * const isSelected = createSelector(selectedId)
 * // In each row:
 * class: () => (isSelected(row.id) ? "selected" : "")
 *
 * @example
 * // Dynamic value spaces — call dispose() to release the per-value cache:
 * const isCurrentTab = createSelector(() => currentTabId())
 * onUnmount(() => isCurrentTab.dispose())
 */
export function createSelector<T>(source: () => T): Selector<T> {
  const subs = new Map<T, Set<() => void>>()
  let current: T
  let initialized = false
  let disposed = false

  const sourceEffect = effect(() => {
    const next = source()
    if (!initialized) {
      initialized = true
      current = next
      return
    }
    if (Object.is(next, current)) return
    const old = current
    current = next
    // Only notify the two affected buckets — O(1) regardless of list size.
    // Iteration-capped loop avoids [...bucket] snapshot allocation.
    const oldBucket = subs.get(old)
    const newBucket = subs.get(next)
    if (oldBucket) notifyBucket(oldBucket)
    if (newBucket) notifyBucket(newBucket)
  })

  // Reusable hosts per value — avoids allocating a closure per trackSubscriber call
  const hosts = new Map<T, { _s: Set<() => void> | null }>()

  const selector = ((value: T): boolean => {
    if (!disposed) {
      let host = hosts.get(value)
      if (!host) {
        let bucket = subs.get(value)
        if (!bucket) {
          bucket = new Set()
          subs.set(value, bucket)
        }
        host = { _s: bucket }
        hosts.set(value, host)
      }
      trackSubscriber(host)
    }
    return Object.is(current, value)
  }) as Selector<T>

  selector.dispose = (): void => {
    if (disposed) return
    disposed = true
    sourceEffect.dispose()
    subs.clear()
    hosts.clear()
  }

  return selector
}
