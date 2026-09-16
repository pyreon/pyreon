import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetRateLimitWarning, rateLimitMiddleware } from '../rate-limit'

beforeEach(() => {
  _resetRateLimitWarning()
})

function mockCtx(path: string, ip = '1.2.3.4') {
  const url = new URL(`http://localhost${path}`)
  const req = new Request(url.toString(), {
    headers: { 'X-Forwarded-For': ip },
  })
  return {
    req,
    url,
    path,
    headers: new Headers(),
    locals: {},
  }
}

describe('rateLimitMiddleware', () => {
  it('allows requests under the limit', () => {
    const mw = rateLimitMiddleware({ max: 5, window: 60 })
    const ctx = mockCtx('/api/posts')
    const result = mw(ctx)
    expect(result).toBeUndefined()
    expect(ctx.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(ctx.headers.get('X-RateLimit-Remaining')).toBe('4')
  })

  it('blocks requests over the limit', () => {
    const mw = rateLimitMiddleware({ max: 3, window: 60 })
    for (let i = 0; i < 3; i++) {
      mw(mockCtx('/api', '10.0.0.1'))
    }
    const ctx = mockCtx('/api', '10.0.0.1')
    const result = mw(ctx)
    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(429)
  })

  it('tracks clients independently', () => {
    // `trustProxy: true` declares one reverse proxy, so the LAST (and here
    // only) X-Forwarded-For entry is the proxy-written client address. Without
    // that declaration the header is deliberately NOT read — see the
    // "forwarded headers" describe below.
    const mw = rateLimitMiddleware({ max: 2, window: 60, trustProxy: true })
    mw(mockCtx('/api', '1.1.1.1'))
    mw(mockCtx('/api', '1.1.1.1'))

    // Different IP should not be blocked
    const ctx = mockCtx('/api', '2.2.2.2')
    const result = mw(ctx)
    expect(result).toBeUndefined()
  })

  it('respects include patterns', () => {
    const mw = rateLimitMiddleware({ max: 1, window: 60, include: ['/api/*'] })

    // Non-API path should not be rate limited
    const ctx1 = mockCtx('/about', '3.3.3.3')
    expect(mw(ctx1)).toBeUndefined()
    expect(ctx1.headers.get('X-RateLimit-Limit')).toBeNull()

    // API path should be rate limited
    const ctx2 = mockCtx('/api/posts', '3.3.3.3')
    mw(ctx2)
    expect(ctx2.headers.get('X-RateLimit-Limit')).toBe('1')
  })

  it('respects exclude patterns', () => {
    const mw = rateLimitMiddleware({
      max: 1,
      window: 60,
      exclude: ['/api/health'],
    })

    // Health endpoint excluded
    const ctx = mockCtx('/api/health', '4.4.4.4')
    mw(ctx)
    expect(ctx.headers.get('X-RateLimit-Limit')).toBeNull()
  })

  it('sets Retry-After header on 429', async () => {
    const mw = rateLimitMiddleware({ max: 1, window: 30 })
    mw(mockCtx('/api', '5.5.5.5'))
    const result = mw(mockCtx('/api', '5.5.5.5'))
    expect(result?.headers.get('Retry-After')).toBeTruthy()
  })

  it('decrements remaining count', () => {
    const mw = rateLimitMiddleware({ max: 5, window: 60 })
    for (let i = 0; i < 3; i++) {
      mw(mockCtx('/api', '6.6.6.6'))
    }
    const ctx = mockCtx('/api', '6.6.6.6')
    mw(ctx)
    expect(ctx.headers.get('X-RateLimit-Remaining')).toBe('1')
  })

  it('supports custom key function', () => {
    const mw = rateLimitMiddleware({
      max: 1,
      window: 60,
      keyFn: (ctx) => ctx.req.headers.get('Authorization') ?? 'anon',
    })

    // Same auth token should share limit
    const ctx1 = mockCtx('/api', '7.7.7.7')
    ctx1.req = new Request('http://localhost/api', {
      headers: { Authorization: 'Bearer abc' },
    })
    mw(ctx1)

    const ctx2 = mockCtx('/api', '8.8.8.8')
    ctx2.req = new Request('http://localhost/api', {
      headers: { Authorization: 'Bearer abc' },
    })
    const result = mw(ctx2)
    expect(result?.status).toBe(429)
  })

  it('enforces a HARD store cap — floods cannot grow memory unbounded (Z1)', () => {
    // Regression: cleanup only deleted EXPIRED entries. A flood of
    // unique keys WITHIN one window (spoofed X-Forwarded-For) produced
    // only fresh entries, so the store grew without bound — an
    // unauthenticated memory-exhaustion DoS. `MAX_STORE_SIZE` (10000)
    // was declared but never enforced. Observable proxy: once the cap
    // is hit the OLDEST tracker is evicted, so a victim seen before a
    // >cap flood is treated as fresh again (counter reset).
    const mw = rateLimitMiddleware({ max: 5, window: 60, trustProxy: true })

    const victim = mockCtx('/api', 'victim-ip')
    mw(victim)
    expect(victim.headers.get('X-RateLimit-Remaining')).toBe('4') // count=1

    for (let i = 0; i < 10_002; i++) mw(mockCtx('/api', `flood-${i}`))

    const victim2 = mockCtx('/api', 'victim-ip')
    mw(victim2)
    // Evicted by the hard cap → brand-new client (count reset → 4).
    // Pre-fix: never evicted (count=2 → '3') AND Map held >10000.
    expect(victim2.headers.get('X-RateLimit-Remaining')).toBe('4')
  })
})

// ─── The first X-Forwarded-For entry is the CLIENT's own claim ───────────────
//
// `defaultKeyFn` took `x-forwarded-for.split(',')[0]`, i.e. whatever the
// caller wrote at the head of the list. Two consequences, both fatal:
//   1. rotating the header mints a fresh bucket per request, so the limiter
//      does nothing at all against the attacker it exists to stop;
//   2. prepending a VICTIM's address spends the victim's bucket, turning the
//      limiter into a denial-of-service tool aimed at other people.
//
// Bisect-verify: restore `?.split(',')[0]?.trim()` as the default key and the
// three specs below fail (rotating requests are never limited; the victim is
// limited by the attacker's traffic; the last-entry spec keys on the client).

function ctxWith(headers: Record<string, string>, path = '/api') {
  const url = new URL(`http://localhost${path}`)
  return {
    req: new Request(url.toString(), { headers }),
    url,
    path,
    headers: new Headers(),
    locals: {} as Record<string, unknown>,
  }
}

describe('forwarded headers are only read when a proxy is declared', () => {
  it('a ROTATING X-Forwarded-For is still limited by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = rateLimitMiddleware({ max: 3, window: 60 })

    // Each request claims a brand-new client address.
    expect(mw(ctxWith({ 'X-Forwarded-For': '9.0.0.1' }))).toBeUndefined()
    expect(mw(ctxWith({ 'X-Forwarded-For': '9.0.0.2' }))).toBeUndefined()
    expect(mw(ctxWith({ 'X-Forwarded-For': '9.0.0.3' }))).toBeUndefined()
    const blocked = mw(ctxWith({ 'X-Forwarded-For': '9.0.0.4' }))
    expect(blocked?.status).toBe(429)
    warn.mockRestore()
  })

  it('warns ONCE per process that every caller shares one bucket', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = rateLimitMiddleware({ max: 50, window: 60 })
    mw(ctxWith({ 'X-Forwarded-For': '9.0.0.1' }))
    mw(ctxWith({ 'X-Forwarded-For': '9.0.0.2' }))
    rateLimitMiddleware({ max: 50, window: 60 })(ctxWith({}))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('trustProxy')
    warn.mockRestore()
  })

  it('a PREPENDED victim address does not spend the victim bucket', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // One declared proxy: the trustworthy entry is the LAST one, which that
    // proxy wrote. The attacker controls only what precedes it.
    const mw = rateLimitMiddleware({ max: 2, window: 60, trustProxy: true })

    // Attacker connects through the proxy, forging a victim address in front.
    mw(ctxWith({ 'X-Forwarded-For': 'victim.ip, attacker.ip' }))
    mw(ctxWith({ 'X-Forwarded-For': 'victim.ip, attacker.ip' }))
    const attackerThird = mw(ctxWith({ 'X-Forwarded-For': 'victim.ip, attacker.ip' }))
    expect(attackerThird?.status).toBe(429) // the ATTACKER is limited

    // The real victim, arriving through the same proxy, is untouched.
    const victim = ctxWith({ 'X-Forwarded-For': 'victim.ip' })
    expect(mw(victim)).toBeUndefined()
    expect(victim.headers.get('X-RateLimit-Remaining')).toBe('1')
    warn.mockRestore()
  })

  it('trustProxy: true keys on the LAST entry', () => {
    const mw = rateLimitMiddleware({ max: 1, window: 60, trustProxy: true })
    mw(ctxWith({ 'X-Forwarded-For': 'aaa, shared.proxy.client' }))
    // Different head, same tail → same bucket.
    const second = mw(ctxWith({ 'X-Forwarded-For': 'bbb, shared.proxy.client' }))
    expect(second?.status).toBe(429)
  })

  it('trustProxy: n keys on the n-th entry from the right', () => {
    const mw = rateLimitMiddleware({ max: 1, window: 60, trustProxy: 2 })
    mw(ctxWith({ 'X-Forwarded-For': 'junk, real.client, edge.proxy' }))
    const second = mw(ctxWith({ 'X-Forwarded-For': 'other, real.client, edge.proxy' }))
    expect(second?.status).toBe(429)

    // A different client at the same depth is its own bucket.
    expect(mw(ctxWith({ 'X-Forwarded-For': 'x, second.client, edge.proxy' }))).toBeUndefined()
  })

  it('a chain SHORTER than the declared hop count is discarded, not walked leftward', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = rateLimitMiddleware({ max: 1, window: 60, trustProxy: 3 })
    // Only one entry — the config does not describe reality, so this falls
    // through to the shared bucket rather than trusting the client's claim.
    mw(ctxWith({ 'X-Forwarded-For': 'client.claim' }))
    const second = mw(ctxWith({ 'X-Forwarded-For': 'different.claim' }))
    expect(second?.status).toBe(429)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reads X-Real-IP only when a proxy is declared', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const untrusting = rateLimitMiddleware({ max: 1, window: 60 })
    untrusting(ctxWith({ 'X-Real-IP': 'a' }))
    expect(untrusting(ctxWith({ 'X-Real-IP': 'b' }))?.status).toBe(429)
    warn.mockRestore()

    const trusting = rateLimitMiddleware({ max: 1, window: 60, trustProxy: true })
    trusting(ctxWith({ 'X-Real-IP': 'a' }))
    expect(trusting(ctxWith({ 'X-Real-IP': 'b' }))).toBeUndefined()
  })

  it('prefers a host-supplied transport peer over the shared bucket', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = rateLimitMiddleware({ max: 1, window: 60 })

    const a = ctxWith({ 'X-Forwarded-For': 'spoofed' })
    a.locals['remoteAddress'] = '203.0.113.9'
    mw(a)

    const b = ctxWith({ 'X-Forwarded-For': 'spoofed-differently' })
    b.locals['remoteAddress'] = '203.0.113.9'
    expect(mw(b)?.status).toBe(429) // same peer → same bucket

    const c = ctxWith({})
    c.locals['remoteAddress'] = '203.0.113.10'
    expect(mw(c)).toBeUndefined() // different peer → own bucket

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('an explicit keyFn wins over every header rule', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = rateLimitMiddleware({
      max: 1,
      window: 60,
      keyFn: (ctx) => ctx.req.headers.get('Authorization') ?? 'anon',
    })
    mw(ctxWith({ Authorization: 'Bearer t', 'X-Forwarded-For': 'one' }))
    expect(mw(ctxWith({ Authorization: 'Bearer t', 'X-Forwarded-For': 'two' }))?.status).toBe(429)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
