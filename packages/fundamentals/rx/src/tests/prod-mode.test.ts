// Production-mode coverage: the normal run is NODE_ENV=test, so the
// `if (NODE_ENV !== 'production')` perf-counter gates in each transform helper
// take their TRUE side. This file flips NODE_ENV to production BEFORE the
// modules load, exercising the FALSE (production) side for both signal + raw.
import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('NODE_ENV', 'production')
const { filter, map, sortBy, groupBy } = await import('../collections')
const { sum, count, average, min, max, reduce, every, some } = await import('../aggregation')
const { debounce, throttle } = await import('../timing')
const { pipe } = await import('../pipe')

describe('rx — production-mode (NODE_ENV=production) gate false-sides', () => {
  it('the transform surface runs with dev counters off (signal + raw)', () => {
    const sig = signal([1, 2, 3, 2])
    // collections — signal + raw
    expect(typeof filter(sig, (n) => n > 1)).toBe('function')
    expect(typeof map(sig, (n) => n * 2)).toBe('function')
    expect(typeof sortBy(sig, (n) => n)).toBe('function')
    expect(typeof groupBy(sig, (n) => String(n % 2))).toBe('function')
    expect(filter([1, 2, 3], (n) => n > 1)).toEqual([2, 3])
    expect(map([1, 2, 3], (n) => n * 2)).toEqual([2, 4, 6])
    sortBy([3, 1, 2, 2], (n) => n) // a tie (two 2s) exercises the `=== 0` arm
    groupBy([1, 2, 3], (n) => String(n % 2))
    // aggregation — signal + raw
    for (const fn of [sum, count, average, min, max]) expect(typeof fn(sig)).toBe('function')
    expect(sum([1, 2, 3])).toBe(6)
    expect(count([1, 2, 3])).toBe(3)
    expect(min([2, 1, 3])).toBe(1)
    expect(max([2, 1, 3])).toBe(3)
    expect(reduce([1, 2, 3], (a, b) => a + b, 0)).toBe(6)
    expect(every([2, 4], (n) => n % 2 === 0)).toBe(true)
    expect(some([1, 2], (n) => n > 1)).toBe(true)
    // timing — change the source so the debounce/throttle internals run
    const d = debounce(sig, 5)
    const t = throttle(sig, 5)
    sig.set([9, 8])
    sig.set([7])
    d.dispose()
    t.dispose()
    // pipe
    expect(pipe([1, 2, 3, 4], (a: number[]) => a.filter((n) => n % 2 === 0))).toEqual([2, 4])
  })
})
