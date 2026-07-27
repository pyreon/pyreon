/**
 * The DEFAULT transport — the code path every real consumer takes.
 *
 * Every other suite runs against mock middleware, which short-circuits
 * before `fetch` is ever reached. That makes this file load-bearing: without
 * it, the one component that ships to production would be the one component
 * with no coverage.
 */

import { describe, expect, it, vi } from 'vitest'
import { createHttp } from '../client'
import { AbortError, NetworkError } from '../errors'
import { createFetchTransport, fetchTransport, toHttpResponse } from '../transport'
import type { HttpRequest } from '../types'

const request = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'GET',
  url: 'https://api.test/x',
  headers: new Headers({ 'x-t': 'v' }),
  body: null,
  signal: undefined,
  credentials: undefined,
  meta: {},
  ...overrides,
})

describe('createFetchTransport', () => {
  it('passes method, url, headers and body through to fetch', async () => {
    const impl = vi.fn(async () => new Response('{}', { status: 200 }))
    const transport = createFetchTransport(impl as unknown as typeof fetch)

    await transport(request({ method: 'POST', body: '{"a":1}' }))

    const [url, init] = impl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/x')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(new Headers(init.headers).get('x-t')).toBe('v')
  })

  it('omits signal and credentials when unset rather than sending undefined', async () => {
    const impl = vi.fn(async () => new Response('{}'))
    await createFetchTransport(impl as unknown as typeof fetch)(request())

    const [, init] = impl.mock.calls[0] as unknown as [string, RequestInit]
    expect('signal' in init).toBe(false)
    expect('credentials' in init).toBe(false)
  })

  it('forwards signal and credentials when set', async () => {
    const impl = vi.fn(async () => new Response('{}'))
    const controller = new AbortController()
    await createFetchTransport(impl as unknown as typeof fetch)(
      request({ signal: controller.signal, credentials: 'include' }),
    )

    const [, init] = impl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
    expect(init.credentials).toBe('include')
  })

  it('maps a fetch rejection to NetworkError — not a bare TypeError', async () => {
    const impl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const error = await createFetchTransport(impl as unknown as typeof fetch)(request()).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).cause).toBeInstanceOf(TypeError)
    expect((error as NetworkError).message).toContain('https://api.test/x')
  })

  it('maps a DOMException abort to AbortError, keeping it out of NetworkError', async () => {
    const impl = vi.fn(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    const error = await createFetchTransport(impl as unknown as typeof fetch)(request()).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(AbortError)
    expect(error).not.toBeInstanceOf(NetworkError)
  })

  it('reports a missing global fetch as a NetworkError with a readable message', async () => {
    const original = globalThis.fetch
    // @ts-expect-error — deliberately removing the global to model a
    // runtime (an older Node, a stripped worker) that has no fetch.
    delete globalThis.fetch

    const error = await fetchTransport(request()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).message).toContain('no global `fetch`')

    globalThis.fetch = original
  })

  it('preserves a non-2xx response instead of rejecting — the client decides', async () => {
    const impl = vi.fn(async () => new Response('{}', { status: 500 }))
    const response = await createFetchTransport(impl as unknown as typeof fetch)(request())

    expect(response.status).toBe(500)
    expect(response.ok).toBe(false)
  })
})

describe('toHttpResponse', () => {
  it('mirrors the WHATWG response and links back to the request', () => {
    const raw = new Response('{}', { status: 201, headers: { 'x-r': '1' } })
    const req = request()
    const response = toHttpResponse(raw, req)

    expect(response.raw).toBe(raw)
    expect(response.status).toBe(201)
    expect(response.ok).toBe(true)
    expect(response.headers.get('x-r')).toBe('1')
    expect(response.request).toBe(req)
  })
})

describe('end-to-end through the default transport', () => {
  it('runs a real client against an injected fetch', async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ id: '1' }), { status: 200 }))
    const api = createHttp({
      baseUrl: 'https://api.test',
      transport: createFetchTransport(impl as unknown as typeof fetch),
    })

    expect(await api.get('/users/:id', { params: { id: '1' } }).json()).toEqual({ id: '1' })
    expect((impl.mock.calls[0] as unknown as [string])[0]).toBe('https://api.test/users/1')
  })

  it('defaults to the shared fetch transport when none is configured', async () => {
    const original = globalThis.fetch
    const impl = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    globalThis.fetch = impl as unknown as typeof fetch

    const api = createHttp({ baseUrl: 'https://api.test' })
    expect(await api.get('/x').json()).toEqual({ ok: true })

    globalThis.fetch = original
  })
})
