import { describe, expect, it } from 'vitest'
import { corsMiddleware } from '../cors'

function mockCtx(path: string, method = 'GET', origin = 'https://example.com') {
  const url = new URL(`http://localhost${path}`)
  const req = new Request(url.toString(), {
    method,
    headers: { Origin: origin },
  })
  return {
    req,
    url,
    path,
    headers: new Headers(),
    locals: {},
  }
}

describe('corsMiddleware', () => {
  it('sets Access-Control-Allow-Origin to * by default', () => {
    const mw = corsMiddleware()
    const ctx = mockCtx('/api/posts')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('matches specific origin', () => {
    const mw = corsMiddleware({ origin: 'https://example.com' })
    const ctx = mockCtx('/api/posts', 'GET', 'https://example.com')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
  })

  it('rejects non-matching origin', () => {
    const mw = corsMiddleware({ origin: 'https://example.com' })
    const ctx = mockCtx('/api/posts', 'GET', 'https://evil.com')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('matches origin from array', () => {
    const mw = corsMiddleware({
      origin: ['https://app.com', 'https://admin.com'],
    })
    const ctx = mockCtx('/api', 'GET', 'https://admin.com')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.com')
  })

  it('matches origin from function', () => {
    const mw = corsMiddleware({
      origin: (o) => o.endsWith('.example.com'),
    })
    const ctx = mockCtx('/api', 'GET', 'https://app.example.com')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
  })

  it('handles OPTIONS preflight', () => {
    const mw = corsMiddleware()
    const ctx = mockCtx('/api/posts', 'OPTIONS')
    const result = mw(ctx)
    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(204)
    expect(result?.headers.get('Access-Control-Allow-Methods')).toContain('GET')
  })

  it('sets credentials header when enabled', () => {
    const mw = corsMiddleware({ credentials: true })
    const ctx = mockCtx('/api')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('sets exposed headers', () => {
    const mw = corsMiddleware({ exposedHeaders: ['X-Total-Count'] })
    const ctx = mockCtx('/api')
    mw(ctx)
    expect(ctx.headers.get('Access-Control-Expose-Headers')).toBe('X-Total-Count')
  })

  it('adds Vary: Origin for non-wildcard origins', () => {
    const mw = corsMiddleware({ origin: 'https://example.com' })
    const ctx = mockCtx('/api', 'GET', 'https://example.com')
    mw(ctx)
    expect(ctx.headers.get('Vary')).toBe('Origin')
  })
})
