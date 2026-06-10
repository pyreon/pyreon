import { afterEach, describe, expect, it, vi } from 'vitest'

// `isServer` / `isClient` are evaluated at module load from `typeof document`.
// Re-import the module under a stubbed global to exercise BOTH branches in one
// (node) environment: `vi.resetModules()` forces env.ts to re-run its top-level
// const evaluation against the currently-stubbed `globalThis.document`.
describe('env detection — isServer / isClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('isServer=true / isClient=false when there is no document (SSR / Node / Worker)', async () => {
    vi.stubGlobal('document', undefined)
    vi.resetModules()
    const { isServer, isClient } = await import('../environment')
    expect(isServer).toBe(true)
    expect(isClient).toBe(false)
  })

  it('isServer=false / isClient=true when a document exists (browser main thread)', async () => {
    vi.stubGlobal('document', { title: 'stub' })
    vi.resetModules()
    const { isServer, isClient } = await import('../environment')
    expect(isServer).toBe(false)
    expect(isClient).toBe(true)
  })

  it('isClient is always the exact inverse of isServer', async () => {
    vi.stubGlobal('document', undefined)
    vi.resetModules()
    const a = await import('../environment')
    expect(a.isClient).toBe(!a.isServer)
  })
})
