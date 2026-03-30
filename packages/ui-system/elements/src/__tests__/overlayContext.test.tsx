import { popContext } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OverlayContextProvider, { useOverlayContext } from '../Overlay/context'

describe('Overlay context', () => {
  it('useOverlayContext is a function', () => {
    expect(typeof useOverlayContext).toBe('function')
  })

  it('returns the default context (empty object) when called outside a provider', () => {
    const ctx = useOverlayContext()
    expect(ctx).toEqual({})
  })
})

describe('OverlayContextProvider component', () => {
  afterEach(() => {
    try {
      popContext()
    } catch {
      // Ignore if no context was pushed
    }
  })

  it('provides blocked/setBlocked/setUnblocked via context', () => {
    const setBlocked = vi.fn()
    const setUnblocked = vi.fn()

    OverlayContextProvider({
      blocked: true,
      setBlocked,
      setUnblocked,
      children: 'child',
    })

    const ctx = useOverlayContext()
    expect(ctx.blocked).toBe(true)
    expect(ctx.setBlocked).toBe(setBlocked)
    expect(ctx.setUnblocked).toBe(setUnblocked)
  })

  it('renders children (returns a value)', () => {
    const result = OverlayContextProvider({
      blocked: false,
      setBlocked: vi.fn(),
      setUnblocked: vi.fn(),
      children: 'Hello overlay',
    })

    expect(result).toBeDefined()
  })

  it('provides blocked as false', () => {
    OverlayContextProvider({
      blocked: false,
      setBlocked: vi.fn(),
      setUnblocked: vi.fn(),
      children: null,
    })

    const ctx = useOverlayContext()
    expect(ctx.blocked).toBe(false)
  })

  it('provides blocked as a function when passed as a function', () => {
    const blockedFn = () => true

    OverlayContextProvider({
      blocked: blockedFn,
      setBlocked: vi.fn(),
      setUnblocked: vi.fn(),
      children: null,
    })

    const ctx = useOverlayContext()
    expect(ctx.blocked).toBe(blockedFn)
  })
})
