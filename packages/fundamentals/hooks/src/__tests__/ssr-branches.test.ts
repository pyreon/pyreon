/**
 * Branch coverage tests for SSR / no-context fallback paths.
 *
 * Each hook below has an early-return branch that fires only when window
 * / navigator / theme context is undefined. Happy-dom always provides
 * those, so the SSR branch normally goes uncovered.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { useClipboard } from '../useClipboard'
import { useEventListener } from '../useEventListener'
import { useOnline } from '../useOnline'
import { useThemeValue } from '../useThemeValue'

describe('useThemeValue — no theme context', () => {
  it('returns undefined when called outside a theme provider', () => {
    const got = useThemeValue('colors.primary.button')
    expect(got).toBeUndefined()
  })
})

describe('useOnline — SSR fallback', () => {
  const originalWindow = globalThis.window
  const originalNav = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNav,
      configurable: true,
      writable: true,
    })
  })

  it('returns true unconditionally when window is undefined (SSR)', () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    const online = useOnline()
    expect(online()).toBe(true)
  })
})

describe('useEventListener — SSR no-op', () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    })
  })

  it('returns early without throwing when window is undefined (SSR)', () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    expect(() => useEventListener('resize', () => {})).not.toThrow()
  })
})

describe('useClipboard — SSR + clipboard-failure branches', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
  })

  it('copy() returns false when navigator is undefined (SSR)', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    const cb = useClipboard()
    const result = await cb.copy('hello')
    expect(result).toBe(false)
    expect(cb.copied()).toBe(false)
  })

  it('copy() catches clipboard.writeText rejection', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: async () => {
            throw new Error('denied')
          },
        },
      },
      configurable: true,
      writable: true,
    })
    const cb = useClipboard()
    const result = await cb.copy('x')
    expect(result).toBe(false)
    expect(cb.copied()).toBe(false)
  })
})
