/**
 * Real Chromium.
 *
 * Every other suite runs in Node or happy-dom. A browser is where this
 * client actually ships, and it differs in ways that matter: `fetch` is the
 * browser's, `Headers` enforces forbidden-header rules, `AbortController`
 * interacts with real network teardown, `Response.clone()` tees a real
 * stream, and `credentials` / CORS exist at all.
 *
 * Requests here go to the vitest dev server's own origin, so they are real
 * network round-trips inside the page — not a mock, not a Node socket.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHttp } from '../client'
import { AbortError, ClientError, TimeoutError } from '../errors'
import { dedupe, retry } from '../middleware'
import { createMock } from '../mock'
import { getAmbientRequest } from '../request-context'
import { standardSchema } from '../schema'

describe('real Chromium — platform primitives', () => {
  it('runs the whole pipeline against the browser fetch', async () => {
    // `/package.json` is served by the vitest dev server from the package
    // root — a real request over the real network stack.
    const api = createHttp({ schema: standardSchema })
    const pkg = await api
      .get('/package.json')
      .json(z.object({ name: z.string() }))

    expect(pkg.name).toBe('@pyreon/http')
  })

  it('throws ClientError on a real browser 404', async () => {
    const api = createHttp()
    const error = await api.get('/definitely-not-here.json').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ClientError)
    expect((error as ClientError).status).toBe(404)
  })

  it('uses the BROWSER Headers implementation for layering', async () => {
    const handle = createMock([{ path: '/x', json: {} }])
    const api = createHttp({ use: [handle.middleware], headers: { 'x-a': '1', 'x-b': '1' } })

    await api.get('/x', { headers: { 'x-b': '2' } })

    expect(handle.calls[0]!.headers['x-a']).toBe('1')
    expect(handle.calls[0]!.headers['x-b']).toBe('2')
  })

  it('has no ambient request in a browser — the SSR seam stays inert', () => {
    expect(getAmbientRequest()).toBeUndefined()
  })
})

describe('real Chromium — cancellation', () => {
  it('aborts an in-flight request through the browser AbortController', async () => {
    const api = createHttp({ use: [createMock([{ path: '/slow', delay: 300, json: {} }]).middleware] })
    const controller = new AbortController()

    const promise = api.get('/slow', { signal: controller.signal, timeout: 5000 })
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(AbortError)
  })

  it('applies the deadline with real browser timers', async () => {
    const api = createHttp({ use: [createMock([{ path: '/slow', delay: 300, json: {} }]).middleware] })
    await expect(api.get('/slow', { timeout: 30 })).rejects.toBeInstanceOf(TimeoutError)
  })
})

describe('real Chromium — middleware', () => {
  it('retries against a real browser response', async () => {
    let calls = 0
    const api = createHttp({
      use: [retry({ limit: 3, backoff: () => 5 })],
      transport: (request) => {
        calls += 1
        return Promise.resolve({
          raw: new Response('{}', { status: calls < 3 ? 503 : 200 }),
          status: calls < 3 ? 503 : 200,
          ok: calls >= 3,
          headers: new Headers(),
          request,
        })
      },
    })

    expect((await api.get('/x')).status).toBe(200)
    expect(calls).toBe(3)
  })

  it('clones a REAL browser Response so every deduped caller can read it', async () => {
    // `Response.clone()` tees a live stream in a browser. If the shared
    // response were handed out uncloned, the second `.json()` would throw
    // "body stream already read".
    let calls = 0
    const api = createHttp({
      use: [dedupe()],
      transport: async (request) => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return {
          raw: new Response(JSON.stringify({ n: calls })),
          status: 200,
          ok: true,
          headers: new Headers(),
          request,
        }
      },
    })

    const [a, b, c] = await Promise.all([
      api.get('/x').json(),
      api.get('/x').json(),
      api.get('/x').json(),
    ])

    expect(calls).toBe(1)
    expect([a, b, c]).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }])
  })
})

describe('real Chromium — schema validation', () => {
  it('validates and rejects with the browser JSON parser', async () => {
    const api = createHttp({
      use: [createMock([{ path: '/bad', json: { id: 42 } }]).middleware],
      schema: standardSchema,
    })

    await expect(api.get('/bad').json(z.object({ id: z.string() }))).rejects.toThrow(
      /did not match/,
    )
  })
})
