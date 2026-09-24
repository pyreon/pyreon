/**
 * The dev server's locale-detection redirect.
 *
 * `i18nRouting()` installs a middleware that sends a visitor landing on
 * `/` to the locale their browser or cookie asks for. It is the one part
 * of the i18n stack that reads UNTRUSTED request headers, and every
 * branch of it decides a redirect — so a mistake here does not throw, it
 * sends the visitor to the wrong language and, under
 * `prefix-except-default`, can send them into a loop.
 *
 * The loop is the failure worth naming. Under `prefix-except-default`
 * the default locale is served UNPREFIXED, so redirecting a default
 * preference to `/en/` targets a URL that does not exist — and if it did
 * redirect back, `/` → `/en/` → `/` is an infinite bounce. The
 * `preferred !== defaultLocale` arm is what stops it, and nothing
 * covered it.
 *
 * Cookie-over-header precedence is the other contract: a cookie is an
 * explicit choice the visitor made, `Accept-Language` is what their OS
 * happens to be set to. Getting that backwards overrides the user's own
 * selection on every visit, which reads as the language switcher being
 * broken.
 */
import { describe, expect, it, vi } from 'vitest'
import { i18nRouting, _parseCookiesForTesting } from '../i18n-routing-plugin'
import type { I18nRoutingConfig } from '../i18n-routing-plugin'

type Res = { statusCode?: number; headers: Record<string, string>; ended: boolean }
type Handled = { res: Res; nexted: boolean }

/** Drive the REAL middleware the plugin installs. */
async function request(
  config: I18nRoutingConfig,
  url: string,
  headers: Record<string, string | undefined> = {},
): Promise<Handled> {
  const plugin = i18nRouting(config)
  let mw: ((req: unknown, res: unknown, next: () => void) => void) | undefined
  await (plugin.configureServer as (s: unknown) => Promise<void>)({
    middlewares: { use: (fn: typeof mw) => { mw = fn } },
  })
  if (!mw) throw new Error('the plugin registered no middleware')

  const state: Handled = { res: { headers: {}, ended: false }, nexted: false }
  const res = {
    writeHead: (code: number, h: Record<string, string>) => {
      state.res.statusCode = code
      Object.assign(state.res.headers, h)
    },
    end: () => { state.res.ended = true },
  }
  mw({ url, headers }, res, () => { state.nexted = true })
  return state
}

const base: I18nRoutingConfig = {
  locales: ['en', 'de', 'fr'],
  defaultLocale: 'en',
}

describe('the middleware only ever redirects the ROOT path', () => {
  it('redirects / to the header-preferred locale', async () => {
    // The control. Without it every "does not redirect" spec below
    // passes against a middleware that redirects nothing.
    const r = await request({ ...base, detectLocale: true }, '/', {
      'accept-language': 'de-DE,de;q=0.9',
    })
    expect(r.res.statusCode).toBe(302)
    expect(r.res.headers.Location).toBe('/de/')
    expect(r.nexted, 'a redirect must not also continue the chain').toBe(false)
  })

  it('passes a NON-root path straight through', async () => {
    // Redirecting `/about` would strand every deep link on the site.
    const r = await request({ ...base, detectLocale: true }, '/about', {
      'accept-language': 'de',
    })
    expect(r.nexted).toBe(true)
    expect(r.res.statusCode).toBeUndefined()
  })

  it('does not redirect when detection is off', async () => {
    // The opt-out. A site that routes locale itself must not have the
    // dev server second-guessing it.
    const r = await request({ ...base, detectLocale: false }, '/', {
      'accept-language': 'de',
    })
    expect(r.nexted).toBe(true)
  })
})

