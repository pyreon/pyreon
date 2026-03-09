import { effect } from "./effect"
import { trackSubscriber } from "./tracking"

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
    // Only notify the two affected buckets — O(1) regardless of list size
    const oldBucket = subs.get(old)
    const newBucket = subs.get(next)
    if (oldBucket) for (const fn of [...oldBucket]) fn()
    if (newBucket) for (const fn of [...newBucket]) fn()
  })

  return (value: T): boolean => {
    let bucket = subs.get(value)
    if (!bucket) {
      bucket = new Set()
      subs.set(value, bucket)
    }
    trackSubscriber(() => bucket as Set<() => void>)
    return Object.is(current, value)
  }
}
