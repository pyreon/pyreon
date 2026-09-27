/**
 * Reconnect delay for attempt `attempt` (0-based): exponential from `base`,
 * CAPPED at `max`, with "equal jitter" — a uniform pick in `[capped/2, capped]`.
 *
 * Why each part:
 * - The cap: `base * 2 ** attempt` is unbounded. With unlimited attempts it
 *   passes the 2^31-1 ms `setTimeout` ceiling after ~31 failures, and a delay
 *   over that ceiling fires IMMEDIATELY — the backoff turns into a reconnect
 *   storm against a server that is already down (it reaches `Infinity`
 *   eventually, which behaves the same).
 * - The jitter: every client that lost the same server retries on the same
 *   schedule without it, so they all return at once (thundering herd). Half
 *   the window stays deterministic so a retry never lands at ~0 ms.
 */
export function computeReconnectDelay(attempt: number, base: number, max: number): number {
  const capped = Math.min(max, base * 2 ** attempt)
  return capped / 2 + Math.random() * (capped / 2)
}

/** Default ceiling for the reconnect backoff (ms). */
export const DEFAULT_MAX_RECONNECT_DELAY = 30_000
