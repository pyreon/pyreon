import { describe, expect, it, vi } from 'vitest'
import { createISRHandler } from '../isr'

function mockHandler(html = '<html>test</html>') {
  return vi.fn(
    async () =>
      new Response(html, {
        headers: { 'content-type': 'text/html' },
      }),
  )
}

describe('createISRHandler', () => {
  it('returns a function', () => {
    const handler = createISRHandler(mockHandler(), { revalidate: 60 })
    expect(typeof handler).toBe('function')
  })

  it('cache miss — calls handler and returns response', async () => {
    const inner = mockHandler('<html>hello</html>')
    const handler = createISRHandler(inner, { revalidate: 60 })

    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()

    expect(inner).toHaveBeenCalledOnce()
    expect(html).toBe('<html>hello</html>')
    expect(res.headers.get('x-isr-cache')).toBe('MISS')
  })

  it('cache hit — serves from cache without calling handler', async () => {
    const inner = mockHandler()
    const handler = createISRHandler(inner, { revalidate: 60 })

    // First request populates cache
    await handler(new Request('http://localhost/'))
    // Second request should hit cache
    const res = await handler(new Request('http://localhost/'))

    expect(inner).toHaveBeenCalledOnce()
    expect(res.headers.get('x-isr-cache')).toBe('HIT')
  })

  it('passes non-GET requests through', async () => {
    const inner = mockHandler()
    const handler = createISRHandler(inner, { revalidate: 60 })

    const res = await handler(new Request('http://localhost/', { method: 'POST' }))
    expect(inner).toHaveBeenCalledOnce()
    // POST responses don't get ISR headers
    expect(res.headers.get('x-isr-cache')).toBeNull()
  })

  it('caches different paths independently', async () => {
    const inner = vi.fn(async (req: Request) => {
      const url = new URL(req.url)
      return new Response(`page: ${url.pathname}`)
    })
    const handler = createISRHandler(inner, { revalidate: 60 })

    await handler(new Request('http://localhost/a'))
    await handler(new Request('http://localhost/b'))

    const resA = await handler(new Request('http://localhost/a'))
    const resB = await handler(new Request('http://localhost/b'))

    expect(await resA.text()).toBe('page: /a')
    expect(await resB.text()).toBe('page: /b')
    expect(inner).toHaveBeenCalledTimes(2) // only initial misses
  })

  it('includes x-isr-age header', async () => {
    const inner = mockHandler()
    const handler = createISRHandler(inner, { revalidate: 60 })

    await handler(new Request('http://localhost/'))
    const res = await handler(new Request('http://localhost/'))

    expect(res.headers.get('x-isr-age')).toBeDefined()
  })

  // ─── Z2 — only cacheable (2xx, cookie-free) responses are cached ────────

  it('does NOT cache a non-2xx response and preserves its status (Z2)', async () => {
    // Regression: a transient 500/redirect was cached and replayed as a
    // 200 for the whole revalidate window — a self-inflicted outage.
    let n = 0
    const inner = vi.fn(async () => {
      n++
      return new Response(n === 1 ? 'boom' : 'ok', { status: n === 1 ? 500 : 200 })
    })
    const handler = createISRHandler(inner, { revalidate: 60 })

    const r1 = await handler(new Request('http://localhost/x'))
    expect(r1.status).toBe(500) // status preserved, not normalized to 200
    expect(r1.headers.get('x-isr-cache')).toBe('BYPASS')

    const r2 = await handler(new Request('http://localhost/x'))
    expect(inner).toHaveBeenCalledTimes(2) // not served from cache
    expect(r2.status).toBe(200)
    expect(await r2.text()).toBe('ok')
  })

  it('does NOT cache a Set-Cookie response (cross-user leak) (Z2)', async () => {
    let n = 0
    const inner = vi.fn(async () => {
      n++
      return new Response(`u${n}`, {
        status: 200,
        headers: { 'set-cookie': `session=user${n}` },
      })
    })
    const handler = createISRHandler(inner, { revalidate: 60 })

    const r1 = await handler(new Request('http://localhost/p'))
    expect(r1.headers.get('x-isr-cache')).toBe('BYPASS')
    const r2 = await handler(new Request('http://localhost/p'))
    // Re-rendered per request — user2 does NOT receive user1's cookie.
    expect(inner).toHaveBeenCalledTimes(2)
    expect(await r2.text()).toBe('u2')
  })

  // ─── Z4 — background revalidation is timeout-bounded ────────────────────

  it('a hung revalidation does not pin the entry stale forever (Z4)', async () => {
    // Regression: a handler that never settles left its key in the
    // in-flight set forever (`finally` never ran), so EVERY later
    // request short-circuited the de-dupe guard — the entry could never
    // recover from stale. The timeout must release the key.
    let n = 0
    const inner = vi.fn(async () => {
      n++
      if (n === 1) return new Response('v1', { status: 200 })
      // Every revalidation hangs forever.
      return new Promise<Response>(() => {})
    })
    const handler = createISRHandler(inner, {
      revalidate: 0, // everything immediately stale
      revalidateTimeoutMs: 30,
    })

    await handler(new Request('http://localhost/h')) // MISS → cache v1 (n=1)
    await new Promise((r) => setTimeout(r, 5)) // age > 0 → now stale
    await handler(new Request('http://localhost/h')) // STALE → revalidate (n=2, hangs)
    await new Promise((r) => setTimeout(r, 80)) // > 30ms timeout → key released
    await handler(new Request('http://localhost/h')) // STALE → revalidate AGAIN (n=3)
    await new Promise((r) => setTimeout(r, 10))

    // n===3 proves the second (hung) revalidation's key was released so
    // a third could start. Pre-fix it stayed pinned → n would be 2.
    expect(inner).toHaveBeenCalledTimes(3)
  })

  // ─── M1.1 — cacheKey opt-in (per-user / per-query caching) ───────────────

  describe('cacheKey (M1.1)', () => {
    // Pre-M1, the cache key was `url.pathname` only — query strings,
    // cookies, headers were stripped. An auth-gated `/dashboard` with
    // user A's cookie cached "Welcome A", then served that SAME HTML to
    // user B. The `cacheKey` opt-in lets users derive keys from
    // cookies / query / headers so personalized pages cache correctly.

    it('default behaviour: keys by pathname only (cookies + query ignored)', async () => {
      // Pre-M1 contract preserved: callers who don't supply `cacheKey`
      // get the same pathname-only behaviour they had before.
      let calls = 0
      const inner = vi.fn(async (req: Request) => {
        calls++
        return new Response(`call ${calls}`)
      })
      const handler = createISRHandler(inner, { revalidate: 60 })

      // Two requests, same path but DIFFERENT cookies + query
      const res1 = await handler(
        new Request('http://localhost/dashboard?foo=1', {
          headers: { cookie: 'session=alice' },
        }),
      )
      const res2 = await handler(
        new Request('http://localhost/dashboard?foo=2', {
          headers: { cookie: 'session=bob' },
        }),
      )

      expect(await res1.text()).toBe('call 1')
      // Cache HIT: same pathname → same key → bob gets alice's response.
      expect(await res2.text()).toBe('call 1')
      expect(inner).toHaveBeenCalledTimes(1)
    })

    it('custom cacheKey varies cache by cookie (auth-gated use case)', async () => {
      let calls = 0
      const inner = vi.fn(async (req: Request) => {
        calls++
        const session
          = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
        return new Response(`call ${calls} (session=${session})`)
      })
      const handler = createISRHandler(inner, {
        revalidate: 60,
        cacheKey: (req) => {
          const url = new URL(req.url)
          const session
            = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
          return `${url.pathname}::${session}`
        },
      })

      const res1 = await handler(
        new Request('http://localhost/dashboard', {
          headers: { cookie: 'session=alice' },
        }),
      )
      const res2 = await handler(
        new Request('http://localhost/dashboard', {
          headers: { cookie: 'session=bob' },
        }),
      )
      // Cache MISS for bob — different cacheKey → fresh render → different content
      expect(await res1.text()).toBe('call 1 (session=alice)')
      expect(await res2.text()).toBe('call 2 (session=bob)')
      expect(inner).toHaveBeenCalledTimes(2)

      // Repeat alice → cache HIT
      const res3 = await handler(
        new Request('http://localhost/dashboard', {
          headers: { cookie: 'session=alice' },
        }),
      )
      expect(await res3.text()).toBe('call 1 (session=alice)')
      expect(inner).toHaveBeenCalledTimes(2)
    })

    it('custom cacheKey varies cache by query string', async () => {
      let calls = 0
      const inner = vi.fn(async (req: Request) => {
        calls++
        const url = new URL(req.url)
        return new Response(`call ${calls} sort=${url.searchParams.get('sort')}`)
      })
      const handler = createISRHandler(inner, {
        revalidate: 60,
        cacheKey: (req) => {
          const url = new URL(req.url)
          return `${url.pathname}?sort=${url.searchParams.get('sort') ?? ''}`
        },
      })

      const asc = await handler(new Request('http://localhost/posts?sort=asc'))
      const desc = await handler(new Request('http://localhost/posts?sort=desc'))

      expect(await asc.text()).toBe('call 1 sort=asc')
      expect(await desc.text()).toBe('call 2 sort=desc')
      expect(inner).toHaveBeenCalledTimes(2)
    })
  })
})
