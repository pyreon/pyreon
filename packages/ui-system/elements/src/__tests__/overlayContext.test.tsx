import { popContext } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OverlayContextProvider, { useOverlayContext } from '../Overlay/context'

describe('Overlay context', () => {
  it('useOverlayContext is a function', () => {
    expect(typeof useOverlayContext).toBe('function')
  })

  it('returns a working no-op default context when called outside a provider', () => {
    // The default context carries no-op `setBlocked`/`setUnblocked` (not the
    // former `{}` cast-lie) so a `useOverlay` used outside any provider gets a
    // callable coordinator instead of relying on `ctx.setBlocked?.()` optional
    // chaining. `OverlayProvider` now also accepts these props optionally.
    const ctx = useOverlayContext()
    expect(ctx.blocked).toBe(false)
    expect(typeof ctx.setBlocked).toBe('function')
    expect(typeof ctx.setUnblocked).toBe('function')
    expect(() => {
      ctx.setBlocked()
      ctx.setUnblocked()
    }).not.toThrow()
  })

  it('a root provider with no coordination props falls back to no-op defaults', () => {
    OverlayContextProvider({ children: 'root' })
    const ctx = useOverlayContext()
    expect(ctx.blocked).toBe(false)
    expect(typeof ctx.setBlocked).toBe('function')
    expect(() => ctx.setBlocked()).not.toThrow()
    popContext()
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
