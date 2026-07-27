import { describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { createMock } from '../mock'
import { toQueryOptions } from '../query'
import { standardSchema } from '../schema'
import { z } from 'zod'

function setup(): {
  api: ReturnType<typeof createHttp>
  handle: ReturnType<typeof createMock>
} {
  const handle = createMock([
    { path: '/users/1', json: { id: '1' } },
    { path: '/users', json: [{ id: '1' }] },
    { path: '/slow', delay: 200, json: {} },
  ])
  return {
    api: createHttp({ baseUrl: '/api', use: [handle.middleware], schema: standardSchema }),
    handle,
  }
}

describe('toQueryOptions', () => {
  it('derives a key from the path and fetches through the client', async () => {
    const { api, handle } = setup()
    const options = toQueryOptions(api, '/users')

    expect(options.queryKey).toEqual(['GET', '/users'])
    expect(await options.queryFn({ signal: new AbortController().signal })).toEqual([{ id: '1' }])
    expect(handle.calls[0]!.url).toBe('/api/users')
  })

  it('scopes the key by params and query', () => {
    const { api } = setup()
    expect(
      toQueryOptions(api, '/users/:id', { params: { id: '1' }, query: { full: true } }).queryKey,
    ).toEqual(['GET', '/users/:id', { params: { id: '1' }, query: { full: true } }])
  })

  it('accepts an explicit key override', () => {
    const { api } = setup()
    expect(toQueryOptions(api, '/users', { queryKey: ['users', 'all'] }).queryKey).toEqual([
      'users',
      'all',
    ])
  })

  it('validates the response when a schema is given', async () => {
    const { api } = setup()
    const options = toQueryOptions(api, '/users/1', { response: z.object({ id: z.string() }) })
    expect(await options.queryFn({ signal: new AbortController().signal })).toEqual({ id: '1' })
  })

  it('FORWARDS the signal so TanStack cancellation actually cancels', async () => {
    const { api } = setup()
    const controller = new AbortController()
    const promise = toQueryOptions(api, '/slow').queryFn({ signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow(/aborted/)
  })

  it('emits a plain object — no dependency on @pyreon/query is needed', () => {
    const { api } = setup()
    const options = toQueryOptions(api, '/users')
    expect(Object.keys(options).sort()).toEqual(['queryFn', 'queryKey'])
    expect(typeof options.queryFn).toBe('function')
  })
})
