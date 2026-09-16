// @vitest-environment node
/**
 * Per-request isolation of the storage signal registry under SSR.
 *
 * The registry caches the RESOLVED SIGNAL per `backend:key`, so before the fix
 * request B's `useCookie('session')` returned the very signal request A
 * created — holding A's value. `setCookieSource`'s accessor form exists for
 * exactly this concurrency case; the cache sat above it and short-circuited
 * the read, so the seam was correct and unreachable past request #1.
 *
 * NODE environment deliberately (`@vitest-environment node`): `isServer` is
 * `typeof document === 'undefined'`, so under the package's default happy-dom
 * the `globalThis` seam is never published AND `useCookie` reads
 * `document.cookie` instead of the server source — neither half of the bug is
 * reachable there.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { runWithRequestContext } from '@pyreon/runtime-server'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMemoryStorage } from '../custom'
import { setCookieSource, useCookie } from '../cookie'
import { _resetRegistry } from '../registry'

// The documented concurrency-safe wiring: one process-wide accessor bound to a
// per-request context, exactly as `setCookieSource`'s docstring prescribes.
const requestCookies = new AsyncLocalStorage<string>()

/** Cookie values are JSON-encoded on the way in — mirrors `serialize`. */
const cookiePair = (k: string, v: unknown): string =>
  `${k}=${encodeURIComponent(JSON.stringify(v))}`

describe('SSR per-request registry isolation', () => {
  beforeEach(() => {
    _resetRegistry()
    setCookieSource(() => requestCookies.getStore() ?? '')
  })

  it('serves each concurrent request its OWN cookie signal', async () => {
    const render = (cookie: string): Promise<{ value: string; sig: unknown }> =>
      requestCookies.run(cookie, () =>
        runWithRequestContext(async () => {
          const session = useCookie('session', 'anonymous')
          return { value: session(), sig: session }
        }),
      )

    const [a, b] = await Promise.all([
      render(cookiePair('session', 'alice')),
      render(cookiePair('session', 'bob')),
    ])

    expect(a.value).toBe('alice')
    expect(b.value).toBe('bob')
    expect(a.sig).not.toBe(b.sig)

    // A third, ANONYMOUS request must see the default — not whichever user
    // happened to render first.
    const c = await render('')
    expect(c.value).toBe('anonymous')
    expect(c.sig).not.toBe(a.sig)
  })

  it('isolates every backend that goes through the registry', async () => {
    const render = (seed: string): Promise<string> =>
      runWithRequestContext(async () => {
        const note = useMemoryStorage('note', 'unset')
        // Whatever this request writes must be invisible to the next one.
        if (seed) note.set(seed)
        return note()
      })

    expect(await render('from-request-a')).toBe('from-request-a')
    expect(await render('')).toBe('unset')
  })

  it('keeps the process default OUTSIDE a request scope', () => {
    // No request scope ⇒ the provider answers `undefined` ⇒ the module-level
    // registry, i.e. the pre-isolation behaviour, which the refcount contract
    // (`retainEntry`/`releaseEntry`) depends on. A provider that fabricated a
    // throwaway Map here would mint a NEW signal on every call.
    const first = useMemoryStorage('outside', 'd')
    const second = useMemoryStorage('outside', 'd')
    expect(second).toBe(first)
  })
})
