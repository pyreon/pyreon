// Batch multiple signal updates into a single notification pass.
// Uses a Set so the same subscriber is never flushed more than once per batch,
// even if multiple signals it depends on change within the same batch.

let batchDepth = 0
let pendingNotifications = new Set<() => void>()

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      // Swap to a fresh Set before flushing so new enqueues during notification
      // (e.g. from nested batch() calls) land in the new Set and are handled in
      // the next flush pass, not mixed into the current iteration.
      const flush = pendingNotifications
      pendingNotifications = new Set()
      for (const notify of flush) notify()
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
