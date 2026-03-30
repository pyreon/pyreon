import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedCallback } from '../useDebouncedCallback'

// Mock onUnmount since it requires component lifecycle context
vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => void) => fn(),
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}))

describe('useDebouncedCallback', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces the callback', () => {
    const fn = vi.fn()
    const debounced = useDebouncedCallback(fn, 100)

    debounced('a')
    debounced('b')
    debounced('c')

    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('cancel prevents the callback', () => {
    const fn = vi.fn()
    const debounced = useDebouncedCallback(fn, 100)

    debounced('a')
    debounced.cancel()
    vi.advanceTimersByTime(200)

    expect(fn).not.toHaveBeenCalled()
  })

  it('flush invokes immediately', () => {
    const fn = vi.fn()
    const debounced = useDebouncedCallback(fn, 100)

    debounced('x')
    debounced.flush()

    expect(fn).toHaveBeenCalledWith('x')
  })

  it('flush is a no-op when no pending timer', () => {
    const fn = vi.fn()
    const debounced = useDebouncedCallback(fn, 100)

    debounced.flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it('flush is a no-op after timer already fired', () => {
    const fn = vi.fn()
    const debounced = useDebouncedCallback(fn, 100)

    debounced('a')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    debounced.flush()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush is a no-op after cancel', () => {
    const fn = vi.fn()
    const debounced = useDebouncedCallback(fn, 100)

    debounced('a')
    debounced.cancel()
    debounced.flush()
    expect(fn).not.toHaveBeenCalled()
  })
})
