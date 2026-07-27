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

/** Selector predicate with `dispose()` + `subscribe()` methods. */
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
  /**
   * **Effect-free per-key subscription** — the fast path for the `<For>` +
   * selector pattern (row-level reactive className, active-link styling, tab
   * indicators).
   *
   * Equivalent to `renderEffect(() => updater(selector(key)))` but skips that
   * machinery entirely: no deps array, no tracking frame, no `run` closure, no
   * scope wrapper. The updater is called ONCE inline with the initial value,
   * then again only when the selection actually crosses this key.
   *
   * Per-row cost in the dominant one-subscriber-per-key shape is one `Map.set`
   * of the bare updater plus one dispose closure — a Set is allocated only when
   * a SECOND subscriber binds the same key.
   *
   * Named `subscribe` rather than `bind` to avoid colliding with
   * `Function.prototype.bind` on callable shapes.
   *
   * @param value - The per-key value to subscribe to.
   * @param updater - Called with `true` when `value` becomes the current
   *   selection, `false` when it stops being. Called ONCE inline with the
   *   initial state.
   * @returns A dispose function that unsubscribes the updater.
   *
   * @example
   * // In a compiled row template:
   * _tpl('<tr><td></td></tr>', (root) => {
   *   return isSelected.subscribe(row.id, (matches) => {
   *     root.className = matches ? 'selected' : ''
   *   })
   * })
   */
  subscribe(value: T, updater: (matches: boolean) => void): () => void
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
 *
 * @remarks
 * Per-key state (the `subs`/`hosts` buckets created when an effect reads
 * `selector(key)`) is the price of O(1)-per-key selection: a bucket is created
 * on first access and is NOT reclaimed when that key's subscribers later leave.
 * For a bounded key set this is bounded by N; for UNBOUNDED-cardinality churn
 * (an infinite-scroll list whose row ids never repeat) buckets accumulate until
 * `dispose()`. (The `.subscribe()` channel's per-key Set IS reclaimed when its
 * last subscriber leaves.)
 */
export function createSelector<T>(source: () => T): Selector<T> {
  const subs = new Map<T, Set<() => void>>()
  // Bound updaters (from `selector.subscribe`) — kept SEPARATE from the effect bucket
  // so the source effect can call them with the resolved boolean directly instead of an
  // empty re-run closing over `current` and `value`. Inline-first-subscriber storage
  // (the signal `_d1` trick): the DOMINANT shape is <For> rows where every key has
  // EXACTLY ONE subscriber, so storing a bare function avoids one Set allocation per
  // row.
  const boundSubs = new Map<T, ((matches: boolean) => void) | Set<(matches: boolean) => void>>()
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
    // Bound updaters — pass the resolved boolean directly so the user
    // updater can run with zero closure overhead per fire.
    const oldBoundBucket = boundSubs.get(old)
    const newBoundBucket = boundSubs.get(next)
    if (oldBoundBucket) {
      if (typeof oldBoundBucket === 'function') oldBoundBucket(false)
      else for (const fn of oldBoundBucket) fn(false)
    }
    if (newBoundBucket) {
      if (typeof newBoundBucket === 'function') newBoundBucket(true)
      else for (const fn of newBoundBucket) fn(true)
    }
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
    boundSubs.clear()
  }

  // Effect-free per-key binding (perf hot path) — hooks `updater` DIRECTLY into
  // a per-key bound bucket; the source effect calls it with the resolved boolean.
  // Per `.subscribe` call, in the dominant one-subscriber-per-key shape: one
  // `Map.set` of the BARE updater (no Set) plus one dispose closure — zero
  // effects, zero deps arrays, zero tracking-frame pushes.
  selector.subscribe = (value: T, updater: (matches: boolean) => void): (() => void) => {
    if (disposed) {
      // Selector is disposed — call updater once with the stale-last value,
      // then return a no-op dispose. Matches the documented contract that
      // post-dispose calls return the last known result.
      updater(Object.is(current, value))
      return () => {
        /* no-op */
      }
    }
    const existing = boundSubs.get(value)
    if (existing === undefined) {
      // First subscriber for this key — store the bare updater (no Set).
      boundSubs.set(value, updater)
    } else if (typeof existing === 'function') {
      // Second subscriber — promote to a Set holding both.
      const promoted = new Set<(matches: boolean) => void>()
      promoted.add(existing)
      promoted.add(updater)
      boundSubs.set(value, promoted)
    } else {
      existing.add(updater)
    }
    // Initial inline call — consumer expects the updater to run synchronously
    // with the current state, same shape as `_bindDirect` / `_bindText`.
    updater(Object.is(current, value))
    return () => {
      const bucket = boundSubs.get(value)
      if (bucket === updater) {
        // Sole inline subscriber — drop the key entirely (also prevents
        // unbounded Map growth across create/clear cycles with fresh keys).
        boundSubs.delete(value)
      } else if (bucket instanceof Set) {
        bucket.delete(updater)
        // Last subscriber of a promoted key left — drop the now-empty Set so
        // the key doesn't linger in `boundSubs` (same unbounded-growth guard the
        // inline branch applies; without this, a key that ever had ≥2 bound
        // subscribers leaked an empty Set for the selector's lifetime).
        if (bucket.size === 0) boundSubs.delete(value)
      }
    }
  }

  return selector
}
