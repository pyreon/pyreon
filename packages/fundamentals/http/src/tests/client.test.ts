import { describe, expect, it, vi } from 'vitest'
import { createHttp } from '../client'
import {
  AbortError,
  ClientError,
  HttpError,
  NetworkError,
  ParseError,
  RequestError,
  ServerError,
  TimeoutError,
} from '../errors'
import { createMock, mock } from '../mock'
import { toHttpResponse } from '../transport'
import type { HttpMiddleware, Transport } from '../types'

/** A transport that records the request and replies with a fixed body. */
function stub(
  body: unknown = { ok: true },
  init: ResponseInit = {},
): { transport: Transport; seen: { url: string; headers: Headers; body: BodyInit | null }[] } {
  const seen: { url: string; headers: Headers; body: BodyInit | null }[] = []
  const transport: Transport = (request) => {
    seen.push({ url: request.url, headers: request.headers, body: request.body })
    const headers = new Headers(init.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return Promise.resolve(
      toHttpResponse(new Response(JSON.stringify(body), { ...init, headers }), request),
    )
  }
  return { transport, seen }
}

describe('createHttp — request building', () => {
  it('resolves baseUrl, path params and query', async () => {
    const { transport, seen } = stub()
    const api = createHttp({ baseUrl: '/api', transport })

    await api.get('/users/:id', { params: { id: 3 }, query: { full: true } })

    expect(seen[0]!.url).toBe('/api/users/3?full=true')
  })

  it('serializes `json` and sets Content-Type', async () => {
    const { transport, seen } = stub()
    const api = createHttp({ transport })

    await api.post('/users', { json: { name: 'Ada' } })

    expect(seen[0]!.body).toBe('{"name":"Ada"}')
    expect(seen[0]!.headers.get('content-type')).toBe('application/json')
  })

  it('leaves a caller-set Content-Type alone', async () => {
    const { transport, seen } = stub()
    const api = createHttp({ transport })

    await api.post('/x', { json: { a: 1 }, headers: { 'content-type': 'application/merge-patch+json' } })

    expect(seen[0]!.headers.get('content-type')).toBe('application/merge-patch+json')
  })

  it('refuses `json` and `body` together rather than silently picking one', async () => {
    const { transport } = stub()
    const api = createHttp({ transport })

    await expect(api.post('/x', { json: { a: 1 }, body: 'raw' })).rejects.toThrow(
      /pass either `json` or `body`/,
    )
  })

  it('issues every method through the same pipeline', async () => {
    const handle = createMock([
      { method: 'PUT', path: '/x', json: { m: 'PUT' } },
      { method: 'PATCH', path: '/x', json: { m: 'PATCH' } },
      { method: 'DELETE', path: '/x', json: { m: 'DELETE' } },
      { method: 'HEAD', path: '/x', status: 200 },
      { method: 'OPTIONS', path: '/x', status: 204 },
    ])
    const api = createHttp({ use: [handle.middleware] })

    expect(await api.put('/x').json()).toEqual({ m: 'PUT' })
    expect(await api.patch('/x').json()).toEqual({ m: 'PATCH' })
    expect(await api.delete('/x').json()).toEqual({ m: 'DELETE' })
    expect((await api.head('/x')).status).toBe(200)
    expect((await api.options('/x')).status).toBe(204)
  })
})

describe('createHttp — headers', () => {
  it('evaluates an accessor per request so a rotating token stays current', async () => {
    const { transport, seen } = stub()
    let token = 'first'
    const api = createHttp({ transport, headers: () => ({ authorization: token }) })

    await api.get('/a')
    token = 'second'
    await api.get('/b')

    expect(seen[0]!.headers.get('authorization')).toBe('first')
    expect(seen[1]!.headers.get('authorization')).toBe('second')
  })

  it('layers client headers under per-call headers', async () => {
    const { transport, seen } = stub()
    const api = createHttp({ transport, headers: { 'x-a': '1', 'x-b': '1' } })

    await api.get('/x', { headers: { 'x-b': '2' } })

    expect(seen[0]!.headers.get('x-a')).toBe('1')
    expect(seen[0]!.headers.get('x-b')).toBe('2')
  })

  // The three regression tests below lock the static-source FOLD (statics are
  // pre-merged once and cloned per request; sources from the first FUNCTION
  // source onward stay dynamic). Bisect-verified: folding ALL sources
  // (ignoring the function boundary) fails the ordering test; applying the
  // pair-array form via per-pair `set` (instead of the combining Headers
  // constructor) fails the duplicate-key test.

  it('a static source AFTER an accessor source still overrides it (fold stops at the first function source)', async () => {
    const { transport, seen } = stub()
    let token = 'live'
    const api = createHttp({ transport, headers: { 'x-base': 'a', 'x-shared': 'base' } })
      .extend({ headers: () => ({ authorization: token, 'x-shared': 'fn' }) })
      .extend({ headers: { 'x-shared': 'late-static' } })

    await api.get('/x')
    token = 'rotated'
    await api.get('/y')

    // Later sources override earlier keys, INCLUDING a static after a function:
    expect(seen[0]!.headers.get('x-shared')).toBe('late-static')
    expect(seen[0]!.headers.get('x-base')).toBe('a')
    // ...and the function source still re-evaluates per request:
    expect(seen[0]!.headers.get('authorization')).toBe('live')
    expect(seen[1]!.headers.get('authorization')).toBe('rotated')
  })

  it('pair-array header sources COMBINE duplicate keys (Headers append semantics)', async () => {
    const { transport, seen } = stub()
    const api = createHttp({
      transport,
      headers: [
        ['accept', 'application/json'],
        ['accept', 'text/plain'],
      ],
    })

    await api.get('/x')

    expect(seen[0]!.headers.get('accept')).toBe('application/json, text/plain')
  })

  it('accepts a Headers instance as a source', async () => {
    const { transport, seen } = stub()
    const preset = new Headers({ 'x-from-headers': 'yes' })
    const api = createHttp({ transport, headers: preset })

    await api.get('/x')

    expect(seen[0]!.headers.get('x-from-headers')).toBe('yes')
  })
})

describe('createHttp — response promise surface (thenable contract)', () => {
  it('supports .catch for rejection routing and .finally on both paths', async () => {
    const failing: Transport = () => Promise.reject(new Error('boom'))
    const api = createHttp({ transport: failing, timeout: false })

    let caught: unknown
    let finallyRan = 0
    await api
      .get('/x')
      .catch((err: unknown) => {
        caught = err
      })
      .finally(() => {
        finallyRan++
      })
    // A custom transport's rejection propagates raw (NetworkError wrapping
    // is fetchTransport's job, not the client's).
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('boom')

    const { transport } = stub({ ok: true })
    const ok = createHttp({ transport })
    await ok.get('/x').finally(() => {
      finallyRan++
    })
    expect(finallyRan).toBe(2)
  })

  it('works with Promise.all and .then chaining like a native promise', async () => {
    const { transport } = stub({ n: 7 })
    const api = createHttp({ transport })

    const [a, b] = await Promise.all([api.get('/a'), api.get('/b').then((r) => r.status)])
    expect(a.status).toBe(200)
    expect(b).toBe(200)
  })
})

describe('createHttp — extend is immutable', () => {
  it('accumulates headers and middleware without mutating the parent', async () => {
    const { transport, seen } = stub()
    const order: string[] = []
    const tag = (name: string): HttpMiddleware => async (req, next) => {
      order.push(name)
      return next(req)
    }

    const base = createHttp({ transport, headers: { 'x-base': '1' }, use: [tag('base')] })
    const child = base.extend({ headers: { 'x-child': '1' }, use: [tag('child')] })

    await child.get('/x')
    expect(seen[0]!.headers.get('x-base')).toBe('1')
    expect(seen[0]!.headers.get('x-child')).toBe('1')
    expect(order).toEqual(['base', 'child'])

    order.length = 0
    await base.get('/y')
    // The parent never learned about the child's header or middleware.
    expect(seen[1]!.headers.get('x-child')).toBeNull()
    expect(order).toEqual(['base'])
  })

  it('overrides scalars', async () => {
    const { transport, seen } = stub()
    const base = createHttp({ transport, baseUrl: '/v1' })
    await base.extend({ baseUrl: '/v2' }).get('/x')
    expect(seen[0]!.url).toBe('/v2/x')
  })
})

describe('createHttp — errors', () => {
  it('throws the most specific subclass for a status', async () => {
    const api = createHttp({
      use: [
        mock([
          { path: '/missing', status: 404, json: { error: 'nope' } },
          { path: '/boom', status: 500, json: { error: 'bad' } },
          { path: '/teapot', status: 302, json: {} },
        ]),
      ],
    })

    await expect(api.get('/missing')).rejects.toBeInstanceOf(ClientError)
    await expect(api.get('/boom')).rejects.toBeInstanceOf(ServerError)
    // A non-2xx that is neither 4xx nor 5xx still throws the base class.
    await expect(api.get('/teapot')).rejects.toBeInstanceOf(HttpError)
  })

  it('keeps the status and the response on the error', async () => {
    const api = createHttp({ use: [mock([{ path: '/x', status: 422, json: { errors: ['a'] } }])] })

    const error = await api.get('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(422)
    expect((error as HttpError).message).toContain('HTTP 422')
    // The body is still readable — this is what a global error reporter needs.
    expect(await (error as HttpError).response.raw.json()).toEqual({ errors: ['a'] })
  })

  it('honours throwHttpErrors: false at both client and call level', async () => {
    const routes = [{ path: '/x', status: 404, json: {} }]
    const lenient = createHttp({ use: [mock(routes)], throwHttpErrors: false })
    expect((await lenient.get('/x')).status).toBe(404)

    const strict = createHttp({ use: [mock(routes)] })
    expect((await strict.get('/x', { throwHttpErrors: false })).status).toBe(404)
  })

  it('reports a transport failure as NetworkError, not a bare TypeError', async () => {
    const api = createHttp({
      transport: () => Promise.reject(new TypeError('Failed to fetch')),
      use: [],
    })
    // The stub transport rejects directly, so wrap it the way fetch does.
    const wrapped = createHttp({
      transport: async (request) => {
        try {
          return await api.get(request.url)
        } catch (cause) {
          throw new NetworkError(cause, request)
        }
      },
    })
    await expect(wrapped.get('/x')).rejects.toBeInstanceOf(NetworkError)
  })

  it('every error shares the RequestError base', async () => {
    const api = createHttp({ use: [mock([{ path: '/x', status: 500, json: {} }])] })
    await expect(api.get('/x')).rejects.toBeInstanceOf(RequestError)
  })
})

describe('createHttp — cancellation vs timeout', () => {
  it('reports a timeout as TimeoutError, distinct from an abort', async () => {
    const api = createHttp({ use: [mock([{ path: '/slow', delay: 200, json: {} }])] })

    const error = await api.get('/slow', { timeout: 10 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TimeoutError)
    expect((error as TimeoutError).timeout).toBe(10)
    expect((error as TimeoutError).message).toContain('timed out after 10ms')
  })

  it('reports caller cancellation as AbortError — never as a timeout', async () => {
    const api = createHttp({ use: [mock([{ path: '/slow', delay: 200, json: {} }])] })
    const controller = new AbortController()

    const promise = api.get('/slow', { signal: controller.signal, timeout: 5000 })
    controller.abort()

    const error = await promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AbortError)
    expect(error).not.toBeInstanceOf(TimeoutError)
  })

  it('honours an already-aborted signal', async () => {
    const api = createHttp({ use: [mock([{ path: '/x', json: {} }])] })
    await expect(
      api.get('/x', { signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(AbortError)
  })

  it('timeout: false disables the deadline', async () => {
    const api = createHttp({ use: [mock([{ path: '/slow', delay: 20, json: { ok: 1 } }])] })
    expect(await api.get('/slow', { timeout: false }).json()).toEqual({ ok: 1 })
  })

  it('releases the timeout timer on the SUCCESS path (leak class I)', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const api = createHttp({ use: [mock([{ path: '/x', json: {} }])] })
    await api.get('/x', { timeout: 5000 })
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })

  it('removes the abort listener from a REUSED caller signal (leak class D)', async () => {
    const api = createHttp({ use: [mock([{ path: '/x', json: {} }])] })
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')

    // One long-lived controller across many requests must not accumulate
    // one listener per request.
    for (let i = 0; i < 5; i += 1) await api.get('/x', { signal: controller.signal })

    expect(remove).toHaveBeenCalledTimes(5)
  })
})

describe('createHttp — body decoding', () => {
  it('returns undefined for a bodyless status instead of throwing', async () => {
    const api = createHttp({ use: [mock([{ method: 'DELETE', path: '/x', status: 204 }])] })
    expect(await api.delete('/x').json()).toBeUndefined()
  })

  it('returns undefined for an empty 200 body', async () => {
    const api = createHttp({ use: [mock([{ path: '/x', status: 200, body: '' }])] })
    expect(await api.get('/x').json()).toBeUndefined()
  })

  it('raises ParseError naming the URL when a proxy returns HTML', async () => {
    const api = createHttp({
      use: [mock([{ path: '/x', body: '<!doctype html><h1>502</h1>', headers: { 'content-type': 'text/html' } }])],
    })
    const error = await api.get('/x').json().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ParseError)
    expect((error as ParseError).message).toContain('/x')
  })

  it('decodes text, blob, arrayBuffer and void', async () => {
    const api = createHttp({
      use: [
        mock([
          { path: '/t', body: 'hello' },
          { path: '/b', body: 'bytes' },
          { path: '/v', status: 204 },
        ]),
      ],
    })
    expect(await api.get('/t').text()).toBe('hello')
    expect((await api.get('/b').blob()).size).toBe(5)
    expect((await api.get('/b').arrayBuffer()).byteLength).toBe(5)
    await expect(api.get('/v').void()).resolves.toBeUndefined()
  })

  it('drains the body on void() for a normal response', async () => {
    const api = createHttp({ use: [mock([{ path: '/v', json: { a: 1 } }])] })
    await expect(api.get('/v').void()).resolves.toBeUndefined()
  })

  it('awaiting the promise directly yields the response', async () => {
    const api = createHttp({ use: [mock([{ path: '/x', json: { a: 1 } }])] })
    const response = await api.get('/x')
    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.request.method).toBe('GET')
  })
})
