import { effect } from './effect'
import { type SubscriberHost, trackSubscriber } from './tracking'

/**
 * Notify a subscriber bucket without snapshot allocation.
 * Caps iteration at the original size to avoid infinite loops from
 * re-inserted entries (same pattern as notifySubscribers in tracking.ts).
 */
function notifyBucket(host: SubscriberHost): void {
  // Inline slot first — the dominant shape (one effect watching one key), and
  // the read is a plain field rather than a materialised Set iterator. Captured
  // locally, so a subscriber that promotes the tier mid-call is unaffected.
  const s1 = host._s1
  if (s1 !== null) {
    s1()
    return
  }
  const bucket = host._s
  if (bucket === null || bucket.size === 0) return
  const originalSize = bucket.size
  let i = 0
  for (const fn of bucket) {
    if (i >= originalSize) break
    fn()
    i++
  }
}

/**
 * Smallest key count that can trigger a reclamation sweep. Below this the map
 * is too small for the walk to be worth its own cost, and a selector over a
 * genuinely small key space (tabs, a radio group) never sweeps at all.
 */
const SWEEP_FLOOR = 512

/**
 * Per-key bucket for the `.subscribe()` channel. Holding the updater behind a
 * mutable field is what lets a disposer unsubscribe WITHOUT a map lookup —
 * see the `boundSubs` declaration for why that is load-bearing.
 */
