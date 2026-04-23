// Batch multiple signal updates into a single notification pass.
// Uses a Set so the same subscriber is never flushed more than once per batch,
// even if multiple signals it depends on change within the same batch.

let batchDepth = 0

// Two pre-allocated Sets swapped on each flush — avoids allocating a new Set()
// on every batch exit. The "active" set collects enqueued notifications; on flush
// we swap to the other set and iterate the captured one, then clear it for reuse.
const setA = new Set<() => void>()
const setB = new Set<() => void>()
let pendingNotifications = setA

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && pendingNotifications.size > 0) {
      // Keep batching active during flush so cascade-notifications emitted
      // by flushing subscribers enqueue into the pending Set (and dedupe
      // against what's already queued) instead of firing inline. The
      // while-loop drains any cascade rounds until the graph is stable.
      //
      // Without this, a diamond dependency (a → b, c → d → effect) re-fires
      // the apex effect TWICE per signal write: the first notification path
      // through `b` reaches `effect`, whose read clears `d`'s dirty flag;
      // then when `c` is notified (still in the first flush round), it
      // re-dirties `d`, which re-notifies `effect`. Keeping batchDepth at 1
      // during flush routes those cascade-notifications through the Set,
      // which dedupes on `d`'s recompute and on `effect`'s run.
      //
      // See `packages/internals/perf-harness/src/tests/diamond-probe.test.ts`
      // for the empirical probe that caught this.
      batchDepth = 1
      try {
        while (pendingNotifications.size > 0) {
          // Swap to the other pre-allocated Set before flushing so new
          // enqueues during notification land in the alternate Set, not
          // mixed into the current iteration.
          const flush = pendingNotifications
          pendingNotifications = flush === setA ? setB : setA
          for (const notify of flush) notify()
          flush.clear()
        }
      } finally {
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
