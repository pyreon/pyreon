/**
 * Coverage-focused tests for `tracking.ts` + `batch.ts` uncovered branches.
 *
 * tracking.ts uncovered:
 *   - `notifySubscribers` multi-subscriber non-batching path (lines 95-100)
 *     — fires when 2+ subscribers receive a signal change WITHOUT being
 *     inside a `batch()`. Most existing tests use effects which batch.
 *   - `notifySubscribers` single-subscriber non-batching path (line 81)
 *     — fires when 1 subscriber receives a signal change outside a batch.
 *
 * batch.ts uncovered:
 *   - MAX_PASSES exceeded warning (lines 103-115) — the dev-time
 *     safeguard for infinite re-enqueue loops. Needs a pathological
 *     effect that writes to its own dep > 32 times in a row.
 */
import { signal, effect, batch } from '../index'

describe('tracking.ts — coverage of uncovered branches', () => {
  test('notifySubscribers multi-subscriber non-batching path (lines 95-100)', () => {
    // Two raw subscribers on a signal, no batch — exercises the
    // originalSize-capped inline iteration path.
    const s = signal(0)
    const log: string[] = []

    // Two effects subscribed to s — effect() internally uses notifySubscribers.
    const e1 = effect(() => {
      log.push(`a:${s()}`)
    })
    const e2 = effect(() => {
      log.push(`b:${s()}`)
    })

    log.length = 0
    // NO batch — notifySubscribers takes the inline-iteration branch.
    s.set(1)

    // Both subscribers fired
    expect(log.filter((l) => l.startsWith('a:')).length).toBeGreaterThanOrEqual(1)
    expect(log.filter((l) => l.startsWith('b:')).length).toBeGreaterThanOrEqual(1)

    e1.dispose()
    e2.dispose()
  })

  test('notifySubscribers single-subscriber non-batching fires sub() inline (line 81)', () => {
    const s = signal(0)
    let runs = 0
    const e = effect(() => {
      s()
      runs++
    })
    runs = 0
    // Single subscriber, no batch — the fast path hits the `else sub()` branch.
    s.set(1)
    expect(runs).toBe(1)
    e.dispose()
  })
})

describe('batch.ts — MAX_PASSES safeguard (lines 103-115)', () => {
  test('warns and drops effects when MAX_PASSES exceeded', () => {
    // Construct an effect that re-enqueues itself > MAX_PASSES (32) times.
    // The flush loops up to MAX_PASSES; on the 33rd attempt the warn fires
    // and pending effects are dropped (NOT retried).
    const originalWarn = console.warn
    const warnings: string[] = []
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      const counter = signal(0)
      // The effect re-writes counter each time it runs — every run enqueues
      // itself for the next pass. After 32 passes the safeguard fires.
      const e = effect(() => {
        const v = counter()
        if (v < 100) counter.set(v + 1)
      })

      // Single batched write to kick it off; the effect loop drives the
      // re-enqueue until the safeguard fires.
      batch(() => {
        counter.set(1)
      })

      const droppedWarn = warnings.find((w) =>
        w.includes('batch effect flush exceeded MAX_PASSES'),
      )
      expect(droppedWarn).toBeDefined()
      expect(droppedWarn).toContain('possible infinite re-enqueue loop')
      expect(droppedWarn).toContain('pending effects dropped')

      e.dispose()
    } finally {
      console.warn = originalWarn
    }
  })
})