interface BoundHolder {
  fn: ((matches: boolean) => void) | Set<(matches: boolean) => void> | null
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
   * of a small holder plus one dispose closure — a Set is allocated only when a
   * SECOND subscriber binds the same key. UNSUBSCRIBING touches no map at all
   * (the disposer clears one field on its holder), which is what keeps tearing
   * down an N-row list off the hashed-delete path.
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
 * Per-key state (the bucket created when an effect reads `selector(key)`) is
 * the price of O(1)-per-key selection, but it is SELF-RECLAIMING: a bucket
 * whose last subscriber has left holds no state, so it is dropped by an
 * amortized sweep on the next key insertion. Steady-state memory is therefore
 * proportional to the keys currently SUBSCRIBED, not to every key the selector
 * has ever been asked about — an infinite-scroll list whose row ids never
 * repeat stays flat instead of accumulating one bucket per row ever rendered.
 * (The `.subscribe()` channel reclaims its own per-key entry the same way, on
 * last-unsubscribe.) `dispose()` remains available to release everything at
 * once, and is still worth calling when the selector outlives its list.
 */
export function createSelector<T>(source: () => T): Selector<T> {
  // Per-key tracked-subscriber buckets. The value is the `SubscriberHost` that
  // `trackSubscriber` writes into, so this ONE map serves both roles the code
  // used to split across a `subs` (value → Set) and a `hosts` (value → {_s})
  // map — they were always the same bucket behind two entries, so every key
  // paid two Map entries to store one relationship.
  const subs = new Map<T, SubscriberHost>()
  // Bound updaters (from `selector.subscribe`) — kept SEPARATE from the effect
  // bucket so the source effect can call them with the resolved boolean directly
  // instead of an empty re-run closing over `current` and `value`.
  //
  // Inline-first-subscriber storage (the signal `_d1` trick): the DOMINANT shape
  // is <For> rows where every key has EXACTLY ONE subscriber, so `holder.fn`
  // stores a bare function; it promotes to a Set only when a SECOND subscriber
  // arrives for the same key.
  //
  // The value is a HOLDER rather than the updater itself so that UNSUBSCRIBING
  // TOUCHES NO MAP AT ALL — the disposer closes over its holder and clears one
  // field. That matters because the dominant caller is a `<For>` row, and
  // clearing an N-row list ran N × (`Map.get` + `Map.delete`); measured in real
  // Chromium on the 1000-row krausest shape that was the single largest
  // non-DOM item in `clear rows` (11.1µs in its own frame plus most of a
  // 12.7µs frame V8 had inlined it into, against 0.9µs for tearing down the
  // per-row signal binding). A holder field write is ~1ns, and when the last
  // live key goes the whole map is dropped in ONE `clear()` — so a full-list
  // teardown costs N cheap writes plus one O(1) map op instead of N hashed
  // deletes. The identity guard survives unchanged: a stale disposer sees
  // `holder.fn !== updater` after a re-subscribe and correctly no-ops, which a
  // bare `Map.delete(value)` could not do without reading the bucket back.
  let boundSubs = new Map<T, BoundHolder>()
  // Holders whose `fn` is still live. Reaching 0 means every bound key is dead,
  // which is the whole-list-teardown case worth special-casing.
  let liveBound = 0
  // Holders left behind with `fn === null` (partial teardown). They retain
  // nothing but themselves, and `sweepBound` rebuilds the map once they
  // outnumber the live ones — amortised, so repeated add/remove churn that
  // never reaches 0 live cannot grow the map without bound.
  let deadBound = 0
  let current: T
  let initialized = false
  let disposed = false
  // Reclamation state for `subs` — see `sweep()`.
  let notifying = false
  let sweepAt = SWEEP_FLOOR

  /**
   * Drop dead holders by REBUILDING from the live ones — O(live), where
   * deleting them individually would be O(dead) hashed deletes, i.e. exactly
   * the cost this design exists to avoid.
   */
  const sweepBound = (): void => {
    const next = new Map<T, BoundHolder>()
    for (const [key, holder] of boundSubs) if (holder.fn !== null) next.set(key, holder)
    boundSubs = next
    deadBound = 0
  }

  /**
   * A holder just went dead.
   *
   * This runs once per unsubscribe and is therefore the hot path of a list
   * teardown — it deliberately does NO reclamation work beyond the O(1)
   * whole-map drop. Reclaiming here instead cost 10.3µs of a 1000-row clear in
   * a real-Chromium profile: a teardown burst walks its live count down
   * THROUGH every sweep threshold on its way to zero, so a `dead > live`
   * trigger rebuilds the map two or three times before the final row proves
   * the rebuilds were pointless. Dead holders only become a problem when the
   * map GROWS, so `subscribe` reclaims instead — the same insertion-time
   * amortisation `sweep()` uses for `subs`.
   */
  const releaseBound = (): void => {
    deadBound++
    // `<= 0` rather than `=== 0`, at identical cost: `selector.dispose()` zeroes
    // the counts while rows may still hold un-run disposers, and a component
    // that disposes its selector before its `<For>` tears down is an ordinary
    // unmount order. Those late disposers would otherwise drive the count
    // negative and it would never return to 0.
    if (--liveBound <= 0) {
      // Whole-list teardown: one map op instead of N hashed deletes.
      boundSubs.clear()
      deadBound = 0
      liveBound = 0
    }
  }

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
    // A sweep must not run while these buckets are being notified — a
    // subscriber re-reading the selector mid-notify would otherwise be able to
    // drop and re-create the very key being delivered.
    notifying = true
    try {
      if (oldBucket) notifyBucket(oldBucket)
      if (newBucket) notifyBucket(newBucket)
    } finally {
      notifying = false
    }
    // Bound updaters — pass the resolved boolean directly so the user
    // updater can run with zero closure overhead per fire.
    // One extra field deref per SELECTION CHANGE (not per key, not per row) —
    // the holder indirection is paid exactly twice here.
    const oldBoundBucket = boundSubs.get(old)?.fn
    const newBoundBucket = boundSubs.get(next)?.fn
    if (oldBoundBucket) {
      if (typeof oldBoundBucket === 'function') oldBoundBucket(false)
      else for (const fn of oldBoundBucket) fn(false)
    }
    if (newBoundBucket) {
      if (typeof newBoundBucket === 'function') newBoundBucket(true)
      else for (const fn of newBoundBucket) fn(true)
    }
  })

  /**
   * Drop every key whose tracked-subscriber bucket is empty.
   *
   * A bucket with no subscribers carries NO state — `current` lives outside the
   * map — so a key that is swept and later re-read simply gets a fresh bucket.
   * The sweep is therefore semantically invisible; it only bounds memory to the
   * keys that are actually subscribed RIGHT NOW instead of every key the
   * selector has ever been asked about.
   *
   * Keys with a live `.subscribe()` updater are unaffected: that channel has
   * its own `boundSubs` map and already reclaims itself when its last
   * subscriber leaves.
   */
  const sweep = (): void => {
    for (const [key, host] of subs) {
      if (host._s1 === null && (host._s === null || host._s.size === 0)) subs.delete(key)
    }
    // Amortize: the next sweep waits until the live set could have doubled, so
    // total sweep work stays O(1) per key inserted.
    sweepAt = subs.size * 2 + SWEEP_FLOOR
  }

  const selector = ((value: T): boolean => {
    if (!disposed) {
      let host = subs.get(value)
      if (!host) {
        // NEW key — the only place the map can grow, so the only place that
        // needs to consider reclaiming. Never sweeps mid-notification.
        if (subs.size >= sweepAt && !notifying) sweep()
        host = { _s1: null, _s: null }
        subs.set(value, host)
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
    boundSubs.clear()
    liveBound = 0
    deadBound = 0
  }

  // Effect-free per-key binding (perf hot path) — hooks `updater` DIRECTLY into
  // a per-key bound bucket; the source effect calls it with the resolved boolean.
  // Per `.subscribe` call, in the dominant one-subscriber-per-key shape: one
  // `Map.set` of a holder (no Set) plus one dispose closure — zero effects, zero
  // deps arrays, zero tracking-frame pushes. The matching unsubscribe is one
  // field write and no map operation.
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
    let holder = boundSubs.get(value)
    if (holder === undefined) {
      // NEW key — the only place the map can grow, so (as with `subs`) the
      // only place that needs to consider reclaiming. Never sweeps
      // mid-notification: the source effect holds bucket references across its
      // two `boundSubs.get` calls and must not have the map swapped underneath.
      if (!notifying && deadBound >= SWEEP_FLOOR && deadBound > liveBound) sweepBound()
      // First subscriber for this key — store the bare updater (no Set).
      holder = { fn: updater }
      boundSubs.set(value, holder)
      liveBound++
    } else if (holder.fn === null) {
      // Reviving a holder left dead by an earlier unsubscribe — it is still in
      // the map, so no map write is needed, only the accounting.
      holder.fn = updater
      liveBound++
      deadBound--
    } else if (typeof holder.fn === 'function') {
      // Second subscriber — promote to a Set holding both. The holder stays
      // live, so the live/dead counts are unchanged.
      const promoted = new Set<(matches: boolean) => void>()
      promoted.add(holder.fn)
      promoted.add(updater)
      holder.fn = promoted
    } else {
      holder.fn.add(updater)
    }
    // Initial inline call — consumer expects the updater to run synchronously
    // with the current state, same shape as `_bindDirect` / `_bindText`.
    updater(Object.is(current, value))
    const h = holder
    return () => {
      // NO map lookup: the holder is closed over. `h.fn === updater` is the
      // same identity guard the old `boundSubs.get(value) === updater` gave —
      // a second call, or a call after this key was re-subscribed by someone
      // else, matches nothing and correctly no-ops.
      const bucket = h.fn
      if (bucket === updater) {
        h.fn = null
        releaseBound()
      } else if (bucket !== null && typeof bucket !== 'function') {
        bucket.delete(updater)
        // Last subscriber of a promoted key left — drop the now-empty Set so
        // the holder stops retaining it and the key becomes sweepable.
        if (bucket.size === 0) {
          h.fn = null
          releaseBound()
        }
      }
    }
  }

  return selector
}
