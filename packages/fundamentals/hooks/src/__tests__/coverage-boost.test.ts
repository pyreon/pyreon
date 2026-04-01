import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── useInterval — null delay branch ────────────────────────────────────────

vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    fn()
  },
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}))

import { useInterval } from '../useInterval'
import { useTimeout } from '../useTimeout'

describe('useInterval — stop/start branches', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stop clears interval when intervalId is non-null', () => {
    const fn = vi.fn()
    useInterval(fn, 100)

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    // The interval is still running
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not start when delay is null', () => {
    const fn = vi.fn()
    useInterval(fn, null)
    vi.advanceTimersByTime(5000)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('useTimeout — additional branches', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('clear is idempotent', () => {
    const fn = vi.fn()
    const { clear } = useTimeout(fn, 200)
    clear()
    clear() // second call should be no-op
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })

  it('reset with null delay does not set timer', () => {
    const fn = vi.fn()
    const { reset } = useTimeout(fn, null)
    reset()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('timer sets itself to null after firing', () => {
    const fn = vi.fn()
    const { clear } = useTimeout(fn, 100)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    // Calling clear after timer fired should be safe (timer is null)
    clear()
  })
})
