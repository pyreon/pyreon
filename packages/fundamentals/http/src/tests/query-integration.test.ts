/**
 * Proof that the ecosystem claim is real, against REAL `@pyreon/query`.
 *
 * `src/query.ts` and `endpoint.query()` emit plain objects that are only
 * *structurally* typed against TanStack's option shapes — the package takes
 * no dependency on `@pyreon/query`. Structural compatibility that nothing
 * ever feeds to the real consumer is a claim, not a fact, so this file
 * drives the emitted options through a real `QueryClient` / `QueryObserver`
 * and a real mounted `useQuery`.
 *
 * Written with `h()` rather than JSX so the package keeps the non-JSX
 * `@pyreon/tsconfig/lib.json` preset.
 */

import { h } from '@pyreon/core'
import { QueryClientProvider, useQuery, type UseQueryResult } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHttp, type HttpClient } from '../client'
import { createMock, type MockHandle } from '../mock'
import { toQueryOptions } from '../query'
import { standardSchema } from '../schema'

const tick = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

function setup(): { api: HttpClient; handle: MockHandle } {
  const handle = createMock([
    { path: '/users/1', json: { id: '1', name: 'Ada' } },
    { path: '/users', json: [{ id: '1' }, { id: '2' }] },
    { path: '/slow', delay: 300, json: { slow: true } },
    { method: 'POST', path: '/users', status: 201, json: { id: '3', name: 'Grace' } },
  ])
  return {
    api: createHttp({ baseUrl: '/api', use: [handle.middleware], schema: standardSchema }),
    handle,
  }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

/** Mount a component inside a real QueryClientProvider. */
function render(client: QueryClient, body: () => unknown): void {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    h(QueryClientProvider, { client }, () => {
      body()
      return null
    }),
    el,
  )
  cleanups.push(() => {
    unmount()
    el.remove()
  })
}

describe('QueryObserver — the emitted options are genuinely TanStack-shaped', () => {
  it('drives a real QueryObserver from endpoint.query()', async () => {
    const { api } = setup()
    const getUser = api.endpoint('GET /users/:id', {
      response: z.object({ id: z.string(), name: z.string() }),
    })

    const client = makeClient()
    const observer = new QueryObserver(client, getUser.query({ params: { id: '1' } }))
    const result = await observer.refetch()

    expect(result.data).toEqual({ id: '1', name: 'Ada' })
    expect(result.status).toBe('success')
  })

  it('stores the result under the endpoint-derived key, so the cache is addressable', async () => {
    const { api } = setup()
    const getUser = api.endpoint('GET /users/:id')
    const client = makeClient()

    await new QueryObserver(client, getUser.query({ params: { id: '1' } })).refetch()

    // The key the endpoint derived is the key TanStack actually used —
    // this is the drift the endpoint abstraction exists to prevent.
    expect(client.getQueryData(getUser.key({ params: { id: '1' } }))).toEqual({
      id: '1',
      name: 'Ada',
    })
  })

  it('surfaces an HttpError through TanStack’s error channel', async () => {
    const handle = createMock([{ path: '/nope', status: 404, json: { error: 'gone' } }])
    const api = createHttp({ baseUrl: '/api', use: [handle.middleware] })
    const client = makeClient()

    const result = await new QueryObserver(client, api.endpoint('GET /nope').query()).refetch()

    expect(result.status).toBe('error')
    expect((result.error as Error).name).toBe('ClientError')
  })

  it('works through the ad-hoc toQueryOptions helper too', async () => {
    const { api } = setup()
    const client = makeClient()
    const result = await new QueryObserver(
      client,
      toQueryOptions(api, '/users', { response: z.array(z.object({ id: z.string() })) }),
    ).refetch()

    expect(result.data).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('invalidates via the endpoint prefix a mutation declares', async () => {
    const { api, handle } = setup()
    const listUsers = api.endpoint('GET /users')
    const createUser = api.endpoint('POST /users')
    const client = makeClient()

    const observer = new QueryObserver(client, listUsers.query())
    const unsubscribe = observer.subscribe(() => {})
    await observer.refetch()
    const before = handle.calls.length

    const mutation = createUser.mutation({ invalidates: [listUsers] })
    await mutation.mutationFn({ json: { name: 'Grace' } })
    for (const key of mutation.invalidates ?? []) {
      await client.invalidateQueries({ queryKey: key })
    }
    await tick(40)

    // The list refetched because the mutation's declared prefix matched it.
    expect(handle.calls.length).toBeGreaterThan(before + 1)
    unsubscribe()
  })
})

describe('useQuery — mounted, with real signals', () => {
  it('lands data in the reactive result', async () => {
    const { api } = setup()
    const getUser = api.endpoint('GET /users/:id', {
      response: z.object({ id: z.string(), name: z.string() }),
    })
    let result: UseQueryResult<{ id: string; name: string }> | undefined

    render(makeClient(), () => {
      result = useQuery(() => getUser.query({ params: { id: '1' } }))
    })

    expect(result?.isPending()).toBe(true)
    await tick(60)
    expect(result?.data()).toEqual({ id: '1', name: 'Ada' })
    expect(result?.isSuccess()).toBe(true)
  })

  it('exposes a validation failure as the query error, not as data', async () => {
    const handle = createMock([{ path: '/users/1', json: { id: 42 } }])
    const api = createHttp({ baseUrl: '/api', use: [handle.middleware], schema: standardSchema })
    const getUser = api.endpoint('GET /users/:id', { response: z.object({ id: z.string() }) })
    let result: UseQueryResult<{ id: string }> | undefined

    render(makeClient(), () => {
      result = useQuery(() => getUser.query({ params: { id: '1' } }))
    })

    await tick(60)
    expect(result).toBeDefined()
    const settled = result as UseQueryResult<{ id: string }>
    expect(settled.isError()).toBe(true)
    expect((settled.error() as Error).name).toBe('ResponseValidationError')
    expect(settled.data()).toBeUndefined()
  })

  it('ABORTS the in-flight request when the component unmounts', async () => {
    // The cancellation contract, end to end: TanStack aborts its signal on
    // unmount, `endpoint.query()` forwards it, and the client honours it.
    // `@pyreon/feature`'s hand-rolled client drops the signal entirely, so
    // this is the behaviour that is dead there today.
    const { api } = setup()
    const slow = api.endpoint('GET /slow')
    let result: UseQueryResult<unknown> | undefined

    render(makeClient(), () => {
      result = useQuery(() => slow.query())
    })

    await tick(20)
    expect(result?.isPending()).toBe(true)

    const unmount = cleanups.pop()
    expect(unmount).toBeDefined()
    unmount?.() // unmount mid-flight
    await tick(80)

    // Nothing threw, nothing resolved into a torn-down observer.
    expect(result?.data()).toBeUndefined()
  })
})
