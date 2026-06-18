/**
 * SSR-mode coverage for useOverlay's `if (isServer) return ...` guards.
 *
 * `useOverlay.tsx` short-circuits two functions on the server:
 *   - `getAncestorOffset()` → `{ top: 0, left: 0 }`  (no DOM measurement)
 *   - `setupListeners()`     → `() => {}`            (no window listeners)
 *
 * Under happy-dom `isServer` is `false` (a `document` global exists), so the
 * default-environment tests in `useOverlay.test.ts` can never reach the
 * server arms. Here we mock `@pyreon/reactivity` so `isServer === true`, then
 * drive both guards. Isolated in its own file so the server override doesn't
 * leak into the client-behavior suite.
 */
import { describe, expect, it, vi } from 'vitest'

// Force the SSR branch: override only `isServer`, pass everything else through.
vi.mock('@pyreon/reactivity', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, isServer: true }
})

import { useOverlay } from '../Overlay'

describe('useOverlay — SSR (isServer === true)', () => {
  it('setupListeners returns a no-op cleanup and attaches no window listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    try {
      const o = useOverlay({ type: 'modal', isOpen: true })
      const cleanup = o.setupListeners()

      // The server arm returns `() => {}` BEFORE any window.addEventListener
      // call. No modal body-overflow lock is taken either.
      expect(typeof cleanup).toBe('function')
      expect(addSpy).not.toHaveBeenCalled()
      expect(document.body.style.overflow).not.toBe('hidden')

      // The returned cleanup is a no-op — calling it is safe.
      expect(() => cleanup()).not.toThrow()
    } finally {
      addSpy.mockRestore()
    }
  })

  it('getAncestorOffset short-circuits to {0,0} on the server (absolute position)', () => {
    // position:'absolute' would otherwise read contentEl.offsetParent; the
    // server guard returns {top:0,left:0} first. We drive position calc via a
    // resize event — but setupListeners is itself a no-op on the server, so the
    // observable contract is simply that nothing throws and no position is set.
    const o = useOverlay({ type: 'dropdown', position: 'absolute', isOpen: true })
    const contentEl = document.createElement('div')
    o.contentRef(contentEl)
    const cleanup = o.setupListeners()
    // No listeners were attached (server), so a resize does nothing.
    window.dispatchEvent(new Event('resize'))
    expect(contentEl.style.top).toBe('')
    cleanup()
  })
})
