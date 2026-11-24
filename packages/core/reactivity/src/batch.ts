// Batch multiple signal updates into a single flush.
//
// The queue, the marking walk and the flush itself live in `graph.ts`; this
// module is the public window API over them. A batch window only defers the
// FLUSH: signal writes commit immediately (`peek()` inside a batch sees them),
// marking happens at write time, and a computed read inside the window resolves
// its marks first, so it is always fresh. Effects, render bindings, direct
// updaters and listeners queued by the writes run once each, in depth-first
// subscription order, when the outermost window closes.
import { _b, endBatch } from './graph'

export function batch(fn: () => void): void {
  _b.d++
  try {
    fn()
  } finally {
    endBatch()
  }
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
