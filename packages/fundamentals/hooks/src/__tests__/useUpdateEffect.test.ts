import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

// Mock onUnmount since it requires component lifecycle context
vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => void) => fn(),
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}))

import { useUpdateEffect } from '../useUpdateEffect'

describe('useUpdateEffect', () => {
  it('does not fire on initial setup', () => {
    const callback = vi.fn()
    const source = signal(1)

    useUpdateEffect(source, callback)
    expect(callback).not.toHaveBeenCalled()
  })

  it('fires when source changes', () => {
    const callback = vi.fn()
    const source = signal(1)

    useUpdateEffect(source, callback)
    expect(callback).not.toHaveBeenCalled()

    source.set(2)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(2, 1)
  })

  it('fires on each subsequent change', () => {
    const callback = vi.fn()
    const source = signal(1)

    useUpdateEffect(source, callback)

    source.set(2)
    expect(callback).toHaveBeenCalledTimes(1)

    source.set(3)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledWith(3, 2)
  })
})
