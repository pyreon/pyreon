// The bounded-concurrency helper behind the tooling's latency-bound loops.
//
// Two properties carry real weight and are asserted rather than assumed:
//
//   1. **Results come back in INPUT order**, whatever order tasks finish in.
//      A caller building a summary (published / skipped / failed) depends on
//      it, and completion order is the one thing concurrency guarantees is
//      unstable.
//   2. **`concurrency: 1` is strictly sequential.** This is what lets the
//      release script run its publish loop through the same code path as its
//      dry run — ordered when publishing, parallel when not. If it ever
//      overlapped at 1, a real release would interleave, and the failure would
//      surface as a corrupt release rather than a red test.
import { describe, expect, it } from 'vitest'
import { runPool } from '../../../../../scripts/run-pool'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('runPool', () => {
  it('returns results in INPUT order, not completion order', async () => {
    // Deliberately inverted delays: the last item finishes first.
    const out = await runPool(
      [30, 20, 10, 0],
      async (ms, i) => {
        await tick(ms)
        return i
      },
      { concurrency: 4 },
    )
    expect(out).toEqual([0, 1, 2, 3])
  })

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    await runPool(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await tick(5)
        inFlight--
      },
      { concurrency: 3 },
    )
    expect(peak).toBe(3)
  })

  it('at concurrency 1 runs strictly one at a time, in order', async () => {
    const events: string[] = []
    await runPool(
      ['a', 'b', 'c'],
      async (name) => {
        events.push(`start:${name}`)
        await tick(5)
        events.push(`end:${name}`)
      },
      { concurrency: 1 },
    )
    // No interleaving anywhere — this is the guarantee the release path relies
    // on to share one implementation with the dry run.
    expect(events).toEqual([
      'start:a',
      'end:a',
      'start:b',
      'end:b',
      'start:c',
      'end:c',
    ])
  })

  it('at concurrency 1 each task observes every earlier task’s effect', async () => {
    // The publish loop's shape: a task's decision reads state written by the
    // tasks before it. Under overlap those reads would race.
    const done: number[] = []
    const seen = await runPool(
      [0, 1, 2, 3],
      async (n) => {
        const before = [...done]
        await tick(3)
        done.push(n)
        return before.length
      },
      { concurrency: 1 },
    )
    expect(seen).toEqual([0, 1, 2, 3])
  })

  it('handles an empty list without hanging', async () => {
    expect(await runPool([], async () => 1, { concurrency: 4 })).toEqual([])
  })

  it('treats a concurrency below 1 as 1 rather than deadlocking', async () => {
    expect(await runPool([1, 2], async (n) => n * 2, { concurrency: 0 })).toEqual([2, 4])
  })

  it('rejects when a task rejects, like the loop it replaces', async () => {
    await expect(
      runPool(
        [1, 2, 3],
        async (n) => {
          if (n === 2) throw new Error('boom')
          return n
        },
        { concurrency: 2 },
      ),
    ).rejects.toThrow('boom')
  })
})
