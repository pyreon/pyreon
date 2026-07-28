/**
 * @vitest-environment node
 *
 * `@pyreon/router` loaders.
 *
 * A `RouteLoaderFn` receives `{ params, query, signal, request }`, where
 * `signal` is aborted when a NEWER navigation supersedes this one. That is
 * the same contract TanStack's `queryFn` has, and the same failure mode: a
 * loader that drops the signal keeps fetching for a route the user already
 * navigated away from, and a slow response from an abandoned navigation can
 * still resolve.
 *
 * `request` is populated only during SSR and is `undefined` on every CSR
 * navigation, so the two paths are tested separately.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHttp } from '../client'
import { AbortError } from '../errors'
import { createMock } from '../mock'
import { standardSchema } from '../schema'
import { runWithRequest } from '../server'

/** The shape `@pyreon/router` hands a loader. */
interface LoaderContext {
  params: Record<string, string>
  query: Record<string, string>
  signal: AbortSignal
  request?: Request
}

let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const delay = Number(url.searchParams.get('delay') ?? 0)
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: '1', cookie: req.headers.cookie ?? null }))
    }, delay)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

describe('a loader forwards the navigation signal', () => {
  it('CANCELS an in-flight loader when the navigation is superseded', async () => {
    const api = createHttp({ baseUrl: origin })
    const getUser = api.endpoint('GET /users/:id')

    // Exactly what a route module exports.
    const loader = (ctx: LoaderContext): Promise<unknown> =>
      getUser({ params: { id: ctx.params.id! }, signal: ctx.signal })

    const controller = new AbortController()
    const promise = loader({
      params: { id: '1' },
      query: { delay: '300' },
      signal: controller.signal,
    })

    // A newer navigation aborts the previous one.
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(AbortError)
  })

  it('resolves normally when the navigation is not superseded', async () => {
    const api = createHttp({ baseUrl: origin, schema: standardSchema })
    const getUser = api.endpoint('GET /users/:id', { response: z.object({ id: z.string() }) })

    const loader = (ctx: LoaderContext): Promise<{ id: string }> =>
      getUser({ params: { id: ctx.params.id! }, signal: ctx.signal })

    const result = await loader({
      params: { id: '1' },
      query: {},
      signal: new AbortController().signal,
    })

    expect(result).toEqual({ id: '1' })
  })

  it('reaches the client through the endpoint query adapter too', async () => {
    const handle = createMock([{ path: '/users/1', delay: 200, json: {} }])
    const api = createHttp({ baseUrl: '/api', use: [handle.middleware] })
    const getUser = api.endpoint('GET /users/:id')

    const controller = new AbortController()
    const promise = getUser.query({ params: { id: '1' } }).queryFn({
      signal: controller.signal,
    })
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(AbortError)
  })
})

describe('a loader on the SSR path', () => {
  it('resolves a relative URL and forwards cookies from ctx.request', async () => {
    // `LoaderContext.request` is populated only during SSR. Wrapping the
    // loader in `runWithRequest` gives a relative `baseUrl` an origin — on
    // the server it otherwise has none and `fetch` rejects outright.
    const api = createHttp({ baseUrl: '/' })

    const loader = async (ctx: LoaderContext): Promise<unknown> => {
      if (!ctx.request) return api.get('/users/1').json()
      return runWithRequest(ctx.request, () =>
        api.get('/users/1', { headers: { cookie: ctx.request!.headers.get('cookie') ?? '' } }).json(),
      )
    }

    const result = (await loader({
      params: {},
      query: {},
      signal: new AbortController().signal,
      request: new Request(`${origin}/page`, { headers: { cookie: 'session=abc' } }),
    })) as { cookie: string }

    expect(result.cookie).toBe('session=abc')
  })

  it('tolerates ctx.request being undefined — the CSR path', async () => {
    // The documented mistake is assuming `request` is always there.
    const api = createHttp({ baseUrl: origin })

    const loader = async (ctx: LoaderContext): Promise<unknown> =>
      ctx.request
        ? runWithRequest(ctx.request, () => api.get('/users/1').json())
        : api.get('/users/1', { signal: ctx.signal }).json()

    const result = await loader({
      params: {},
      query: {},
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({ id: '1' })
  })
})
