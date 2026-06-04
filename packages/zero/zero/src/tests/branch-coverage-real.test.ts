/**
 * Real-test branch-coverage hardening for @pyreon/zero.
 * Targets honest uncov branches in cors / rate-limit / env / meta.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import { corsMiddleware } from '../cors'
import { rateLimitMiddleware } from '../rate-limit'
import { bool, num, oneOf, str, url } from '../env'

function mockCtx(path: string, method = 'GET', origin = 'https://example.com') {
  const u = new URL(`http://localhost${path}`)
  return {
    req: new Request(u.toString(), { method, headers: { Origin: origin } }),
    url: u,
    path,
    headers: new Headers(),
    locals: {},
  }
}

// ─── corsMiddleware — preflight + edge arms ─────────────────────────────────

describe('corsMiddleware — preflight + edges', () => {
  it('returns 204 preflight response for OPTIONS', () => {
    const mw = corsMiddleware({ origin: 'https://example.com', methods: ['GET', 'POST'] })
    const ctx = mockCtx('/api/x', 'OPTIONS', 'https://example.com')
    const res = mw(ctx)
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(204)
  })

  it('preflight with credentials sets Allow-Credentials header (line 75)', () => {
    const mw = corsMiddleware({ origin: 'https://example.com', credentials: true })
    const ctx = mockCtx('/api/x', 'OPTIONS', 'https://example.com')
    const res = mw(ctx) as Response
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('preflight without credentials does NOT set Allow-Credentials', () => {
    const mw = corsMiddleware({ origin: 'https://example.com', credentials: false })
    const ctx = mockCtx('/api/x', 'OPTIONS', 'https://example.com')
    const res = mw(ctx) as Response
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  it('non-matching origin returns undefined (no CORS headers set)', () => {
    const mw = corsMiddleware({ origin: 'https://allowed.com' })
    const ctx = mockCtx('/api/x', 'GET', 'https://blocked.com')
    const res = mw(ctx)
    expect(res).toBeUndefined()
    expect(ctx.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('credentials true sets header on non-preflight requests', () => {
    const mw = corsMiddleware({ origin: '*', credentials: true })
    const ctx = mockCtx('/api/x', 'GET')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('exposedHeaders are set on regular responses (line 60)', () => {
    const mw = corsMiddleware({ origin: '*', exposedHeaders: ['X-Custom-Header', 'X-Other'] })
    const ctx = mockCtx('/api/x', 'GET')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Expose-Headers')).toBe('X-Custom-Header, X-Other')
  })

  it('non-wildcard origin appends Vary: Origin (line 63)', () => {
    const mw = corsMiddleware({ origin: 'https://allowed.com' })
    const ctx = mockCtx('/api/x', 'GET', 'https://allowed.com')
    mw(ctx)
    expect(ctx.headers.get('Vary')).toBe('Origin')
  })

  it('wildcard * origin does NOT append Vary: Origin', () => {
    const mw = corsMiddleware({ origin: '*' })
    const ctx = mockCtx('/api/x', 'GET')
    mw(ctx)
    expect(ctx.headers.get('Vary')).toBeNull()
  })

  it('returns null from resolveOrigin for unknown config type (line 93)', () => {
    // Cast an unknown shape into corsMiddleware to hit the final `return null` arm
    const mw = corsMiddleware({ origin: 123 as unknown as string })
    const ctx = mockCtx('/api/x', 'GET', 'https://example.com')
    const res = mw(ctx)
    expect(res).toBeUndefined()
  })
})

// ─── rateLimitMiddleware — limit + cleanup + 429 path ────────────────────────

describe('rateLimitMiddleware — limit + responses', () => {
  it('first request sets rate limit headers and does not block', () => {
    const mw = rateLimitMiddleware({ max: 5, windowMs: 60_000 })
    const ctx = mockCtx('/api/x', 'GET')
    const res = mw(ctx)
    expect(res).toBeUndefined()
    expect(ctx.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(ctx.headers.get('X-RateLimit-Remaining')).toBe('4')
  })

  it('exceeding max returns 429 Too Many Requests', () => {
    const mw = rateLimitMiddleware({ max: 2, windowMs: 60_000 })
    const ctx1 = mockCtx('/api/x', 'GET', 'https://a.com')
    mw(ctx1)
    const ctx2 = mockCtx('/api/x', 'GET', 'https://a.com')
    mw(ctx2)
    const ctx3 = mockCtx('/api/x', 'GET', 'https://a.com')
    const res = mw(ctx3) as Response
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })

  it('onLimit callback is invoked when limit exceeded (line 110)', () => {
    let saw: unknown = null
    const mw = rateLimitMiddleware({
      max: 1,
      windowMs: 60_000,
      onLimit: (ctx) => {
        saw = ctx.path
        return new Response('blocked', { status: 418 })
      },
    })
    mw(mockCtx('/api/x', 'GET', 'https://a.com'))
    const res = mw(mockCtx('/api/x', 'GET', 'https://a.com')) as Response
    expect(saw).toBe('/api/x')
    expect(res.status).toBe(418)
  })

  it('include filter — request to non-matching path is skipped', () => {
    const mw = rateLimitMiddleware({ max: 1, windowMs: 60_000, include: ['/api/*'] })
    const ctx = mockCtx('/other/x', 'GET')
    const res = mw(ctx)
    expect(res).toBeUndefined()
    // No rate-limit headers when skipped
    expect(ctx.headers.get('X-RateLimit-Limit')).toBeNull()
  })

  it('exclude filter — request to excluded path is skipped', () => {
    const mw = rateLimitMiddleware({ max: 1, windowMs: 60_000, exclude: ['/health'] })
    const ctx = mockCtx('/health', 'GET')
    const res = mw(ctx)
    expect(res).toBeUndefined()
    expect(ctx.headers.get('X-RateLimit-Limit')).toBeNull()
  })

  it('custom keyFn is used (line 128 fallback also tested via no headers)', () => {
    let keyFnCalls = 0
    const mw = rateLimitMiddleware({
      max: 5,
      windowMs: 60_000,
      keyFn: (ctx) => {
        keyFnCalls++
        return `custom-${ctx.path}`
      },
    })
    mw(mockCtx('/api/x', 'GET'))
    expect(keyFnCalls).toBe(1)
  })
})

// ─── env validators — branch matrix ─────────────────────────────────────────

describe('env validators — branch coverage', () => {
  it('str() — required + default-based optionality', () => {
    const v = str()
    expect(v.required).toBe(true)
    expect(v.parse('hello', 'KEY')).toBe('hello')
    expect(() => v.parse(undefined, 'KEY')).toThrow(/required/)
  })

  it('str() with default — non-required and fallback', () => {
    const v = str({ default: 'fallback' })
    expect(v.required).toBe(false)
    expect(v.parse(undefined, 'KEY')).toBe('fallback')
    expect(v.parse('', 'KEY')).toBe('fallback')
    expect(v.parse('custom', 'KEY')).toBe('custom')
  })

  it('num() — parses integers', () => {
    const v = num()
    expect(v.parse('42', 'PORT')).toBe(42)
  })

  it('num() — throws on non-numeric', () => {
    const v = num()
    expect(() => v.parse('notanumber', 'PORT')).toThrow(/number/)
  })

  it('num() with default — empty + undefined → default', () => {
    const v = num({ default: 8080 })
    expect(v.parse(undefined, 'PORT')).toBe(8080)
    expect(v.parse('', 'PORT')).toBe(8080)
  })

  it('bool() — true/false (any case)', () => {
    const v = bool()
    expect(v.parse('true', 'X')).toBe(true)
    expect(v.parse('TRUE', 'X')).toBe(true)
    expect(v.parse('false', 'X')).toBe(false)
    expect(v.parse('FALSE', 'X')).toBe(false)
  })

  it('bool() throws on invalid string', () => {
    const v = bool()
    expect(() => v.parse('maybe', 'X')).toThrow(/true.*false/)
  })

  it('bool() with default — undefined/empty → default', () => {
    const v = bool({ default: false })
    expect(v.parse(undefined, 'X')).toBe(false)
    expect(v.parse('', 'X')).toBe(false)
  })

  it('url() — accepts valid URLs', () => {
    const v = url()
    expect(v.parse('https://example.com', 'API')).toBe('https://example.com')
  })

  it('url() — rejects invalid URLs (line 122-124)', () => {
    const v = url()
    expect(() => v.parse('not a url', 'API')).toThrow(/URL/)
  })

  it('url() with default — undefined/empty → default', () => {
    const v = url({ default: 'http://localhost' })
    expect(v.parse(undefined, 'API')).toBe('http://localhost')
    expect(v.parse('', 'API')).toBe('http://localhost')
  })

  it('url() — required when no default + raw missing throws', () => {
    const v = url()
    expect(() => v.parse(undefined, 'API')).toThrow(/required/)
  })

  it('oneOf() — accepts allowed value', () => {
    const v = oneOf(['dev', 'prod'] as const)
    expect(v.parse('dev', 'ENV')).toBe('dev')
    expect(v.parse('prod', 'ENV')).toBe('prod')
  })

  it('oneOf() — rejects non-allowed value (line 146-152)', () => {
    const v = oneOf(['dev', 'prod'] as const)
    expect(() => v.parse('staging', 'ENV')).toThrow(/one of/)
  })

  it('oneOf() with default — undefined/empty → default (line 142-143)', () => {
    const v = oneOf(['dev', 'prod'] as const, { default: 'dev' })
    expect(v.parse(undefined, 'ENV')).toBe('dev')
    expect(v.parse('', 'ENV')).toBe('dev')
  })

  it('oneOf() — required when no default + raw missing throws', () => {
    const v = oneOf(['dev', 'prod'] as const)
    expect(() => v.parse(undefined, 'ENV')).toThrow(/required/)
  })
})
