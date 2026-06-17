import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `attachListener` / `detachListener` in registry.ts both short-circuit with
// `if (isServer) return`. `isServer` (from @pyreon/reactivity) is
// `typeof document === 'undefined'`, evaluated ONCE at module load. happy-dom
// always provides `document`, so under the normal test env those true-arms are
// unreachable. Here we reset the module graph, stub `document` away, and
// dynamically re-import registry + reactivity so `isServer` evaluates to true.

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

  it('attachListener bails early when isServer is true (if@L72 true arm)', async () => {
    const { isServer } = await import('@pyreon/reactivity')
    expect(isServer).toBe(true)

    const registry = await import('../registry')
    // registerHotkey calls attachListener(); with isServer true it must NOT
    // attach a window listener and must NOT throw. The entry still records.
    const unsub = registry.registerHotkey('ctrl+s', () => {})
    expect(registry.getRegisteredHotkeys()).toHaveLength(1)

    // detachListener (if@L158 true arm) is exercised on unsub when entries empty.
    unsub()
    expect(registry.getRegisteredHotkeys()).toHaveLength(0)
  })

  it('_resetHotkeys → detachListener bails early when isServer is true (if@L158 true arm)', async () => {
    const registry = await import('../registry')
    registry.registerHotkey('ctrl+s', () => {})
    // _resetHotkeys calls detachListener() which hits `if (isServer) return`.
    expect(() => registry._resetHotkeys()).not.toThrow()
    expect(registry.getRegisteredHotkeys()).toHaveLength(0)
  })
})
