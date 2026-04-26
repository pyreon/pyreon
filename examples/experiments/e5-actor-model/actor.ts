/**
 * Minimal actor implementation for E5.
 *
 * - Each actor has private state (no external mutation).
 * - All state changes go through messages.
 * - Messages are processed sequentially in FIFO order — even when posted
 *   from concurrent contexts, the actor's reducer runs one at a time.
 * - Subscribers are notified after each message (current state snapshot).
 *
 * Intentionally tiny: ~50 LOC. The point of E5 is to test whether this
 * model structurally prevents two specific reactivity bugs, not to ship
 * a production actor library.
 */

export interface Actor<S, M> {
  /** Current state snapshot. */
  getState(): S
  /** Queue a message. Processed in FIFO order on a microtask. */
  send(msg: M): void
  /** Subscribe to state changes. Returns disposer. */
  subscribe(handler: (state: S) => void): () => void
}

export type Reducer<S, M> = (state: S, msg: M) => S

export function actor<S, M>(initial: S, reducer: Reducer<S, M>): Actor<S, M> {
  let state = initial
  const queue: M[] = []
  const subscribers = new Set<(state: S) => void>()
  let scheduled = false

  function flush(): void {
    scheduled = false
    while (queue.length > 0) {
      const msg = queue.shift() as M
      state = reducer(state, msg)
    }
    // Snapshot subscribers iteration to avoid mid-loop mutation.
    for (const sub of [...subscribers]) sub(state)
  }

  return {
    getState: () => state,
    send: (msg) => {
      queue.push(msg)
      if (!scheduled) {
        scheduled = true
        // Microtask — same scheduling boundary that signals use, so
        // comparison with the signal-version is fair.
        queueMicrotask(flush)
      }
    },
    subscribe: (handler) => {
      subscribers.add(handler)
      return () => subscribers.delete(handler)
    },
  }
}
