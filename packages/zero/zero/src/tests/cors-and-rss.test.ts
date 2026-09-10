/**
 * Two output surfaces where a mistake is invisible from the page.
 *
 * **CORS origin resolution.** Reflecting an origin that should have been
 * denied is a genuine security failure, and it is one nobody notices: the
 * app works, the browser is happy, and the only signal is that a site
 * that should have been blocked can now read authenticated responses.
 * The rule that matters is that an origin must be matched EXACTLY —
 * `https://evil-app.com` must not pass a check for `https://app.com`,
 * and every config form (string, array, predicate) has to agree on that.
 * The `Vary: Origin` header is the second half: without it a shared
 * cache can serve one origin's response to another, turning a correct
 * allowlist into a leak anyway.
 *
 * **RSS generation.** A malformed feed is rejected wholesale by readers
 * — one unescaped `&` in one title and the entire feed disappears from
 * every subscriber, with no error anywhere on the site. URL joining is
 * the other half: a doubled slash yields links that 404 from inside the
 * reader while the site itself is fine.
 */
import { describe, expect, it } from 'vitest'
import { corsMiddleware } from '../cors'
import { generateRssFeed, toRfc822 } from '../seo-rss'
import type { MiddlewareContext } from '../types'

/** Drive the REAL middleware and report what it set. */
function run(
  config: Parameters<typeof corsMiddleware>[0],
  { origin, method = 'GET' }: { origin?: string; method?: string } = {},
): { headers: Headers; response: Response | undefined } {
  const headers = new Headers()
  const reqHeaders = new Headers()
  if (origin !== undefined) reqHeaders.set('origin', origin)
  const ctx = { req: { headers: reqHeaders, method }, headers } as unknown as MiddlewareContext
  const response = (corsMiddleware(config) as (c: MiddlewareContext) => Response | undefined)(ctx)
  return { headers, response }
}

const allowed = (h: Headers) => h.get('Access-Control-Allow-Origin')

describe('an origin is allowed only on an EXACT match', () => {
  it('reflects a matching origin for every config form', () => {
    // The control. Every denial spec below is worthless against a
    // middleware that allows nothing.
    for (const [label, config] of [
      ['string', { origin: 'https://app.com' }],
      ['array', { origin: ['https://other.com', 'https://app.com'] }],
      ['predicate', { origin: (o: string) => o.endsWith('app.com') }],
    ] as Array<[string, Parameters<typeof corsMiddleware>[0]]>) {
      expect(allowed(run(config, { origin: 'https://app.com' }).headers), label).toBe(
        'https://app.com',
      )
    }
  })

  it('DENIES a look-alike origin under every config form', () => {
    // `https://evil-app.com` ends with `app.com` and contains it. A
    // substring or suffix check would pass all three of these.
    for (const [label, config] of [
      ['string', { origin: 'https://app.com' }],
      ['array', { origin: ['https://app.com'] }],
    ] as Array<[string, Parameters<typeof corsMiddleware>[0]]>) {
      for (const evil of [
        'https://evil-app.com',
        'https://app.com.evil.net',
        'http://app.com',
        'https://app.com:8443',
      ]) {
        expect(allowed(run(config, { origin: evil }).headers), `${label} ${evil}`).toBeNull()
      }
    }
  })

  it('sets NO cors headers at all when the origin is denied', () => {
    // Not just a missing Allow-Origin: an `Allow-Credentials: true` with
    // no allowed origin is a confusing half-state.
    const { headers, response } = run(
      { origin: 'https://app.com', credentials: true },
      { origin: 'https://evil.com', method: 'OPTIONS' },
    )
    expect([...headers.keys()]).toEqual([])
    expect(response, 'a denied preflight must not be answered 204').toBeUndefined()
  })

  it('denies a request that carries NO origin header when a list is configured', () => {
    // Same-origin requests send no Origin. Reflecting `''` would emit
    // `Access-Control-Allow-Origin: ` — a header some proxies then treat
    // as a wildcard.
    expect(allowed(run({ origin: ['https://app.com'] }).headers)).toBeNull()
    expect(allowed(run({ origin: (o: string) => o.length > 0 }).headers)).toBeNull()
  })

  it('treats an unusable config as deny, not as allow-all', () => {
    // Failing OPEN here is the worst possible default.
    expect(allowed(run({ origin: 42 as never }, { origin: 'https://app.com' }).headers)).toBeNull()
    expect(allowed(run({ origin: null as never }, { origin: 'https://a.com' }).headers)).toBeNull()
  })

  it('allows everything under the wildcard default', () => {
    expect(allowed(run({}, { origin: 'https://anything.com' }).headers)).toBe('*')
  })
})

