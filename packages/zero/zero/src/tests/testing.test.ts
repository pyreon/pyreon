import { describe, expect, it } from 'vitest'
import {
  createMockHandler,
  createTestApiServer,
  createTestContext,
  testMiddleware,
} from '../testing'

describe('createTestContext', () => {
  it('creates a GET context by default', () => {
    const ctx = createTestContext('/api/posts')
    expect(ctx.path).toBe('/api/posts')
    expect(ctx.req.method).toBe('GET')
  })

  it('creates a POST context with JSON body', () => {
    const ctx = createTestContext('/api/posts', {
      method: 'POST',
      body: { title: 'Hello' },
    })
    expect(ctx.req.method).toBe('POST')
    expect(ctx.req.headers.get('Content-Type')).toBe('application/json')
  })

  it('accepts custom headers', () => {
    const ctx = createTestContext('/api', {
      headers: { Authorization: 'Bearer token' },
    })
    expect(ctx.req.headers.get('Authorization')).toBe('Bearer token')
  })

  it('initializes empty response headers and locals', () => {
    const ctx = createTestContext('/')
    expect(ctx.headers).toBeInstanceOf(Headers)
    expect(ctx.locals).toEqual({})
  })
})

describe('testMiddleware', () => {
  it('runs middleware and returns response + headers', async () => {
    const mw = (ctx: { headers: Headers }) => {
      ctx.headers.set('X-Test', 'passed')
    }
    const { response, headers } = await testMiddleware(mw, '/test')
    expect(response).toBeUndefined()
    expect(headers.get('X-Test')).toBe('passed')
  })

  it('captures short-circuit responses', async () => {
    const mw = () => new Response('blocked', { status: 403 })
    const { response } = await testMiddleware(mw, '/admin')
    expect(response?.status).toBe(403)
  })
})

describe('createTestApiServer', () => {
  it('dispatches to matching route', async () => {
    const server = createTestApiServer([
      {
        pattern: '/api/health',
        module: {
          GET: () => Response.json({ status: 'ok' }),
        },
      },
    ])

    const response = await server.request('/api/health')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  it('returns 404 for unmatched routes', async () => {
    const server = createTestApiServer([])
    const response = await server.request('/api/unknown')
    expect(response.status).toBe(404)
  })

  it('supports POST with body', async () => {
    const server = createTestApiServer([
      {
        pattern: '/api/posts',
        module: {
          POST: async (ctx) => {
            const data = await ctx.request.json()
            return Response.json(data, { status: 201 })
          },
        },
      },
    ])

    const response = await server.request('/api/posts', {
      method: 'POST',
      body: { title: 'Test' },
    })
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.title).toBe('Test')
  })
})

describe('createMockHandler', () => {
  it('records calls', async () => {
    const handler = createMockHandler({ body: { ok: true } })

    await handler({
      request: new Request('http://localhost/api/posts'),
      url: new URL('http://localhost/api/posts'),
      path: '/api/posts',
      params: {},
      headers: new Headers(),
    })

    expect(handler.calls).toHaveLength(1)
    expect(handler.calls[0].path).toBe('/api/posts')
  })

  it('returns configured response', async () => {
    const handler = createMockHandler({ status: 201, body: { id: 1 } })

    const response = await handler({
      request: new Request('http://localhost/api'),
      url: new URL('http://localhost/api'),
      path: '/api',
      params: { id: '42' },
      headers: new Headers(),
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.id).toBe(1)
    expect(handler.calls[0].params).toEqual({ id: '42' })
  })
})
