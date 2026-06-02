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

  // ─── cacheKey default + opt-in (per-user / per-query caching) ───────────────

  describe('cacheKey', () => {
    // Pre-M1, the cache key was `url.pathname` only — query strings,
    // cookies, headers were stripped. An auth-gated `/dashboard` with
    // user A's cookie cached "Welcome A", then served that SAME HTML to
    // user B. M1.1 made `cacheKey` opt-in but kept the unsafe default.
    // The current default is `url.pathname + url.search` — query strings
    // contribute to the key (fixes the silent `?id=42` vs `?id=99`
    // leak); cookies still need an explicit `cacheKey` for auth-gated
    // routes (documented + warned).

    it('default behaviour: keys by pathname + search (query strings vary cache; cookies still ignored)', async () => {
      let calls = 0
      const inner = vi.fn(async (req: Request) => {
        calls++
        const url = new URL(req.url)
        return new Response(`call ${calls} (q=${url.searchParams.get('id') ?? ''})`)
      })
      const handler = createISRHandler(inner, { revalidate: 60 })

      // Different `?id=...` → different cache entries (the bug-class fix).
      const res1 = await handler(new Request('http://localhost/post?id=42'))
      const res2 = await handler(new Request('http://localhost/post?id=99'))
      expect(await res1.text()).toBe('call 1 (q=42)')
      expect(await res2.text()).toBe('call 2 (q=99)')
      expect(inner).toHaveBeenCalledTimes(2)

      // Same path + search → cache HIT (no extra inner call), even with
      // different COOKIES (auth caveat — that's what `cacheKey` opt-in
      // is for).
      const res3 = await handler(
        new Request('http://localhost/post?id=42', {
          headers: { cookie: 'session=bob' },
        }),
      )
      expect(await res3.text()).toBe('call 1 (q=42)')
      expect(inner).toHaveBeenCalledTimes(2)
    })

    it('default warning: fires ONCE per handler instance at first request when no cacheKey configured', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const inner = vi.fn(async () => new Response('ok'))
      const handler = createISRHandler(inner, { revalidate: 60 })

      // Warning fires on first request — same handler instance, multiple
      // requests should only emit ONE warning.
      await handler(new Request('http://localhost/a'))
      await handler(new Request('http://localhost/b'))
      await handler(new Request('http://localhost/c'))

      const cacheKeyWarns = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes('No `cacheKey` configured'),
      )
      expect(cacheKeyWarns.length).toBe(1)
      // Warning content asserts the two trade-offs are named — the
      // fundamental contract: dev sees BOTH the auth and the
      // cardinality fixes without leaving the log line.
      expect(String(cacheKeyWarns[0]?.[0])).toContain('AUTH-UNSAFE')
      expect(String(cacheKeyWarns[0]?.[0])).toContain('HIGH-CARDINALITY')

      warnSpy.mockRestore()
    })

    it('default warning: does NOT fire when explicit cacheKey is configured', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const inner = vi.fn(async () => new Response('ok'))
      const handler = createISRHandler(inner, {
        revalidate: 60,
        cacheKey: (req) => new URL(req.url).pathname,
      })

      await handler(new Request('http://localhost/a'))

      const cacheKeyWarns = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes('No `cacheKey` configured'),
      )
      expect(cacheKeyWarns.length).toBe(0)

      warnSpy.mockRestore()
    })

    it('default warning: fires once PER HANDLER INSTANCE (two handlers → two warnings)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const inner = vi.fn(async () => new Response('ok'))

      // Two separate `createISRHandler` calls each create a fresh
      // `deriveKey` closure → each one warns once independently. This
      // matches the M2.4 adapter-env-var-warning contract.
      const h1 = createISRHandler(inner, { revalidate: 60 })
      const h2 = createISRHandler(inner, { revalidate: 60 })
      await h1(new Request('http://localhost/x'))
      await h2(new Request('http://localhost/y'))

      const cacheKeyWarns = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes('No `cacheKey` configured'),
      )
      expect(cacheKeyWarns.length).toBe(2)

      warnSpy.mockRestore()
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

  // ─── revalidateNow / revalidateAll (imperative invalidation) ─────────

  describe('revalidateNow + revalidateAll', () => {
    it('revalidateNow drops a cached entry — next request MISSes', async () => {
      const inner = mockHandler('<html>v1</html>')
      const h = createISRHandler(inner, { revalidate: 60 })

      // Populate cache
      const res1 = await h(new Request('http://localhost/posts/1'))
      expect(res1.headers.get('x-isr-cache')).toBe('MISS')
      expect(await res1.text()).toBe('<html>v1</html>')

      // Confirm second request HITs from cache (still v1)
      const res2 = await h(new Request('http://localhost/posts/1'))
      expect(res2.headers.get('x-isr-cache')).toBe('HIT')

      // Webhook fires — drop the entry
      const result = await h.revalidateNow('/posts/1')
      expect(result).toEqual({ dropped: true })

      // Update the upstream handler's output (simulates CMS update)
      inner.mockImplementation(
        async () =>
          new Response('<html>v2</html>', { headers: { 'content-type': 'text/html' } }),
      )

      // Next request MUST miss the cache and pick up v2
      const res3 = await h(new Request('http://localhost/posts/1'))
      expect(res3.headers.get('x-isr-cache')).toBe('MISS')
      expect(await res3.text()).toBe('<html>v2</html>')
    })

    it('revalidateNow returns dropped:false for keys that never existed', async () => {
      const h = createISRHandler(mockHandler(), { revalidate: 60 })
      const result = await h.revalidateNow('/never-cached')
      expect(result).toEqual({ dropped: false })
    })

    it('revalidateNow is idempotent — calling twice still returns sensible flags', async () => {
      const h = createISRHandler(mockHandler(), { revalidate: 60 })
      // Populate
      await h(new Request('http://localhost/idem'))
      // First drop succeeds
      expect(await h.revalidateNow('/idem')).toEqual({ dropped: true })
      // Second drop is a no-op
      expect(await h.revalidateNow('/idem')).toEqual({ dropped: false })
    })

    it('revalidateNow clears in-flight revalidation flag so next request re-renders fresh', async () => {
      // Without the flag clear, a key currently mid-revalidation would
      // stay in the `revalidating` Set after revalidateNow drops it,
      // and the next request would short-circuit on the `revalidating.has`
      // guard. Drive it: trigger stale revalidate, then revalidateNow
      // BEFORE the background revalidate settles, then a fresh request
      // must still MISS (not see the stale-then-evicted entry's flag).
      let renderCount = 0
      const inner = vi.fn(async () => {
        renderCount++
        return new Response(`<html>v${renderCount}</html>`, {
          headers: { 'content-type': 'text/html' },
        })
      })
      const h = createISRHandler(inner, { revalidate: 0.01 }) // 10ms TTL

      // First request → MISS (v1)
      await h(new Request('http://localhost/p'))

      // Wait past TTL so the next request triggers background revalidate
      await new Promise((r) => setTimeout(r, 20))

      // Second request → STALE (v1 served, background re-render fires)
      const res = await h(new Request('http://localhost/p'))
      expect(res.headers.get('x-isr-cache')).toBe('STALE')

      // Immediately revalidate — this must clear both the entry AND
      // the in-flight flag so the next request MISSes cleanly.
      await h.revalidateNow('/p')

      // Wait for any background work to settle.
      await new Promise((r) => setTimeout(r, 30))

      // Drop again (in case the background revalidate re-populated)
      await h.revalidateNow('/p')

      // Now a fresh request must MISS — proves the flag cleanup worked.
      const finalRes = await h(new Request('http://localhost/p'))
      expect(finalRes.headers.get('x-isr-cache')).toBe('MISS')
    })

    it('revalidateAll drops every cached entry', async () => {
      const inner = mockHandler('<html>seeded</html>')
      const h = createISRHandler(inner, { revalidate: 60 })

      // Populate multiple entries
      await h(new Request('http://localhost/a'))
      await h(new Request('http://localhost/b'))
      await h(new Request('http://localhost/c'))

      // All should HIT now
      for (const path of ['/a', '/b', '/c']) {
        const r = await h(new Request(`http://localhost${path}`))
        expect(r.headers.get('x-isr-cache')).toBe('HIT')
      }

      // Purge all
      await h.revalidateAll()

      // Every entry MUST MISS now
      for (const path of ['/a', '/b', '/c']) {
        const r = await h(new Request(`http://localhost${path}`))
        expect(r.headers.get('x-isr-cache')).toBe('MISS')
      }
    })

    it('revalidateAll throws a clear error against a store without clear()', async () => {
      // Custom store WITHOUT `clear()` — emulates external stores that
      // only support TTL-based eviction (some Redis configurations).
      const map = new Map<string, ISRCacheEntry>()
      const noClear: ISRStore = {
        get: (k) => map.get(k),
        set: (k, e) => {
          map.set(k, e)
        },
        delete: (k) => {
          map.delete(k)
        },
        // intentionally no `clear`
      }
      const h = createISRHandler(mockHandler(), { revalidate: 60, store: noClear })

      await expect(h.revalidateAll()).rejects.toThrow(/clear/)
    })

    it('revalidateNow against a store without delete() returns dropped:false honestly', async () => {
      // Some external stores expose only `get`/`set` and rely on TTL —
      // `delete?` is optional in the ISRStore interface. revalidateNow
      // returns `dropped: false` honestly when the store can't honor
      // the request (rather than lying with `dropped: true` based on
      // the precheck), so the caller can tell their invalidation
      // didn't actually take effect.
      const map = new Map<string, ISRCacheEntry>()
      const noDelete: ISRStore = {
        get: (k) => map.get(k),
        set: (k, e) => {
          map.set(k, e)
        },
        // intentionally no `delete`
      }
      const h = createISRHandler(mockHandler(), { revalidate: 60, store: noDelete })
      await h(new Request('http://localhost/x'))

      // Entry exists but the store can't physically drop it.
      // revalidateNow doesn't crash AND returns the honest answer.
      const result = await h.revalidateNow('/x')
      expect(result).toEqual({ dropped: false })

      // The entry is STILL in the cache — TTL-only stores rely on
      // their TTL for eviction. revalidateNow can't override that.
      expect(map.has('/x')).toBe(true)
    })
  })

  // ─── PR-S5: lifecycle hygiene regressions ───────────────────────────────

  describe('PR-S5 — lifecycle hygiene', () => {
    it('null revalidateRequest DELETES the entry instead of leaving it forever-stale', async () => {
      // Pre-fix the entry stayed stale indefinitely — every subsequent
      // request triggered revalidate → returned null → bail → stale
      // served again, an infinite-stale loop the auth-gated use case
      // (return null to skip revalidation for logged-in users)
      // explicitly hits.
      let renderCount = 0
      const inner = vi.fn(async () => {
        renderCount++
        return new Response(`<html>v${renderCount}</html>`, {
          headers: { 'content-type': 'text/html' },
        })
      })
      const h = createISRHandler(inner, {
        revalidate: 0.01, // 10ms TTL
        revalidateRequest: () => null, // user opts out of revalidation
      })

      // First request: MISS, renders v1
      const res1 = await h(new Request('http://localhost/auth'))
      expect(res1.headers.get('x-isr-cache')).toBe('MISS')
      expect(await res1.text()).toBe('<html>v1</html>')

      // Wait past TTL
      await new Promise((r) => setTimeout(r, 20))

      // Second request: STALE serves v1, kicks off revalidate
      const res2 = await h(new Request('http://localhost/auth'))
      expect(res2.headers.get('x-isr-cache')).toBe('STALE')

      // Give the (synchronous null-return) revalidate time to delete
      await new Promise((r) => setTimeout(r, 10))

      // Third request: was MISS (entry deleted), renders v2 fresh.
      // Pre-fix this would be STALE again forever (v1 retained).
      const res3 = await h(new Request('http://localhost/auth'))
      expect(res3.headers.get('x-isr-cache')).toBe('MISS')
      expect(await res3.text()).toBe('<html>v2</html>')
    })

    it('revalidate timeout ABORTS the inner handler via AbortSignal', async () => {
      // Pre-fix the Promise.race rejected on timeout but the inner
      // handler kept running — DB queries, network calls, etc. all
      // continued in the background. The AbortController fix passes
      // `signal` into the default revalidate Request so the handler
      // can observe abort and cancel its work.
      let aborted = false
      const inner = vi.fn(async (req: Request) => {
        // Listen for abort — the test asserts this fires.
        req.signal.addEventListener('abort', () => {
          aborted = true
        })
        // Hang past the timeout (50ms) so the timer wins the race.
        await new Promise((resolve) => setTimeout(resolve, 200))
        return new Response('<html>never-arrives</html>', {
          headers: { 'content-type': 'text/html' },
        })
      })
      const h = createISRHandler(inner, {
        revalidate: 0.01, // 10ms TTL
        revalidateTimeoutMs: 50, // shorter than the hang
      })

      // Populate cache (first call uses TTL but doesn't hang here)
      inner.mockImplementationOnce(
        async () =>
          new Response('<html>seed</html>', {
            headers: { 'content-type': 'text/html' },
          }),
      )
      await h(new Request('http://localhost/slow'))

      // Wait past TTL
      await new Promise((r) => setTimeout(r, 20))

      // STALE serves the seed, kicks off revalidate (the hanging one)
      await h(new Request('http://localhost/slow'))

      // Wait past timeout
      await new Promise((r) => setTimeout(r, 80))

      // The signal MUST have fired abort on timeout
      expect(aborted).toBe(true)
    })

    it('revalidateNow bumps epoch BEFORE delete — racing revalidation cannot re-populate', async () => {
      // Pre-fix race: revalidate() in flight, revalidateNow() called
      // mid-flight → store.delete fires → revalidate's store.set lands
      // AFTER the delete → cache is re-populated with the data we
      // tried to invalidate. The epoch bump in revalidateNow flips
      // the snapshot the in-flight revalidate captured at start; the
      // post-render epoch guard skips store.set when it doesn't match.
      let resolveRevalidate: (() => void) | undefined
      const handlerGate = new Promise<void>((r) => {
        resolveRevalidate = r
      })
      let callCount = 0
      const inner = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          // First call (seed) returns immediately
          return new Response('<html>seed</html>', {
            headers: { 'content-type': 'text/html' },
          })
        }
        // Second call (the racing revalidate) waits for the gate
        await handlerGate
        return new Response('<html>racing-revalidate</html>', {
          headers: { 'content-type': 'text/html' },
        })
      })
      const h = createISRHandler(inner, { revalidate: 0.01 })

      // Seed the cache
      await h(new Request('http://localhost/race'))
      await new Promise((r) => setTimeout(r, 20))

      // STALE response — kicks off racing revalidate, which now hangs
      // on the gate
      const stale = await h(new Request('http://localhost/race'))
      expect(stale.headers.get('x-isr-cache')).toBe('STALE')

      // CMS webhook fires while revalidate is hanging — invalidate
      const result = await h.revalidateNow('/race')
      expect(result).toEqual({ dropped: true })

      // Now release the racing revalidate — it will complete and TRY
      // to store.set, but the epoch guard skips it
      resolveRevalidate?.()
      await new Promise((r) => setTimeout(r, 30))

      // Set up the next render to produce DIFFERENT content so we
      // can prove the racing revalidate's content didn't land
      inner.mockImplementationOnce(
        async () =>
          new Response('<html>post-webhook</html>', {
            headers: { 'content-type': 'text/html' },
          }),
      )

      // Next request MUST be a MISS (the racing revalidate's
      // re-populate was skipped by the epoch guard) and serves the
      // fresh post-webhook render. Pre-fix this would HIT the
      // racing-revalidate content.
      const fresh = await h(new Request('http://localhost/race'))
      expect(fresh.headers.get('x-isr-cache')).toBe('MISS')
      expect(await fresh.text()).toBe('<html>post-webhook</html>')
    })

    it('revalidateAll bumps every known key epoch — concurrent in-flight revalidations cannot re-populate', async () => {
      // Same race as revalidateNow but applied to every key.
      const callCounts: Record<string, number> = { '/a': 0, '/b': 0 }
      let aResolve: (() => void) | undefined
      let bResolve: (() => void) | undefined
      const aGate = new Promise<void>((r) => {
        aResolve = r
      })
      const bGate = new Promise<void>((r) => {
        bResolve = r
      })

      const inner = vi.fn(async (req: Request) => {
        const path = new URL(req.url).pathname
        callCounts[path] = (callCounts[path] ?? 0) + 1
        const count = callCounts[path]!
        // First call per path (seed) returns immediately
        if (count === 1) {
          return new Response(`<html>seed-${path.slice(1)}</html>`, {
            headers: { 'content-type': 'text/html' },
          })
        }
        // Second call per path (the racing revalidation) hangs on the
        // gate so we can synchronize revalidateAll with the race
        if (path === '/a') {
          await aGate
          return new Response('<html>race-a</html>', {
            headers: { 'content-type': 'text/html' },
          })
        }
        await bGate
        return new Response('<html>race-b</html>', {
          headers: { 'content-type': 'text/html' },
        })
      })

      const h = createISRHandler(
        // Cast because `inner` is `Mock` but createISRHandler accepts
        // (req: Request) => Promise<Response>; both match structurally
        inner as unknown as (req: Request) => Promise<Response>,
        { revalidate: 0.01, revalidateTimeoutMs: 5000 },
      )

      // Seed both
      await h(new Request('http://localhost/a'))
      await h(new Request('http://localhost/b'))
      await new Promise((r) => setTimeout(r, 20))

      // STALE responses kick off racing revalidates for both
      await h(new Request('http://localhost/a'))
      await h(new Request('http://localhost/b'))

      // Purge all while both racing revalidates hang
      await h.revalidateAll()

      // Release both racing revalidates
      aResolve?.()
      bResolve?.()
      await new Promise((r) => setTimeout(r, 30))

      // Next renders return fresh content — proves racing revalidates'
      // store.set calls were skipped by the per-key epoch guard
      inner.mockImplementation(async (req: Request) => {
        const p = new URL(req.url).pathname
        return new Response(`<html>fresh-${p.slice(1)}</html>`, {
          headers: { 'content-type': 'text/html' },
        })
      })

      const a = await h(new Request('http://localhost/a'))
      expect(a.headers.get('x-isr-cache')).toBe('MISS')
      expect(await a.text()).toBe('<html>fresh-a</html>')

      const b = await h(new Request('http://localhost/b'))
      expect(b.headers.get('x-isr-cache')).toBe('MISS')
      expect(await b.text()).toBe('<html>fresh-b</html>')
    })
  })
})