describe('Vary: Origin is set exactly when the answer depends on the origin', () => {
  it('is set for a reflected origin', () => {
    // Without it a shared cache serves one origin's response to another,
    // which defeats the allowlist it was cached behind.
    const { headers } = run({ origin: ['https://app.com'] }, { origin: 'https://app.com' })
    expect(headers.get('Vary')).toBe('Origin')
  })

  it('is NOT set for the wildcard', () => {
    // The response is identical for every origin, so varying on it only
    // fragments the cache.
    expect(run({}, { origin: 'https://a.com' }).headers.get('Vary')).toBeNull()
  })
})

describe('preflight', () => {
  it('answers OPTIONS with 204 and the negotiated policy', () => {
    const { response } = run(
      { origin: 'https://app.com', methods: ['GET', 'POST'], maxAge: 600, credentials: true },
      { origin: 'https://app.com', method: 'OPTIONS' },
    )
    expect(response?.status).toBe(204)
    expect(response?.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST')
    expect(response?.headers.get('Access-Control-Max-Age')).toBe('600')
    expect(response?.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('omits Allow-Credentials when credentials are off', () => {
    // Sending `true` unconditionally lets any allowed origin read
    // cookie-authenticated responses.
    const { response } = run({ origin: '*' }, { origin: 'https://a.com', method: 'OPTIONS' })
    expect(response?.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  it('exposes only the headers configured', () => {
    const { headers } = run(
      { origin: '*', exposedHeaders: ['X-Total', 'X-Page'] },
      { origin: 'https://a.com' },
    )
    expect(headers.get('Access-Control-Expose-Headers')).toBe('X-Total, X-Page')
    expect(run({ origin: '*' }, { origin: 'https://a.com' }).headers
      .get('Access-Control-Expose-Headers')).toBeNull()
  })

  it('does not answer a non-OPTIONS request itself', () => {
    // Returning a 204 for a GET would blank the page.
    expect(run({ origin: '*' }, { origin: 'https://a.com' }).response).toBeUndefined()
  })
})

describe('RSS output stays parseable', () => {
  const base = {
    title: 'Blog',
    origin: 'https://site.com',
    items: [{ title: 'Post', link: '/p/1', pubDate: '2024-01-02T03:04:05Z' }],
  }

  it('escapes XML metacharacters in every text position', () => {
    // One raw `&` makes a reader reject the WHOLE feed — every post
    // vanishes from every subscriber at once, silently.
    const xml = generateRssFeed({
      ...base,
      title: 'A & B',
      description: '<script>alert(1)</script>',
      items: [{
        title: 'Tom & Jerry <b>',
        link: '/p/1?a=1&b=2',
        description: 'x & y',
        author: 'a&b@x.com',
        pubDate: '2024-01-02T03:04:05Z',
      }],
    })
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/)
    expect(xml).not.toContain('<script>')
    expect(xml).toContain('Tom &amp; Jerry')
  })

  it('joins origin and path without doubling or dropping the slash', () => {
    // `https://site.com//p/1` and `https://site.compath` both 404 from
    // inside the reader while the site itself works.
    for (const origin of ['https://site.com', 'https://site.com/']) {
      for (const link of ['/p/1', 'p/1']) {
        const xml = generateRssFeed({ ...base, origin, items: [{ ...base.items[0]!, link }] })
        expect(xml, `${origin} + ${link}`).toContain('<link>https://site.com/p/1</link>')
      }
    }
  })

  it('uses the bare origin for an EMPTY path', () => {
    const xml = generateRssFeed({ ...base, origin: 'https://site.com/', items: [
      { ...base.items[0]!, link: '' },
    ] })
    expect(xml).toContain('<link>https://site.com</link>')
  })

  it('emits optional channel fields only when configured', () => {
    // An empty `<description></description>` is valid but useless; the
    // point is that the presence checks work in both directions.
    const withAll = generateRssFeed({ ...base, description: 'D', language: 'en-GB' })
    expect(withAll).toContain('<description>D</description>')
    expect(withAll).toContain('<language>en-GB</language>')
    const without = generateRssFeed(base)
    expect(without).not.toContain('<language>')
  })

  it('emits an item author only when given', () => {
    expect(generateRssFeed({ ...base, items: [{ ...base.items[0]!, author: 'a@b.c' }] }))
      .toContain('<author>a@b.c</author>')
    expect(generateRssFeed(base)).not.toContain('<author>')
  })

  it('formats pubDate as RFC-822, which is what readers sort on', () => {
    // An ISO date here parses as "no date" in most readers, so every
    // item sorts to the bottom and new posts never surface.
    const d = toRfc822('2024-01-02T03:04:05Z')
    expect(d).toMatch(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/)
    expect(generateRssFeed(base)).toContain(`<pubDate>${d}</pubDate>`)
  })

  it('does not emit "Invalid Date" for an unparseable pubDate', () => {
    // A CMS field left blank is the ordinary cause.
    expect(toRfc822('not-a-date')).not.toContain('Invalid')
  })
})
