/**
 * The SSR bail in `warnIfInsecureContext`, which the main suite cannot reach:
 * these tests run in happy-dom, where a document always exists, so `isServer`
 * is always false there. Mocking it is cheaper and more honest than an
 * `/* v8 ignore *\/` on a branch that has real behaviour worth pinning — a
 * dev warning that fired during SSR would print once per rendered request on
 * a production server's stdout.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@pyreon/reactivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pyreon/reactivity')>()),
  isServer: true,
}))

describe('warnIfInsecureContext during SSR', () => {
  it('says nothing when there is no DOM', async () => {
    const { warnIfInsecureContext, __resetSecureContextWarnings } = await import('../secure-context')
    __resetSecureContextWarnings()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Even with an insecure "context", the server has no browser to advise.
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
      warnIfInsecureContext('useGeolocation')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    }
  })
})
