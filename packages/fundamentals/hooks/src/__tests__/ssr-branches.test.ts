/**
 * Branch coverage tests for SSR / no-context fallback paths.
 *
 * Each hook below has an early-return branch that fires only when window
 * / navigator / theme context is undefined. Happy-dom always provides
 * those, so the SSR branch normally goes uncovered.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { useClipboard } from '../useClipboard'

// NOTE: the SSR fallbacks of `useOnline` / `useEventListener` are gated on the
// module-level `isClient` (from @pyreon/reactivity, evaluated once at import).
// They CANNOT be exercised by runtime-deleting `window` in happy-dom — the real
// SSR environment has no DOM at module load. Those cases live in the companion
// `ssr-branches.node.test.ts` (a true node env, document absent at load). The
// hooks below still gate per-call on `navigator` / theme context, so they're
// correctly tested here by runtime global mutation.

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
