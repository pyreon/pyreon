/**
 * @vitest-environment node
 *
 * Proof over REAL HTTP.
 *
 * Every other suite short-circuits at mock middleware, so none of them
 * exercises the thing that actually ships: the real `fetch` transport,
 * against a real socket, with real `Response` bodies, real status codes,
 * real header casing, real redirects, and real cancellation semantics.
 *
 * This file boots a `node:http` server on an ephemeral port and drives the
 * client against it with NO mocks and NO injected transport. It runs under
 * `environment: node` rather than happy-dom so `fetch` is the platform's,
 * not a DOM shim's.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHttp, type HttpClient } from '../client'
import { AbortError, ClientError, HttpError, ServerError, TimeoutError } from '../errors'
import { dedupe, retry } from '../middleware'
import { standardSchema } from '../schema'

let server: Server
let baseUrl: string
let hits: Record<string, number> = {}

/** Read a request body to a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += String(chunk)
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(payload)
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const route = url.pathname
  hits[route] = (hits[route] ?? 0) + 1

  switch (route) {
    case '/users/1':
      json(res, 200, { id: '1', name: 'Ada' })
      return

    case '/echo': {
      const body = await readBody(req)
      json(res, 200, {
        method: req.method,
        body: body ? (JSON.parse(body) as unknown) : null,
        contentType: req.headers['content-type'] ?? null,
        auth: req.headers.authorization ?? null,
        query: Object.fromEntries(url.searchParams.entries()),
      })
      return
    }

    case '/missing':
      json(res, 404, { error: 'not found' })
      return

    case '/boom':
      json(res, 500, { error: 'server exploded' })
      return

    case '/empty':
      res.writeHead(204)
      res.end()
      return

    case '/html':
      res.writeHead(502, { 'content-type': 'text/html' })
      res.end('<!doctype html><h1>Bad Gateway</h1>')
      return

    case '/slow':
      setTimeout(() => json(res, 200, { slow: true }), 300)
      return

    case '/flaky':
      // Fails twice, then succeeds — proves retry over a real socket.
      if ((hits[route] ?? 0) < 3) {
        json(res, 503, { error: 'try again' })
        return
      }
      json(res, 200, { recovered: true, attempts: hits[route] })
      return

    case '/throttled':
      if ((hits[route] ?? 0) < 2) {
        res.writeHead(429, { 'retry-after': '0', 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'slow down' }))
        return
      }
      json(res, 200, { ok: true })
      return

    case '/redirect':
      res.writeHead(302, { location: '/users/1' })
      res.end()
      return

    case '/headers':
      json(res, 200, {
        received: {
          'x-custom': req.headers['x-custom'] ?? null,
          accept: req.headers.accept ?? null,
        },
      })
      return

    case '/big':
      json(res, 200, { items: Array.from({ length: 500 }, (_, i) => ({ i })) })
      return

    default:
      json(res, 404, { error: 'unknown route' })
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

function api(overrides: Parameters<typeof createHttp>[0] = {}): HttpClient {
  // NO transport override — this is the real `fetchTransport` on real fetch.
  return createHttp({ baseUrl, schema: standardSchema, ...overrides })
}

describe('real HTTP — the happy paths', () => {
  it('performs a GET and decodes JSON', async () => {
    expect(await api().get('/users/:id', { params: { id: '1' } }).json()).toEqual({
      id: '1',
      name: 'Ada',
    })
  })

  it('validates a real response against a real schema', async () => {
    const user = await api()
      .get('/users/1')
      .json(z.object({ id: z.string(), name: z.string() }))
    expect(user).toEqual({ id: '1', name: 'Ada' })
  })

  it('sends a JSON body with the right Content-Type and gets it back', async () => {
    const echoed = await api()
      .post('/echo', { json: { hello: 'world' } })
      .json<{ method: string; body: unknown; contentType: string }>()

    expect(echoed.method).toBe('POST')
    expect(echoed.body).toEqual({ hello: 'world' })
    expect(echoed.contentType).toBe('application/json')
  })

  it('round-trips a query string, dropping nullish entries', async () => {
    const echoed = await api()
      .get('/echo', { query: { a: '1', b: undefined, c: 0, d: false } })
      .json<{ query: Record<string, string> }>()

    expect(echoed.query).toEqual({ a: '1', c: '0', d: 'false' })
  })

  it('sends client headers and a per-request header over the wire', async () => {
    const received = await api({ headers: { accept: 'application/json' } })
      .get('/headers', { headers: { 'x-custom': 'yes' } })
      .json<{ received: Record<string, string> }>()

    expect(received.received['x-custom']).toBe('yes')
    expect(received.received.accept).toBe('application/json')
  })

  it('evaluates a header accessor per request against the real socket', async () => {
    let token = 'one'
    const client = api({ headers: () => ({ authorization: `Bearer ${token}` }) })

    const first = await client.post('/echo').json<{ auth: string }>()
    token = 'two'
    const second = await client.post('/echo').json<{ auth: string }>()

    expect(first.auth).toBe('Bearer one')
    expect(second.auth).toBe('Bearer two')
  })

  it('handles a real 204 with no body', async () => {
    expect(await api().delete('/empty').json()).toBeUndefined()
    expect((await api().delete('/empty')).status).toBe(204)
  })

  it('follows a real redirect', async () => {
    expect(await api().get('/redirect').json()).toEqual({ id: '1', name: 'Ada' })
  })

  it('decodes a large payload', async () => {
    const { items } = await api().get('/big').json<{ items: unknown[] }>()
    expect(items).toHaveLength(500)
  })
})

describe('real HTTP — the failure paths', () => {
  it('throws ClientError on a real 404, carrying the readable body', async () => {
    const error = await api().get('/missing').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ClientError)
    expect((error as HttpError).status).toBe(404)
    expect(await (error as HttpError).response.raw.json()).toEqual({ error: 'not found' })
  })

  it('throws ServerError on a real 500', async () => {
    const error = await api().get('/boom').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServerError)
    expect((error as HttpError).status).toBe(500)
  })

  it('raises ParseError naming the URL when a gateway returns HTML', async () => {
    const error = await api()
      .get('/html', { throwHttpErrors: false })
      .json()
      .catch((e: unknown) => e)

    expect((error as Error).name).toBe('ParseError')
    expect((error as Error).message).toContain('/html')
  })

  it('reports a connection failure to a dead port as NetworkError', async () => {
    // Port 1 on loopback refuses immediately on every platform we target.
    const dead = createHttp({ baseUrl: 'http://127.0.0.1:1', timeout: 2000 })
    const error = await dead.get('/x').catch((e: unknown) => e)
    expect((error as Error).name).toBe('NetworkError')
  })
})

describe('real HTTP — cancellation and deadlines', () => {
  it('times out a genuinely slow endpoint', async () => {
    const error = await api().get('/slow', { timeout: 50 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TimeoutError)
  })

  it('aborts an in-flight request through the caller signal', async () => {
    const controller = new AbortController()
    const promise = api().get('/slow', { signal: controller.signal, timeout: 5000 })
    setTimeout(() => controller.abort(), 20)

    const error = await promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AbortError)
    expect(error).not.toBeInstanceOf(TimeoutError)
  })

  it('completes normally when the deadline is generous', async () => {
    expect(await api().get('/slow', { timeout: 5000 }).json()).toEqual({ slow: true })
  })
})

describe('real HTTP — middleware against a real socket', () => {
  it('retries a real 503 until the server recovers', async () => {
    hits = {}
    const result = await api({ use: [retry({ limit: 3, backoff: () => 5 })] })
      .get('/flaky')
      .json<{ recovered: boolean; attempts: number }>()

    expect(result.recovered).toBe(true)
    expect(result.attempts).toBe(3)
    expect(hits['/flaky']).toBe(3)
  })

  it('honours a real Retry-After header', async () => {
    hits = {}
    const started = Date.now()
    const result = await api({
      use: [retry({ limit: 2, backoff: () => 10_000 })],
    })
      .get('/throttled')
      .json<{ ok: boolean }>()

    expect(result.ok).toBe(true)
    // Retry-After said 0; had it been ignored the 10s backoff would apply.
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('dedupes concurrent identical GETs down to ONE real request', async () => {
    hits = {}
    const client = api({ use: [dedupe()] })

    const [a, b, c] = await Promise.all([
      client.get('/users/1').json(),
      client.get('/users/1').json(),
      client.get('/users/1').json(),
    ])

    expect(hits['/users/1']).toBe(1)
    // All three read their own body clone.
    expect(a).toEqual({ id: '1', name: 'Ada' })
    expect(b).toEqual({ id: '1', name: 'Ada' })
    expect(c).toEqual({ id: '1', name: 'Ada' })
  })
})

describe('real HTTP — endpoints end to end', () => {
  it('calls, keys, and validates through one declaration', async () => {
    const client = api()
    const getUser = client.endpoint('GET /users/:id', {
      response: z.object({ id: z.string(), name: z.string() }),
    })

    const user = await getUser({ params: { id: '1' } })
    expect(user).toEqual({ id: '1', name: 'Ada' })
    expect(getUser.key({ params: { id: '1' } })).toEqual([
      'GET',
      '/users/:id',
      { params: { id: '1' } },
    ])
  })

  it('cancels a real request through the query adapter signal', async () => {
    const slow = api().endpoint('GET /slow')
    const controller = new AbortController()
    const promise = slow.query().queryFn({ signal: controller.signal })
    setTimeout(() => controller.abort(), 20)

    await expect(promise).rejects.toBeInstanceOf(AbortError)
  })
})
