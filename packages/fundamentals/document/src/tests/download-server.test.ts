/**
 * Server-environment branch for `download()`.
 *
 * `download()` reads `isServer` from `@pyreon/reactivity` (`typeof
 * document === 'undefined'`, evaluated once at module load). Under
 * happy-dom `document` exists, so `isServer` is always `false` and the
 * `if (isServer) throw` guard's true side is unreachable in the normal
 * suite. Here we mock the reactivity module to force `isServer === true`
 * and re-import download fresh, exercising the server-guard throw.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@pyreon/reactivity')
})

describe('download() — server environment guard', () => {
  it('throws when isServer is true (no browser DOM)', async () => {
    vi.doMock('@pyreon/reactivity', async () => {
      const actual = await vi.importActual<typeof import('@pyreon/reactivity')>('@pyreon/reactivity')
      return { ...actual, isServer: true }
    })

    // Fresh import so download.ts re-binds the mocked `isServer`.
    const { download } = await import('../download')
    const { Document, Text } = await import('../nodes')
    const node = Document({ children: Text({ children: 'hi' }) })

    await expect(download(node, 'report.html')).rejects.toThrow(
      /requires a browser environment/,
    )
  })
})