describe('the default locale is NOT redirected under prefix-except-default', () => {
  it('serves / directly when the preference IS the default', async () => {
    // `/en/` does not exist under this strategy — the default locale is
    // served unprefixed — so redirecting there is a 404 at best and a
    // `/` → `/en/` → `/` bounce at worst.
    const r = await request({ ...base, detectLocale: true }, '/', {
      'accept-language': 'en-US,en;q=0.9',
    })
    expect(r.res.statusCode, 'must not redirect to a prefix that has no route').toBeUndefined()
    expect(r.nexted).toBe(true)
  })

  it('DOES redirect the default locale under the `prefix` strategy', async () => {
    // Here every locale is prefixed, so `/` has no route and the
    // redirect is the only thing that serves the visitor.
    const r = await request(
      { ...base, detectLocale: true, strategy: 'prefix' },
      '/',
      { 'accept-language': 'en-US,en;q=0.9' },
    )
    expect(r.res.statusCode).toBe(302)
    expect(r.res.headers.Location).toBe('/en/')
  })
})

describe('an explicit cookie beats the browser header', () => {
  it('honours the cookie over Accept-Language', async () => {
    // The cookie is the choice the visitor made in the switcher; the
    // header is whatever their OS is set to. Backwards, and the switcher
    // appears not to work.
    const r = await request({ ...base, detectLocale: true }, '/', {
      cookie: 'locale=fr',
      'accept-language': 'de-DE,de;q=0.9',
    })
    expect(r.res.headers.Location).toBe('/fr/')
  })

  it('ignores a cookie naming a locale the site does not have', async () => {
    // A stale cookie from a removed locale, or a hand-edited one. It
    // must fall back to detection rather than redirect to a dead prefix.
    const r = await request({ ...base, detectLocale: true }, '/', {
      cookie: 'locale=zz',
      'accept-language': 'de',
    })
    expect(r.res.headers.Location).toBe('/de/')
  })

  it('reads a custom cookie name when one is configured', async () => {
    const r = await request(
      { ...base, detectLocale: true, cookieName: 'lang' },
      '/',
      { cookie: 'lang=fr' },
    )
    expect(r.res.headers.Location).toBe('/fr/')
  })

  it('falls back to the default when nothing is offered at all', async () => {
    // No cookie, no header. Under prefix-except-default that means no
    // redirect — which is the correct no-op, not a crash on `undefined`.
    const r = await request({ ...base, detectLocale: true }, '/', {})
    expect(r.nexted).toBe(true)
  })
})

describe('asset requests are skipped before any locale work', () => {
  for (const [label, url] of [
    ['a Vite internal', '/@vite/client'],
    ['a Vite special path', '/__inspect'],
    ['anything with an extension', '/logo.svg'],
    ['a nested asset', '/assets/app.a1b2.js'],
  ] as Array<[string, string]>) {
    it(`passes ${label} through untouched`, async () => {
      // Attaching a locale context to a JS chunk request is wasted work;
      // redirecting one would break the page outright.
      const r = await request({ ...base, detectLocale: true }, url, {
        'accept-language': 'de',
      })
      expect(r.nexted, url).toBe(true)
      expect(r.res.statusCode, url).toBeUndefined()
    })
  }
})

describe('a missing url is treated as the root', () => {
  it('does not throw when req.url is undefined', async () => {
    // Node types it optional and some proxies genuinely omit it. A throw
    // here takes down the whole dev middleware chain.
    const plugin = i18nRouting({ ...base, detectLocale: true })
    let mw: ((req: unknown, res: unknown, next: () => void) => void) | undefined
    await (plugin.configureServer as (s: unknown) => Promise<void>)({
      middlewares: { use: (fn: typeof mw) => { mw = fn } },
    })
    const next = vi.fn()
    expect(() =>
      mw!({ headers: {} }, { writeHead: () => {}, end: () => {} }, next),
    ).not.toThrow()
  })
})

describe('cookie parsing', () => {
  it('reads a value from a multi-cookie header', () => {
    expect(_parseCookiesForTesting('a=1; locale=de; b=2')['locale']).toBe('de')
  })

  it('returns an empty record for an absent or empty header', () => {
    expect(_parseCookiesForTesting(undefined)).toEqual({})
    expect(_parseCookiesForTesting('')).toEqual({})
  })

  it('survives a malformed header without throwing', () => {
    // Cookie headers are attacker-controlled; a parse throw is a dev
    // server that dies on a crafted request.
    for (const h of ['=', ';;;', 'novalue', 'a=b=c']) {
      expect(() => _parseCookiesForTesting(h), h).not.toThrow()
    }
  })
})
