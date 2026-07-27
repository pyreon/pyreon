import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createHttp } from '../client'
import { defineEndpoint, type PathParamNames } from '../endpoint'
import { HttpError } from '../errors'
import { createMock } from '../mock'
import { standardSchema } from '../schema'
import { z } from 'zod'

const routes = [
  { path: '/users/1', json: { id: '1', name: 'Ada' } },
  { path: '/users', json: [{ id: '1', name: 'Ada' }] },
  { method: 'POST' as const, path: '/users', status: 201, json: { id: '2', name: 'Grace' } },
  { method: 'DELETE' as const, path: '/users/1', status: 204 },
  { path: '/boom', status: 500, json: {} },
]

function makeApi(): { api: ReturnType<typeof createHttp>; handle: ReturnType<typeof createMock> } {
  const handle = createMock(routes)
  const api = createHttp({ baseUrl: '/api', use: [handle.middleware], schema: standardSchema })
  return { api, handle }
}

describe('endpoint — calling', () => {
  it('resolves the path params and returns the decoded body', async () => {
    const { api, handle } = makeApi()
    const getUser = api.endpoint('GET /users/:id')

    expect(await getUser({ params: { id: '1' } })).toEqual({ id: '1', name: 'Ada' })
    expect(handle.calls[0]!.url).toBe('/api/users/1')
    expect(handle.calls[0]!.method).toBe('GET')
  })

  it('validates the response when one is declared', async () => {
    const { api } = makeApi()
    const getUser = api.endpoint('GET /users/:id', {
      response: z.object({ id: z.string(), name: z.string() }),
    })

    const user = await getUser({ params: { id: '1' } })
    expect(user).toEqual({ id: '1', name: 'Ada' })
  })

  it('carries a JSON body for a mutation', async () => {
    const { api, handle } = makeApi()
    const createUser = api.endpoint('POST /users')

    expect(await createUser({ json: { name: 'Grace' } })).toEqual({ id: '2', name: 'Grace' })
    expect(handle.calls[0]!.body).toBe('{"name":"Grace"}')
  })

  it('handles a 204 endpoint', async () => {
    const { api } = makeApi()
    const removeUser = api.endpoint('DELETE /users/:id')
    expect(await removeUser({ params: { id: '1' } })).toBeUndefined()
  })

  it('propagates an HttpError', async () => {
    const { api } = makeApi()
    await expect(api.endpoint('GET /boom')()).rejects.toBeInstanceOf(HttpError)
  })

  it('throws a clear error for a malformed spec', () => {
    const { api } = makeApi()
    expect(() => api.endpoint('GET' as never)).toThrow(/must be "<METHOD> <path>"/)
    expect(() => api.endpoint('GET  ' as never)).toThrow(/missing a path/)
  })

  it('works via the standalone defineEndpoint too', async () => {
    const { api } = makeApi()
    const getUser = defineEndpoint(api, 'GET /users/:id')
    expect(await getUser({ params: { id: '1' } })).toEqual({ id: '1', name: 'Ada' })
  })
})

describe('endpoint — cache keys', () => {
  it('derives a stable key that cannot drift from the URL', () => {
    const { api } = makeApi()
    const getUser = api.endpoint('GET /users/:id')

    expect(getUser.key({ params: { id: '1' } })).toEqual([
      'GET',
      '/users/:id',
      { params: { id: '1' } },
    ])
    expect(getUser.key.prefix).toEqual(['GET', '/users/:id'])
  })

  it('collapses to the prefix when there is nothing to scope by', () => {
    const { api } = makeApi()
    const listUsers = api.endpoint('GET /users')

    expect(listUsers.key()).toEqual(['GET', '/users'])
    expect(listUsers.key()).toEqual(listUsers.key.prefix)
  })

  it('includes query params in the key', () => {
    const { api } = makeApi()
    const listUsers = api.endpoint('GET /users')
    expect(listUsers.key({ query: { page: 2 } })).toEqual([
      'GET',
      '/users',
      { query: { page: 2 } },
    ])
  })

  it('exposes method and path for tooling', () => {
    const { api } = makeApi()
    const getUser = api.endpoint('GET /users/:id')
    expect(getUser.method).toBe('GET')
    expect(getUser.path).toBe('/users/:id')
  })
})