// ─── PR-S4: extended isCacheable + responseFilter (cross-user header leak) ──
//
// Bug: previous isCacheable only checked status + Set-Cookie. Responses
// carrying Cache-Control: private / Vary: Cookie / Authorization were
// happily cached and replayed to OTHER users via the default
// pathname-only cacheKey. Cross-user data leak.
//
// Fix: extended isCacheable to disqualify per RFC 7234 directives +
// added responseFilter hook for final-say override.
//
// Bisect-verify: revert isr.ts:isCacheable → these tests fail.

describe('PR-S4: isCacheable extended HTTP-cache-directive checks', () => {
  function mkResponse(html: string, headers: Record<string, string> = {}) {
    return vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html', ...headers } }))
  }

  it('refuses to cache Cache-Control: private (was: cached + leaked across users)', async () => {
    const inner = mkResponse('<html>private</html>', { 'cache-control': 'private, max-age=300' })
    const handler = createISRHandler(inner, { revalidate: 60 })

    const r1 = await handler(new Request('http://x/'))
    expect(r1.headers.get('x-isr-cache')).toBe('BYPASS')

    const r2 = await handler(new Request('http://x/'))
    expect(r2.headers.get('x-isr-cache')).toBe('BYPASS')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('refuses to cache Cache-Control: no-store', async () => {
    const inner = mkResponse('<html>nostore</html>', { 'cache-control': 'no-store' })
    const handler = createISRHandler(inner, { revalidate: 60 })

    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('refuses to cache Cache-Control: no-cache', async () => {
    const inner = mkResponse('<html>nc</html>', { 'cache-control': 'no-cache' })
    const handler = createISRHandler(inner, { revalidate: 60 })

    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('refuses to cache response with Authorization header', async () => {
    const inner = mkResponse('<html>auth</html>', { authorization: 'Bearer token-abc' })
    const handler = createISRHandler(inner, { revalidate: 60 })

    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('refuses to cache Vary: Cookie WITHOUT explicit cacheKey (cross-user leak)', async () => {
    const inner = mkResponse('<html>v</html>', { vary: 'Cookie' })
    const handler = createISRHandler(inner, { revalidate: 60 })

    const r1 = await handler(new Request('http://x/'))
    const r2 = await handler(new Request('http://x/'))

    expect(r1.headers.get('x-isr-cache')).toBe('BYPASS')
    expect(r2.headers.get('x-isr-cache')).toBe('BYPASS')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('ALLOWS Vary: Cookie WHEN explicit cacheKey is configured (user opted into per-cookie keying)', async () => {
    const inner = mkResponse('<html>v</html>', { vary: 'Cookie' })
    const handler = createISRHandler(inner, {
      revalidate: 60,
      cacheKey: (req) => `${new URL(req.url).pathname}::${req.headers.get('cookie') ?? 'anon'}`,
    })

    const r1 = await handler(new Request('http://x/', { headers: { cookie: 'session=abc' } }))
    const r2 = await handler(new Request('http://x/', { headers: { cookie: 'session=abc' } }))

    expect(r1.headers.get('x-isr-cache')).toBe('MISS')
    expect(r2.headers.get('x-isr-cache')).toBe('HIT')
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('refuses to cache Vary: * (wildcard varies on everything)', async () => {
    const inner = mkResponse('<html>w</html>', { vary: '*' })
    const handler = createISRHandler(inner, { revalidate: 60 })

    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('ALLOWS public-cacheable response (no disqualifying headers)', async () => {
    const inner = mkResponse('<html>public</html>', { 'cache-control': 'public, max-age=3600' })
    const handler = createISRHandler(inner, { revalidate: 60 })

    const r1 = await handler(new Request('http://x/'))
    const r2 = await handler(new Request('http://x/'))

    expect(r1.headers.get('x-isr-cache')).toBe('MISS')
    expect(r2.headers.get('x-isr-cache')).toBe('HIT')
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('case-insensitive directive matching (Cache-Control: PRIVATE / Vary: COOKIE)', async () => {
    const inner1 = mkResponse('<html>uc</html>', { 'cache-control': 'PRIVATE' })
    const h1 = createISRHandler(inner1, { revalidate: 60 })
    expect((await h1(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')

    const inner2 = mkResponse('<html>uc</html>', { vary: 'COOKIE' })
    const h2 = createISRHandler(inner2, { revalidate: 60 })
    expect((await h2(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
  })
})

describe('PR-S4: responseFilter — final-say override', () => {
  function mkResponse(html: string, headers: Record<string, string> = {}) {
    return vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html', ...headers } }))
  }

  it('filter returning null bypasses cache even when default-cacheable', async () => {
    const inner = mkResponse('<html>x</html>', { 'cache-control': 'public, max-age=3600' })
    const handler = createISRHandler(inner, {
      revalidate: 60,
      responseFilter: () => null,
    })

    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect((await handler(new Request('http://x/'))).headers.get('x-isr-cache')).toBe('BYPASS')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('filter receives the original Response', async () => {
    const inner = mkResponse('<html>x</html>', { 'x-page-type': 'marketing' })
    const seen: string[] = []
    const handler = createISRHandler(inner, {
      revalidate: 60,
      responseFilter: (res) => {
        seen.push(res.headers.get('x-page-type') ?? 'none')
        return res
      },
    })

    await handler(new Request('http://x/'))
    expect(seen).toEqual(['marketing'])
  })

  it('filter allows opting INTO caching that would otherwise be refused', async () => {
    // Vary: Cookie without cacheKey is normally refused. responseFilter
    // can override by stripping the Vary header.
    const inner = mkResponse('<html>shared</html>', { vary: 'Cookie' })
    const handler = createISRHandler(inner, {
      revalidate: 60,
      responseFilter: (res) => {
        const newHeaders = new Headers(res.headers)
        newHeaders.delete('vary')
        return new Response(res.body, {
          status: res.status,
          headers: newHeaders,
        })
      },
    })

    const r1 = await handler(new Request('http://x/'))
    const r2 = await handler(new Request('http://x/'))

    expect(r1.headers.get('x-isr-cache')).toBe('MISS')
    expect(r2.headers.get('x-isr-cache')).toBe('HIT')
    expect(inner).toHaveBeenCalledTimes(1)
  })
})
