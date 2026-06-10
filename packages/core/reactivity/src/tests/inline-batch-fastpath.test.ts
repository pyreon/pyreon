/**
 * Parity locks for the unbatched-write INLINE batch window (`_set`'s fast
 * path — `openInlineBatch` + direct dispatch + `closeInlineBatch`).
 *
 * These specs pin the OBSERVABLE semantics the fast path must share with the
 * prior `batch(closure)` + queue-round-trip implementation. They pass against
 * BOTH implementations by design (they are parity locks for a perf refactor,
 * not bisect-failing bug regressions — the perf delta itself is locked by
 * `scripts/bench/core/reactivity.ts`, which is machine-dependent and
 * deliberately not CI-gated). Each spec targets one edge the fast path
 * reasons about explicitly:
 *
 *   1. cascade writes from a directly-dispatched callback drain through the
 *      shared two-tier queues (computeds settle before effects),
 *   2. a self-re-enqueueing effect fires exactly once more (no infinite
 *      recursion, no drop),
 *   3. diamond graphs still dedup the apex to one fire per write
 *      (multi-subscriber channels keep the queue path),
 *   4. a throwing direct subscriber leaves the batch system clean (next
 *      write works, queues empty),
 *   5. explicit `batch()` composition over the fast path is unchanged.
 */
import { describe, expect, it } from 'vitest'
import { batch, computed, effect, signal } from '../index'

describe('unbatched-write inline batch window — semantic parity', () => {
  it('cascade write from a direct (_d1) subscriber drains through the queues', () => {
    const a = signal(0)
    const b = signal(0)
    const log: string[] = []
    // a's ONLY consumer is a direct updater that cascades into b.
    a.direct(() => {
      log.push(`a→${a.peek()}`)
      b.set(a.peek() * 10)
    })
    effect(() => {
      log.push(`b=${b()}`)
    })
    log.length = 0
    a.set(1)
    // The direct callback ran synchronously; b's effect drained from the
    // queue after it — strictly ordered, exactly once.
    expect(log).toEqual(['a→1', 'b=10'])
  })

  it('two-tier ordering survives the fast path: computeds settle before effects', () => {
    const src = signal(1)
    const dbl = computed(() => src() * 2)
    const seen: number[] = []
    // src has ONE tracked subscriber (the computed's recompute) → the fast
    // path direct-dispatches it. The effect's rerun is enqueued by the
    // computed's notify and MUST read the settled computed value.
    effect(() => {
      seen.push(dbl())
    })
    src.set(5)
    expect(seen).toEqual([2, 10])
  })

  it('an effect writing its own dep re-fires once more, then converges', () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      runs++
      const v = s()
      // Converging self-write: clamp to 10 (guard prevents infinite loop).
      if (v > 0 && v < 10) s.set(10)
    })
    runs = 0
    s.set(1) // fires effect → writes 10 → effect re-fires reading 10 → stops
    expect(runs).toBe(2)
    expect(s()).toBe(10)
  })

  it('diamond (a → b,c → apex) still fires the apex exactly once per write', () => {
    const a = signal(1)
    const b = computed(() => a() + 1)
    const c = computed(() => a() * 2)
    let apexRuns = 0
    effect(() => {
      b()
      c()
      apexRuns++
    })
    apexRuns = 0
    a.set(2)
    expect(apexRuns).toBe(1)
  })

  it('a throwing direct subscriber leaves the batch system clean for the next write', () => {
    const s = signal(0)
    let calls = 0
    s.direct(() => {
      calls++
      if (calls === 1) throw new Error('boom on first notify')
    })
    expect(() => s.set(1)).toThrow('boom on first notify')
    // The window must have closed cleanly: a subsequent write dispatches
    // normally (no stale queue entries, no stuck batchDepth).
    s.set(2)
    expect(calls).toBe(2)
  })

  it('explicit batch() composition is unchanged: one fire for N writes', () => {
    const x = signal(0)
    const y = signal(0)
    let runs = 0
    effect(() => {
      x()
      y()
      runs++
    })
    runs = 0
    batch(() => {
      x.set(1)
      y.set(1)
      x.set(2)
    })
    expect(runs).toBe(1)
  })

  it('single tracked subscriber via _s (size 1) dispatches exactly once', () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => {
      seen.push(s())
    })
    seen.length = 0
    s.set(7)
    s.set(8)
    expect(seen).toEqual([7, 8])
  })
})