describe('endpoint — query adapter', () => {
  it('emits queryKey + queryFn and FORWARDS the AbortSignal', async () => {
    const { api, handle } = makeApi()
    const getUser = api.endpoint('GET /users/:id')

    const options = getUser.query({ params: { id: '1' } })
    expect(options.queryKey).toEqual(['GET', '/users/:id', { params: { id: '1' } }])

    const controller = new AbortController()
    await options.queryFn({ signal: controller.signal })

    // Forwarding the signal is the whole point — `@pyreon/feature`'s
    // hand-rolled client drops it, so TanStack cancellation is dead there.
    expect(handle.calls).toHaveLength(1)
  })

  it('actually cancels through the forwarded signal', async () => {
    const handle = createMock([{ path: '/slow', delay: 200, json: {} }])
    const api = createHttp({ use: [handle.middleware] })
    const slow = api.endpoint('GET /slow')

    const controller = new AbortController()
    const promise = slow.query().queryFn({ signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toThrow(/aborted/)
  })
})

describe('endpoint — mutation adapter', () => {
  it('emits a mutationFn that takes the variables', async () => {
    const { api } = makeApi()
    const createUser = api.endpoint('POST /users')

    const options = createUser.mutation()
    expect(await options.mutationFn({ json: { name: 'Grace' } })).toEqual({
      id: '2',
      name: 'Grace',
    })
  })

  it('maps invalidation targets to the ENDPOINT prefix, not a stringly key', () => {
    const { api } = makeApi()
    const listUsers = api.endpoint('GET /users')
    const createUser = api.endpoint('POST /users')

    expect(createUser.mutation({ invalidates: [listUsers] }).invalidates).toEqual([
      ['GET', '/users'],
    ])
  })

  it('omits invalidates when none are declared', () => {
    const { api } = makeApi()
    expect(api.endpoint('POST /users').mutation().invalidates).toBeUndefined()
  })
})

describe('endpoint — types', () => {
  it('extracts path parameter names from the literal', () => {
    expectTypeOf<PathParamNames<'/users/:id'>>().toEqualTypeOf<'id'>()
    expectTypeOf<PathParamNames<'/u/:a/p/:b'>>().toEqualTypeOf<'a' | 'b'>()
    expectTypeOf<PathParamNames<'/users'>>().toEqualTypeOf<never>()
  })

  it('infers the response type from a schema', async () => {
    const { api } = makeApi()
    const getUser = api.endpoint('GET /users/:id', {
      response: z.object({ id: z.string(), name: z.string() }),
    })
    const user = await getUser({ params: { id: '1' } })
    expectTypeOf(user).toEqualTypeOf<{ id: string; name: string }>()
  })

  it('infers the response type from a plain parse function', async () => {
    const { api } = makeApi()
    const getUser = api.endpoint('GET /users/:id', {
      response: (raw: unknown): { id: string } => raw as { id: string },
    })
    expectTypeOf(await getUser({ params: { id: '1' } })).toEqualTypeOf<{ id: string }>()
  })

  it('rejects a mistyped param name at compile time', () => {
    // NEVER INVOKED. The assertion here is `tsc`, not the runtime — and
    // actually calling these would fire real requests nobody awaits: the
    // mistyped one rejects (no `id` to substitute), producing an unhandled
    // rejection that vitest fails the whole run on. A type test must not
    // execute the thing it is typing.
    const typeOnly = (): void => {
      const { api } = makeApi()
      const getUser = api.endpoint('GET /users/:id')
      // @ts-expect-error — `userId` is not a parameter of `/users/:id`
      void getUser({ params: { userId: '1' } })
      // A path with no params needs no argument at all.
      void api.endpoint('GET /users')()
    }

    expect(typeof typeOnly).toBe('function')
  })
})

describe('endpoint — runtime guards', () => {
  it('refuses to build a URL with a missing param instead of sending ":id"', async () => {
    const { api } = makeApi()
    const getUser = api.endpoint('GET /users/:id')
    await expect(getUser({ params: {} } as never)).rejects.toThrow(/needs the parameter "id"/)
  })

  it('lets per-call options override the endpoint declaration', async () => {
    const handle = createMock([{ path: '/slow', delay: 100, json: {} }])
    const api = createHttp({ use: [handle.middleware] })
    const slow = api.endpoint('GET /slow', { timeout: 5000 })
    await expect(slow({ timeout: 5 })).rejects.toThrow(/timed out/)
  })

  it('applies endpoint-level headers', async () => {
    const handle = createMock([{ path: '/users', json: [] }])
    const api = createHttp({ use: [handle.middleware] })
    const list = api.endpoint('GET /users', { headers: { 'x-scope': 'endpoint' } })
    await list()
    expect(handle.calls[0]!.headers['x-scope']).toBe('endpoint')
  })

  it('records calls through the mock for assertions', async () => {
    const { api, handle } = makeApi()
    await api.endpoint('GET /users')()
    expect(handle.calls).toHaveLength(1)
    handle.reset()
    expect(handle.calls).toHaveLength(0)
  })
})

describe('mock', () => {
  it('falls through to the next layer when nothing matches', async () => {
    const inner = vi.fn(createMock([{ path: '/b', json: { from: 'inner' } }]).middleware)
    const api = createHttp({ use: [createMock([{ path: '/a', json: { from: 'outer' } }]).middleware, inner] })

    expect(await api.get('/a').json()).toEqual({ from: 'outer' })
    expect(await api.get('/b').json()).toEqual({ from: 'inner' })
  })

  it('matches a RegExp path', async () => {
    const api = createHttp({ use: [createMock([{ path: /\/users\/\d+$/, json: { ok: 1 } }]).middleware] })
    expect(await api.get('/users/42').json()).toEqual({ ok: 1 })
  })

  it('can reject with a chosen error', async () => {
    const api = createHttp({
      use: [createMock([{ path: '/x', error: new Error('simulated outage') }]).middleware],
    })
    await expect(api.get('/x')).rejects.toThrow('simulated outage')
  })

  it('defaults to 204 when a route declares no body', async () => {
    const api = createHttp({ use: [createMock([{ path: '/x' }]).middleware] })
    expect((await api.get('/x')).status).toBe(204)
  })

  it('records the request method, url, headers and body', async () => {
    const handle = createMock([{ method: 'POST', path: '/x', json: {} }])
    const api = createHttp({ use: [handle.middleware] })
    await api.post('/x', { json: { a: 1 }, headers: { 'x-t': 'v' } })

    const call = handle.calls[0]!
    expect(call.method).toBe('POST')
    expect(call.url).toBe('/x')
    expect(call.headers['x-t']).toBe('v')
    expect(call.body).toBe('{"a":1}')
  })
})
