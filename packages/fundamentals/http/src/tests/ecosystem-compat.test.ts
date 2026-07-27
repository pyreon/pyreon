/**
 * @vitest-environment node
 *
 * Compatibility with the rest of the framework, PROVEN rather than assumed.
 *
 * Two of these were broken when the file was written, both against Pyreon's
 * OWN packages rather than the third-party libraries the package advertises:
 *
 * - `@pyreon/validation`'s TYPED ADAPTERS (`zodSchema(...)`) carry `_infer`
 *   + `parse` and NO `~standard`, so a Standard-Schema-only resolver
 *   rejected them outright — `.json(zodSchema(X))` threw "no schema
 *   resolver is configured" against the framework's own Tier-A.1 convention.
 * - `@pyreon/validate`'s `s` omits the optional `~standard.types` phantom,
 *   so it validated correctly at runtime but typed as `unknown`.
 *
 * Both were found by asking "does this actually work with our packages?"
 * and testing, not by reading the code.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { s } from '@pyreon/validate'
import { arktypeSchema, valibotSchema, zodSchema } from '@pyreon/validation'
import { createApiMiddleware, type ApiRouteEntry } from '@pyreon/zero/api-routes'
import { type } from 'arktype'
import * as v from 'valibot'
import { createHttp, type HttpClient } from '../client'
import { mock } from '../mock'
import { standardSchema } from '../schema'
import { runWithRequest } from '../server'

let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: '1', name: 'Ada' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

const api = (): HttpClient =>
  createHttp({
    use: [
      mock([
        { path: '/good', json: { id: '1', name: 'Ada' } },
        { path: '/bad', json: { id: 42, name: 'Ada' } },
      ]),
    ],
    schema: standardSchema,
  })

describe('@pyreon/validation — TYPED ADAPTERS (tier A.1)', () => {
  it('accepts a zodSchema() adapter and infers through _infer', async () => {
    const adapter = zodSchema(z.object({ id: z.string(), name: z.string() }))
    const user = await api().get('/good').json(adapter)

    expectTypeOf(user).toEqualTypeOf<{ id: string; name: string }>()
    expect(user).toEqual({ id: '1', name: 'Ada' })
  })

  it('REJECTS an invalid body through the adapter', async () => {
    const adapter = zodSchema(z.object({ id: z.string() }))
    const error = await api().get('/bad').json(adapter).catch((e: unknown) => e)
    expect((error as Error).name).toBe('ResponseValidationError')
  })

  it('works for the valibot and arktype adapters too', async () => {
    // `valibotSchema` takes the sync safeParse as a SECOND argument —
    // omitting it yields an adapter whose `parse` dies with
    // `runParse is not a function`.
    const vAdapter = valibotSchema(v.object({ id: v.string() }), v.safeParse)
    const aAdapter = arktypeSchema(type({ id: 'string' }))

    expect(await api().get('/good').json(vAdapter)).toMatchObject({ id: '1' })
    expect(await api().get('/good').json(aAdapter)).toMatchObject({ id: '1' })

    await expect(api().get('/bad').json(vAdapter)).rejects.toThrow()
    await expect(api().get('/bad').json(aAdapter)).rejects.toThrow()
  })
})

describe("@pyreon/validate — the framework's own `s` runtime", () => {
  it('validates AND infers, despite omitting the ~standard.types phantom', async () => {
    const Schema = s.object({ id: s.string(), name: s.string() })
    const user = await api().get('/good').json(Schema)

    // Recovered from the `validate` return, not from `types.output`.
    expectTypeOf(user).toEqualTypeOf<{ id: string; name: string }>()
    expect(user).toEqual({ id: '1', name: 'Ada' })
  })

  it('REJECTS an invalid body', async () => {
    const Schema = s.object({ id: s.string() })
    const error = await api().get('/bad').json(Schema).catch((e: unknown) => e)
    expect((error as Error).name).toBe('ResponseValidationError')
  })

  it('drives an endpoint declaration', async () => {
    const client = api()
    const getUser = client.endpoint('GET /good', { response: s.object({ id: s.string() }) })
    const user = await getUser()
    expectTypeOf(user).toEqualTypeOf<{ id: string }>()
    expect(user.id).toBe('1')
  })
})

describe('@pyreon/zero — api routes', () => {
  it('round-trips through a real zero API route handler', async () => {
    // zero's `ApiHandler` is `(ctx) => Response`, and the client speaks the
    // same WHATWG primitives — so a route can be driven directly, with no
    // adapter in between.
    const routes: ApiRouteEntry[] = [
      {
        pattern: '/api/users/:id',
        module: {
          GET: (ctx) => Response.json({ id: ctx.params.id, name: 'Ada' }),
          POST: async (ctx) => {
            const body = (await ctx.request.json()) as { name: string }
            return Response.json({ id: '9', name: body.name }, { status: 201 })
          },
        },
      },
    ]
    const middleware = createApiMiddleware(routes)

    const client = createHttp({
      baseUrl: 'http://app.test/api',
      schema: standardSchema,
      // Dispatch straight into zero's api middleware — the in-process
      // transport shape, with no socket.
      transport: async (request) => {
        const url = new URL(request.url)
        const response = await middleware({
          req: new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
          }),
          url,
          path: url.pathname,
          headers: new Headers(),
          locals: {},
        })
        if (!response) throw new Error('no route matched')
        return {
          raw: response,
          status: response.status,
          ok: response.ok,
          headers: response.headers,
          request,
        }
      },
    })

    const getUser = client.endpoint('GET /users/:id', {
      response: z.object({ id: z.string(), name: z.string() }),
    })
    expect(await getUser({ params: { id: '7' } })).toEqual({ id: '7', name: 'Ada' })

    const created = await client.post('/users/:id', { params: { id: 'new' }, json: { name: 'Grace' } }).json()
    expect(created).toEqual({ id: '9', name: 'Grace' })
  })

  it('accepts a real WHATWG Request in runWithRequest — zero ctx.req shape', async () => {
    const request = new Request(`${origin}/page`, {
      headers: { cookie: 'session=abc' },
    })

    const client = createHttp({ baseUrl: '/' })
    // A relative path resolves against the real inbound request's origin.
    const result = await runWithRequest(request, () => client.get('/whoami').json())

    expect(result).toEqual({ id: '1', name: 'Ada' })
  })
})

describe('@pyreon/form — submit transport', () => {
  it('posts form values and validates the response', async () => {
    // `@pyreon/form`'s `onSubmit` is a plain async function of the values,
    // so the client drops in with no adapter.
    const handle = mock([{ method: 'POST', path: '/users', status: 201, json: { id: '1' } }])
    const client = createHttp({ baseUrl: '/api', use: [handle], schema: standardSchema })
    const createUser = client.endpoint('POST /users', { response: z.object({ id: z.string() }) })

    const onSubmit = async (values: { name: string }): Promise<{ id: string }> =>
      createUser({ json: values })

    expect(await onSubmit({ name: 'Ada' })).toEqual({ id: '1' })
  })

  it('exposes a field-level error record from a 422 for setErrors', async () => {
    const client = createHttp({
      baseUrl: '/api',
      use: [mock([{ method: 'POST', path: '/users', status: 422, json: { errors: { name: 'taken' } } }])],
    })

    const error = await client.post('/users', { json: {} }).catch((e: unknown) => e)
    const body = (await (error as { response: { raw: Response } }).response.raw.json()) as {
      errors: Record<string, string>
    }

    // The shape `form.setErrors(...)` consumes.
    expect(body.errors).toEqual({ name: 'taken' })
  })
})
