/**
 * REPRODUCTION + REGRESSION — `revalidate()` set a 30s `setTimeout` via
 * `Promise.race`, then did NOT clear the timer when `handler(req)` won the
 * race (the common path). Each background revalidation therefore left one
 * pending timer for up to `REVALIDATE_TIMEOUT_MS` (default 30s), each
 * pinning a closure + the rejection callback. Under sustained
 * revalidation traffic on a high-RPS deployment, hundreds of pending
 * timers pile up.
 *
 * Class C-adjacent (unbounded growth of pending timers). Fix: capture
 * the timer id and `clearTimeout` in `finally` so the success path
 * tears down the rejection branch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createISRHandler } from '../isr'

describe('createISRHandler revalidate — clears the timeout on the success path', () => {
  let activeTimers: number
  let originalSetTimeout: typeof globalThis.setTimeout
  let originalClearTimeout: typeof globalThis.clearTimeout

  beforeEach(() => {
    activeTimers = 0
    originalSetTimeout = globalThis.setTimeout
    originalClearTimeout = globalThis.clearTimeout
    // Track every active timer so we can assert on the post-revalidate
    // count. The instrumentation MUST be at the global level (not
    // vi.useFakeTimers) — the bug is that the rejection branch's setTimeout
    // never gets cleared, and fake-timer test envs treat that as a
    // pending-timer count of zero (they hide the leak).
    globalThis.setTimeout = ((...args: Parameters<typeof originalSetTimeout>) => {
      activeTimers++
      const id = originalSetTimeout(...args)
      return id
    }) as typeof globalThis.setTimeout
    globalThis.clearTimeout = ((id: Parameters<typeof originalClearTimeout>[0]) => {
      activeTimers = Math.max(0, activeTimers - 1)
      return originalClearTimeout(id)
    }) as typeof globalThis.clearTimeout
  })
  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  })

  it('REGRESSION: 5 successful revalidations leave zero pending revalidate timers', async () => {
    // Fast handler — wins the Promise.race every time, so the rejection
    // branch's timer should be cleared. Pre-fix, the timer leaked.
    let i = 0
    const handler = vi.fn(
      async () =>
        new Response(`<html>v${i++}</html>`, { headers: { 'content-type': 'text/html' } }),
    )

    // Tiny revalidate window so we can drive multiple stale requests
    // without sleeping the test runtime. revalidateTimeoutMs short so
    // pending timers (if they leak) finish settling within the test;
    // the assertion runs BEFORE that window so we measure the leak
    // even when timers DO eventually fire.
    const isr = createISRHandler(handler, {
      revalidate: 0.001,
      revalidateTimeoutMs: 1000,
    })

    // Warm the cache for 5 distinct URLs. Each URL needs its own cache
    // entry because revalidate() dedupes by key via the `revalidating`
    // Set — N concurrent stale-hits on the SAME key share ONE
    // background revalidation, but N stale-hits on N keys produce N.
    for (let n = 0; n < 5; n++) {
      await isr(new Request(`http://localhost/p${n}`))
    }
    expect(handler).toHaveBeenCalledTimes(5)

    // Wait so all 5 cached entries are stale.
    await new Promise((resolve) => originalSetTimeout(resolve, 10))
    const baseline = activeTimers

    // Trigger 5 stale cache hits — each fires a background revalidate
    // → ONE `Promise.race` → ONE `setTimeout` that must be cleared on
    // success.
    for (let n = 0; n < 5; n++) {
      await isr(new Request(`http://localhost/p${n}`))
    }

    // Wait for ALL 5 background revalidations to complete (they're
    // fire-and-forget so we can't await them directly; multiple
    // microtask flushes let the awaits in revalidate() — handler(),
    // res.text(), etc. — all settle.
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((resolve) => queueMicrotask(resolve))
    }

    // The critical assertion: pending-timer delta is ZERO. Pre-fix the
    // 5 revalidations leave 5 timers pending (one per Promise.race)
    // until they fire 1000ms later. Post-fix, every success-path
    // clearTimeout brings the count back to baseline.
    expect(activeTimers - baseline).toBe(0)
  })
})
