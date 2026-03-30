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
 */
export function createSelector<T>(source: () => T): (value: T) => boolean {
  const subs = new Map<T, Set<() => void>>()
  let current: T
  let initialized = false

  effect(() => {
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

  return (value: T): boolean => {
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
    return Object.is(current, value)
  }
}
