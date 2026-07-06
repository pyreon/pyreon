/**
 * PZ-11 — `matchesProxyContext` mirrors Vite's own `doesProxyContextMatchUrl`
 * (vite/src/node/server/middlewares/proxy.ts):
 *
 *     context[0] === '^' && new RegExp(context).test(url) || url.startsWith(context)
 *
 * The dev middlewares (SSR catch-all + 404 handler) use it to yield
 * proxy-owned URLs to Vite's downstream proxy middleware instead of
 * swallowing them with 404 HTML. The guard and Vite's proxy MUST agree on
 * ownership, so these specs lock the exact semantics: prefix match on the
 * FULL url (including query string), `^`-prefixed contexts as RegExp.
 *
 * Runtime behavior (real Vite dev server + real backend) is locked by
 * `tests/integration/dev-proxy.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { matchesProxyContext } from '../vite-plugin'

describe('matchesProxyContext — Vite doesProxyContextMatchUrl parity', () => {
  it('prefix context matches URLs under it', () => {
    expect(matchesProxyContext('/api/proxied/hello', ['/api/proxied'])).toBe(true)
    expect(matchesProxyContext('/backend', ['/backend'])).toBe(true)
    expect(matchesProxyContext('/backend/deep/path', ['/backend'])).toBe(true)
  })

  it('prefix context matches the full URL including the query string', () => {
    // Vite matches `req.url` (path + query), not a stripped pathname.
    expect(matchesProxyContext('/backend/data?q=1&page=2', ['/backend'])).toBe(true)
  })

  it('prefix matching is plain startsWith — NOT segment-aware (Vite parity)', () => {
    // `/backendish` starts with `/backend` → Vite proxies it; so do we.
    // Locking the quirk deliberately: diverging from Vite here would make
    // the guard and the downstream proxy disagree on ownership.
    expect(matchesProxyContext('/backendish', ['/backend'])).toBe(true)
  })

  it('non-matching URLs return false', () => {
    expect(matchesProxyContext('/about', ['/api/proxied', '/backend'])).toBe(false)
    expect(matchesProxyContext('/', ['/api'])).toBe(false)
    // Prefix is anchored at the start — a mid-URL occurrence is not a match.
    expect(matchesProxyContext('/x/backend', ['/backend'])).toBe(false)
  })

  it('^-prefixed context is a RegExp against the URL', () => {
    expect(matchesProxyContext('/rx/123', ['^/rx/\\d+'])).toBe(true)
    expect(matchesProxyContext('/rx/abc', ['^/rx/\\d+'])).toBe(false)
    // RegExp sees the query string too (full req.url).
    expect(matchesProxyContext('/rx/9?debug=1', ['^/rx/\\d+'])).toBe(true)
  })

  it('any matching context in the list wins', () => {
    expect(
      matchesProxyContext('/graphql', ['/api', '^/rx/\\d+', '/graphql']),
    ).toBe(true)
  })

  it('empty context list never matches', () => {
    expect(matchesProxyContext('/anything', [])).toBe(false)
  })

  it('invalid ^-RegExp context is treated as non-matching, not a throw', () => {
    // Deliberate divergence from Vite (which would throw inside ITS
    // middleware): a throw from zero's guard would 500 the request with a
    // stack pointing at the wrong owner. See matchesProxyContext JSDoc.
    expect(() => matchesProxyContext('/x', ['^([invalid'])).not.toThrow()
    expect(matchesProxyContext('/x', ['^([invalid', '/x'])).toBe(true)
  })
})
