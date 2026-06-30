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
   * **Effect-free per-key subscription** — the fast path for the
   * `<For>` + selector pattern (row-level reactive className, active-link
   * styling, tab indicators, etc.).
   *
   * Equivalent to:
   * ```ts
   * const dispose = renderEffect(() => updater(selector(key)))
   * ```
   * but skips the `renderEffect` machinery entirely: no `deps` array, no
   * `withTracking` / `setDepsCollector`, no `run` closure allocation, no
   * scope `add({ dispose })` wrapper. The updater is called ONCE inline
   * with the initial value, then again each time the selector's
   * per-key bucket fires (only when the selection actually crosses this
   * key). The bucket calls the updater with the resolved boolean directly
   * — no per-row wrapper closure.
   *
   * Per-row alloc (the dominant one-subscriber-per-key `<For>` shape):
   * 1 `Map.set` of the BARE updater + 1 dispose closure — NO Set at all;
   * a Set is allocated only when a SECOND subscriber binds the same key
   * (the inline-first-subscriber slot, PR #1537 — a 10k-row create
   * previously allocated 10k single-entry Sets). Measured savings on a
   * 1000-row create-and-mount
   * benchmark with `<For>` + per-row `isSelected(row.id)` className:
   * **-0.8ms on create-1k, -0.7ms on replace-all, -5ms on create-10k** —
   * promoting Pyreon (compiled) from "tied" to "outright leader" on every
   * list-mounting test vs Vue 3 / SolidJS / Svelte 5 / React 19.
   *
   * Named `subscribe` rather than `bind` to avoid `Function.prototype.bind`
   * collision (the interface inherits the Function prototype on callable
   * shapes).
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
   *   const cleanup = isSelected.subscribe(row.id, (matches) => {
   *     root.className = matches ? 'selected' : ''
   *   })
   *   return cleanup
   * })
   *
   * @example
   * // Active-link pattern (auto-cleans on unmount via the surrounding scope):
   * isActiveRoute.subscribe(route.id, (active) => {
   *   linkEl.setAttribute('aria-current', active ? 'page' : 'false')
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
 * on first access of a key and is NOT reclaimed when that key's subscribers
 * later leave (the effect removes itself from the bucket Set, but the selector
 * gets no callback to prune the now-empty key). For a bounded key set (a list
 * of N rows) this is bounded by N; for UNBOUNDED-cardinality churn (e.g. an
 * infinite-scroll list whose row ids never repeat, kept alive indefinitely) the
 * buckets accumulate until `dispose()`. Dispose the selector when its keyed set
 * is bounded-lived. (The `.subscribe()` channel's per-key Set IS reclaimed when
 * its last subscriber leaves.)
 */
export function createSelector<T>(source: () => T): Selector<T> {
  const subs = new Map<T, Set<() => void>>()
  // Bound updaters (from `selector.subscribe`) — kept SEPARATE from the effect
  // bucket so the source effect can fire them with the resolved boolean
  // directly instead of an empty re-run that closes over `current` and
  // `value`. Saves one closure allocation per `.bind` call (significant
  // in <For>-style usage — 1k rows × per-row className = 1k fewer
  // closures retained for the selector's lifetime).
  // Inline-first-subscriber storage (the signal `_d1` trick, PR #1177):
  // the DOMINANT shape is <For> rows where every key has EXACTLY ONE
  // subscriber — storing a bare function avoids one Set allocation per
  // row (10k rows = 10k Sets saved on a bulk create; measured directly
  // in the bench allocation profile as 14% of JS allocations). Promote
  // to a Set only when a SECOND subscriber arrives for the same key.
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

  // ── Effect-free per-key binding (perf hot path) ──────────────────────────
  // Hooks `updater` DIRECTLY into a per-key bound bucket — the source effect
  // calls it with the resolved boolean (`true` on selection added, `false`
  // on selection removed). No effect machinery, no per-row closure
  // allocation beyond the dispose. See `Selector.subscribe` JSDoc for the full
  // performance rationale + benchmark.
  //
  // Memory shape per `.subscribe` call (one-subscriber-per-key shape):
  //   - 1 Map.set of the BARE updater (no Set — inline-first-subscriber
  //     slot; a Set is allocated only on the 2nd subscriber for a key)
  //   - 1 closure (dispose)
  //   - 0 effect, 0 deps array, 0 tracking-stack push
  //
  // vs `renderEffect(() => updater(selector(key)))`: ~5× fewer allocations,
  // no withTracking/setDepsCollector overhead, no scope.add wrapper.
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
