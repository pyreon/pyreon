/**
 * The WEB arm of the `useDebouncedCallback` / `useThrottledCallback` native
 * ports — written BEFORE the runtimes, because these two are state machines
 * whose EDGES are the whole contract, and two native ports would happily
 * agree with each other on the wrong ones.
 *
 * The distinction that matters and is easy to get backwards:
 *
 *   debounce → NO leading edge. Nothing fires until the caller goes quiet.
 *   throttle → leading edge AND a trailing one, carrying the LATEST args.
 *
 * Native counterparts:
 *   packages/fundamentals/hooks/native/tests/PyreonRateLimitTests.swift
 *   packages/fundamentals/hooks/native/tests/PyreonRateLimitTest.kt
 */
import { describe, expect, it } from 'vitest'
import { useDebouncedCallback } from '../useDebouncedCallback'
import { useThrottledCallback } from '../useThrottledCallback'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('debounce has NO leading edge', () => {
  it('a single call fires only after the delay', async () => {
    const seen: number[] = []
    const d = useDebouncedCallback((n: number) => seen.push(n), 40)
    d(1)
    expect(seen).toEqual([])
    await tick(70)
    expect(seen).toEqual([1])
  })

  it('a burst produces ONE call, with the LAST args', async () => {
    const seen: number[] = []
    const d = useDebouncedCallback((n: number) => seen.push(n), 40)
    for (const n of [1, 2, 3]) d(n)
    await tick(70)
    expect(seen).toEqual([3])
  })

  it('cancel() drops the pending call entirely', async () => {
    const seen: number[] = []
    const d = useDebouncedCallback((n: number) => seen.push(n), 40)
    d(1)
    d.cancel()
    await tick(70)
    expect(seen).toEqual([])
  })

  it('flush() fires the pending call IMMEDIATELY, and only once', async () => {
    const seen: number[] = []
    const d = useDebouncedCallback((n: number) => seen.push(n), 40)
    d(7)
    d.flush()
    expect(seen).toEqual([7])
    await tick(70)
    // The flushed call must not fire a second time when the timer would
    // have elapsed.
    expect(seen).toEqual([7])
  })
})

describe('throttle HAS a leading edge', () => {
  it('the first call fires synchronously', () => {
    const seen: number[] = []
    const t = useThrottledCallback((n: number) => seen.push(n), 40)
    t(1)
    // This is the whole difference from debounce.
    expect(seen).toEqual([1])
  })

  it('a burst fires leading + ONE trailing, carrying the LAST args', async () => {
    const seen: number[] = []
    const t = useThrottledCallback((n: number) => seen.push(n), 40)
    t(1)
    t(2)
    t(3)
    expect(seen).toEqual([1])
    await tick(70)
    // Not [1,2,3] and not [1,2] — the trailing edge collapses to the last.
    expect(seen).toEqual([1, 3])
  })

  it('cancel() drops the trailing call AND re-arms the leading edge', async () => {
    const seen: number[] = []
    const t = useThrottledCallback((n: number) => seen.push(n), 40)
    t(1)
    t(2)
    t.cancel()
    await tick(70)
    expect(seen).toEqual([1])
    // cancel() clears lastCallTime, so the next call leads again rather
    // than waiting out the original window.
    t(9)
    expect(seen).toEqual([1, 9])
  })
})
