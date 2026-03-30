import { describe, expect, it } from 'vitest'
import { rateLimitMiddleware } from '../rate-limit'

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
    const mw = rateLimitMiddleware({ max: 2, window: 60 })
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
})
