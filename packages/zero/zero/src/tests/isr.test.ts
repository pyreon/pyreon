import { describe, expect, it, vi } from 'vitest'
import {
  createISRHandler,
  createMemoryStore,
  type ISRCacheEntry,
  type ISRStore,
} from '../isr'

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

    it('revalidateRequest: returning null SKIPS revalidation (auth-gated safe-mode)', async () => {
      // The auth-gated cacheKey footgun: pre-fix, a stale entry triggered
      // a revalidation that re-used the ORIGINAL user's cookies. If user A's
      // session expired between the cache-write and the revalidation,
      // the new render either redirects or — worse — embeds A's stale
      // data. `revalidateRequest: () => null` opts out of revalidation
      // for the entries the user can't safely re-render.
      let n = 0
      const inner = vi.fn(async () => {
        n++
        return new Response(`v${n}`, { status: 200 })
      })
      const handler = createISRHandler(inner, {
        revalidate: 0, // immediately stale
        cacheKey: (req) => {
          const session = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
          return `${new URL(req.url).pathname}::${session}`
        },
        // Refuse to revalidate anything authenticated.
        revalidateRequest: (req) =>
          /session=(?!anon)/.test(req.headers.get('cookie') ?? '')
            ? null
            : new Request(req.url, { method: 'GET' }),
      })

      const authedReq = new Request('http://localhost/dash', {
        headers: { cookie: 'session=alice' },
      })

      await handler(authedReq) // MISS → cache v1
      await new Promise((r) => setTimeout(r, 5)) // immediately stale
      await handler(authedReq) // STALE → revalidateRequest returns null → SKIP
      await new Promise((r) => setTimeout(r, 20)) // give any background work time
      // inner only ran ONCE — the auth-gated entry was not re-rendered.
      expect(inner).toHaveBeenCalledTimes(1)
    })

    it('revalidateRequest: returning a custom Request uses it instead of the original', async () => {
      const seen: Array<string | null> = []
      let n = 0
      const inner = vi.fn(async (req: Request) => {
        n++
        seen.push(req.headers.get('cookie'))
        return new Response(`v${n}`, { status: 200 })
      })
      const handler = createISRHandler(inner, {
        revalidate: 0,
        revalidateRequest: (req) =>
          // Strip cookies — revalidate as anonymous.
          new Request(req.url, { method: 'GET' }),
      })

      const authedReq = new Request('http://localhost/page', {
        headers: { cookie: 'session=alice' },
      })

      await handler(authedReq) // MISS → render WITH cookies
      await new Promise((r) => setTimeout(r, 5))
      await handler(authedReq) // STALE → revalidateRequest scrubs cookies
      await new Promise((r) => setTimeout(r, 30))

      // First render: original request had cookies.
      expect(seen[0]).toContain('session=alice')
      // Second render (background revalidation): cookies stripped by hook.
      expect(seen[1]).toBeNull()
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

  // ─── Pluggable store ─────────────────────────────────────────────────────
  // Multi-instance production needs a SHARED cache (Redis / Vercel KV /
  // Cloudflare KV / etc.) so a revalidation in pod A is visible to pod B.
  // The store interface accepts sync OR async returns so the default
  // in-memory impl stays cheap while external stores can use their native
  // promise APIs directly. These tests lock the contract.

  describe('pluggable store', () => {
    it('default in-memory store keeps prior behaviour (backwards-compat)', async () => {
      let calls = 0
      const inner = vi.fn(async (_req: Request) => new Response(`call ${++calls}`))
      // No `store` field → uses createMemoryStore by default.
      const handler = createISRHandler(inner, { revalidate: 60 })
      const r1 = await handler(new Request('http://localhost/a'))
      const r2 = await handler(new Request('http://localhost/a'))
      expect(await r1.text()).toBe('call 1')
      expect(await r2.text()).toBe('call 1') // cached
      expect(inner).toHaveBeenCalledTimes(1)
    })

    it('createMemoryStore exposes get / set / delete + LRU bump on get', () => {
      const store = createMemoryStore<ISRCacheEntry>({ maxEntries: 2 })
      const e1: ISRCacheEntry = { html: '1', headers: {}, timestamp: 1 }
      const e2: ISRCacheEntry = { html: '2', headers: {}, timestamp: 2 }
      const e3: ISRCacheEntry = { html: '3', headers: {}, timestamp: 3 }
      store.set('a', e1)
      store.set('b', e2)
      // Touch 'a' → moves to newest position → 'b' is now oldest.
      expect(store.get('a')).toBe(e1)
      // Adding 'c' evicts 'b' (oldest), not 'a'.
      store.set('c', e3)
      expect(store.get('a')).toBe(e1) // survives
      expect(store.get('b')).toBeUndefined() // evicted
      expect(store.get('c')).toBe(e3)
    })

    it('custom store: handler calls get(key) before render, set(key, entry) after', async () => {
      const calls: Array<{ op: string; key: string }> = []
      const inner = vi.fn(async (_req: Request) => new Response('hi'))
      // Fake store recording every call — simulates a Redis adapter shape.
      const fake: ISRStore<ISRCacheEntry> = {
        get(key) {
          calls.push({ op: 'get', key })
          return undefined // always miss → handler must run + set
        },
        set(key, _entry) {
          calls.push({ op: 'set', key })
        },
      }
      const handler = createISRHandler(inner, { revalidate: 60, store: fake })
      await handler(new Request('http://localhost/page'))
      expect(calls).toEqual([
        { op: 'get', key: '/page' },
        { op: 'set', key: '/page' },
      ])
      expect(inner).toHaveBeenCalledTimes(1)
    })

    it('async store: get / set return Promises and handler awaits them', async () => {
      // Simulates a Redis-shape adapter with real-async ops.
      const backing = new Map<string, ISRCacheEntry>()
      const asyncStore: ISRStore<ISRCacheEntry> = {
        async get(key) {
          await new Promise((r) => setTimeout(r, 1))
          return backing.get(key)
        },
        async set(key, entry) {
          await new Promise((r) => setTimeout(r, 1))
          backing.set(key, entry)
        },
        async delete(key) {
          backing.delete(key)
        },
      }
      let calls = 0
      const inner = vi.fn(async (_req: Request) => new Response(`call ${++calls}`))
      const handler = createISRHandler(inner, { revalidate: 60, store: asyncStore })

      // First call: store.get awaits + misses → render → store.set awaits.
      const r1 = await handler(new Request('http://localhost/x'))
      expect(await r1.text()).toBe('call 1')

      // Second call: store.get awaits + hits → no render.
      const r2 = await handler(new Request('http://localhost/x'))
      expect(await r2.text()).toBe('call 1')
      expect(inner).toHaveBeenCalledTimes(1)
      expect(backing.size).toBe(1)
    })

    it('custom store: cache hit serves stored entry without invoking handler', async () => {
      const stored: ISRCacheEntry = {
        html: 'pre-warmed',
        headers: { 'content-type': 'text/html' },
        timestamp: Date.now(),
      }
      const fake: ISRStore<ISRCacheEntry> = {
        get(key) {
          return key === '/cached' ? stored : undefined
        },
        set() {
          /* unused for this test — get returns a hit */
        },
      }
      const inner = vi.fn(async (_req: Request) => new Response('SHOULD NOT RUN'))
      const handler = createISRHandler(inner, { revalidate: 60, store: fake })
      const res = await handler(new Request('http://localhost/cached'))
      expect(await res.text()).toBe('pre-warmed')
      expect(res.headers.get('x-isr-cache')).toBe('HIT')
      expect(inner).not.toHaveBeenCalled()
    })

    it('custom store: non-cacheable response (5xx / Set-Cookie) does NOT call store.set', async () => {
      let setCalls = 0
      const fake: ISRStore<ISRCacheEntry> = {
        get() {
          return undefined
        },
        set() {
          setCalls++
        },
      }
      // 5xx response
      const fivexx = vi.fn(async () => new Response('err', { status: 500 }))
      const h1 = createISRHandler(fivexx, { revalidate: 60, store: fake })
      const r1 = await h1(new Request('http://localhost/err'))
      expect(r1.status).toBe(500)
      expect(r1.headers.get('x-isr-cache')).toBe('BYPASS')

      // Set-Cookie response
      const cooked = vi.fn(
        async () =>
          new Response('ok', {
            status: 200,
            headers: { 'set-cookie': 'session=x' },
          }),
      )
      const h2 = createISRHandler(cooked, { revalidate: 60, store: fake })
      const r2 = await h2(new Request('http://localhost/auth'))
      expect(r2.status).toBe(200)
      expect(r2.headers.get('x-isr-cache')).toBe('BYPASS')

      // store.set should never have been called for either uncacheable path.
      expect(setCalls).toBe(0)
    })
  })
})
