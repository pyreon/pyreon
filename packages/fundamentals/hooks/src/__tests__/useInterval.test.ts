import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInterval } from '../useInterval'

// Mock onUnmount since it requires component lifecycle context
vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => void) => fn(),
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}))

describe('useInterval', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls callback at the specified interval', () => {
    const fn = vi.fn()
    useInterval(fn, 100)

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not call callback when delay is null', () => {
    const fn = vi.fn()
    useInterval(fn, null)

    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('calls the latest callback', () => {
    let value = 0
    let currentCb = () => {
      value = 1
    }
    useInterval(() => currentCb(), 100)

    currentCb = () => {
      value = 2
    }
    vi.advanceTimersByTime(100)
    expect(value).toBe(2)
  })

  it('accepts a getter for delay (static number)', () => {
    const fn = vi.fn()
    useInterval(fn, () => 100)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('pauses when getter returns null', () => {
    const fn = vi.fn()
    useInterval(fn, () => null)
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('reactively restarts when getter signal changes', () => {
    const fn = vi.fn()
    const running = signal(true)
    useInterval(fn, () => (running() ? 100 : null))

    // running — fires every 100ms
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    // pause
    running.set(false)
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)

    // resume
    running.set(true)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('reactively changes interval when delay value changes', () => {
    const fn = vi.fn()
    const delay = signal(100)
    useInterval(fn, () => delay())

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    // Switch to 50ms — should fire twice in next 100ms
    delay.set(50)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
