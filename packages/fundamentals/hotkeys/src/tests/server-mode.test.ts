import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `@pyreon/hotkeys` drives a browser `keydown` listener, so on the server it
// registers nothing and mutates no shared module state. The registry + active
// scopes are module-level singletons SHARED across every SSR request — pushing
// entries or flipping scopes on the server would (a) leak unboundedly (no
// unmount fires during `renderToString`) and (b) BLEED one request's hotkeys /
// scopes into the next. These tests stub `document` away so the freshly
// re-imported `@pyreon/reactivity` computes `isServer === true`, then assert
// every mutating entry point is inert.

describe('registry.ts — server-mode (isServer) guards', () => {
  let savedDocument: typeof globalThis.document

  beforeEach(() => {
    savedDocument = globalThis.document
    vi.resetModules()
    // Remove `document` so the freshly-imported @pyreon/reactivity computes
    // isServer === true.
    // @ts-expect-error — deliberately removing document for the SSR-guard test.
    delete globalThis.document
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: savedDocument,
      configurable: true,
      writable: true,
    })
    vi.resetModules()
  })

  it('registerHotkey is a no-op on the server — no entry recorded, no shared-state bleed', async () => {
    const { isServer } = await import('@pyreon/reactivity')
    expect(isServer).toBe(true)

    const registry = await import('../registry')
    // The entry must NOT be recorded (would leak + bleed across requests), and
    // registerHotkey must not throw. It returns an inert unregister.
    const unsub = registry.registerHotkey('ctrl+s', () => {})
    expect(registry.getRegisteredHotkeys()).toHaveLength(0)
    expect(() => unsub()).not.toThrow()
  })

  it('enableScope / disableScope are no-ops on the server — no scope bleed', async () => {
    const registry = await import('../registry')
    registry.enableScope('modal')
    // The shared activeScopes signal must stay clean (only 'global').
    expect(registry.getActiveScopes().peek().has('modal')).toBe(false)
    expect(registry.getActiveScopes().peek().size).toBe(1)
    // Releasing an un-acquired scope must also be inert.
    expect(() => registry.disableScope('modal')).not.toThrow()
  })

  it('_resetHotkeys → detachListener bails early when isServer is true', async () => {
    const registry = await import('../registry')
    registry.registerHotkey('ctrl+s', () => {})
    // _resetHotkeys calls detachListener() which hits `if (isServer) return`.
    expect(() => registry._resetHotkeys()).not.toThrow()
    expect(registry.getRegisteredHotkeys()).toHaveLength(0)
  })
})
