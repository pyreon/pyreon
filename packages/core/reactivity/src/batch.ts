// Batch multiple signal updates into a single notification pass.
// Uses a Set so the same subscriber is never flushed more than once per batch,
// even if multiple signals it depends on change within the same batch.

// Dev-mode invariant gate: see https://github.com/pyreon/pyreon/blob/main/packages/core/reactivity/src/tests/batch.test.ts
// for the property-based test that fuzzes random cascade graphs against this
// invariant. The build-time gate folds to dead code in production bundles.
const __DEV__ = process.env.NODE_ENV !== 'production'

let batchDepth = 0

// Single Set, drained in-place during flush. JS Set iteration visits entries
// added during iteration (insertion-order), so cascade notifications enqueued
// while flushing land in the same iteration and dedupe via Set semantics.
//
// An earlier design swapped between two pre-allocated Sets, treating each swap
// as a discrete "cascade round." That created an architectural asymmetry: when
// a subscriber depended on both a 0-hop signal AND a 1-hop indirection (e.g.
// a `createSelector` predicate or a `computed`), batched writes to BOTH would
// queue the subscriber in DIFFERENT rounds — round 1 from the direct path,
// round 2 from the cascade path. Cross-round dedup didn't work because each
// round used a fresh Set; the subscriber fired twice per batched change.
// In list rendering with N items each tracking `isSelected(item.id)` plus a
// shared signal, this scaled to O(N) wasted re-runs per batched selection.
//
// Single-Set iteration handles every case the swap was meant to handle:
//
//   - Diamond (a → b, c → d → effect): notifying `d` twice (from b's and c's
//     recompute) Set-dedupes to one entry; `effect` likewise queued once.
//   - Selector + multi-dep: subscriber's direct enqueue and indirect enqueue
//     hit the same Set in the same iteration — Set.add is a no-op for an
//     already-queued entry.
//   - Self-modifying effect (effect writes a signal it tracks): subscriber
//     already iterated; re-add is a no-op (entry not re-visited within the
//     same flush). Avoids infinite loops without explicit cycle tracking.
const pendingNotifications = new Set<() => void>()

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && pendingNotifications.size > 0) {
      // Keep batching active during flush so cascade-notifications emitted
      // by flushing subscribers enqueue into the same Set (dedup against
      // already-queued entries) instead of firing inline.
      batchDepth = 1
      // Dev-mode invariant: each notify fires AT MOST ONCE per flush. Set
      // iteration semantics + Set.add idempotency are SUPPOSED to guarantee
      // this, but a future change that — for instance — clears+re-adds
      // entries during iteration would silently violate it. The guard
      // catches that early. WeakSet so it tracks identity without pinning
      // notify references in memory across batches.
      const seenThisFlush = __DEV__ ? new WeakSet<() => void>() : undefined
      try {
        for (const notify of pendingNotifications) {
          if (seenThisFlush?.has(notify)) {
            // Don't break the flush — log + skip the redundant call so the
            // app stays responsive while surfacing the regression.
            // oxlint-disable-next-line no-console
            console.warn(
              '[pyreon] batch flush invariant violated: a notification was visited more than once in a single flush. ' +
                'See packages/core/reactivity/src/batch.ts for the dedup contract.',
            )
            continue
          }
          seenThisFlush?.add(notify)
          notify()
        }
      } finally {
        // Clear ALWAYS — even if a notify threw mid-iteration. Without this,
        // the unflushed remainder leaks into the next batch and refires
        // (audit bug #19). Effects wrap their callbacks in try/catch
        // internally so this is rarely reachable in practice, but raw
        // signal subscribers (signal.subscribe) and lower-level consumers
        // can throw straight through, and a future refactor that swallows
        // less aggressively would silently regress without this guard.
        pendingNotifications.clear()
        batchDepth = 0
      }
    }
  }
}

export function isBatching(): boolean {
  return batchDepth > 0
}

export function enqueuePendingNotification(notify: () => void): void {
  pendingNotifications.add(notify)
}

/**
 * Returns a Promise that resolves after all currently-pending microtasks have flushed.
 * Useful when you need to read the DOM after a batch of signal updates has settled.
 *
 * @example
 * count.set(1); count.set(2)
 * await nextTick()
 * // DOM is now up-to-date
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve))
}
