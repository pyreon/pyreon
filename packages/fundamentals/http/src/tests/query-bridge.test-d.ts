/**
 * The endpoint → `@pyreon/query` bridges, typechecked against the REAL query
 * hooks under the package's compiler options (`@pyreon/typescript`'s preset:
 * `strict` + `exactOptionalPropertyTypes`).
 *
 * The bridges emit plain objects that are only STRUCTURALLY typed against
 * query's option shapes (http takes no dependency on query). Structural
 * compatibility that nothing typechecks against the real consumer is a
 * claim: `useMutation(endpoint.mutation({ invalidates }))` — the headline
 * example in the http docs — failed under `exactOptionalPropertyTypes`
 * because the bridge's `invalidates?: … | undefined` did not fit query's
 * `invalidates?: QueryKey[]` (#4310). Every documented shape is asserted
 * here, so `tsc --noEmit` over this file is the gate.
 */

import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useSuspenseQuery,
} from '@pyreon/query'
import { QueryClient } from '@tanstack/query-core'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createHttp } from '../client'
import { toQueryOptions } from '../query'
import { standardSchema } from '../schema'

const api = createHttp({ baseUrl: '/api', schema: standardSchema })
const listTodos = api.endpoint('GET /todos', {
  response: z.array(z.object({ id: z.string(), title: z.string() })),
})
const getTodo = api.endpoint('GET /todos/:id', {
  response: z.object({ id: z.string(), title: z.string() }),
})
const addTodo = api.endpoint('POST /todos', {
  response: z.object({ id: z.string(), title: z.string() }),
})

describe('endpoint.mutation() → useMutation', () => {
  it('accepts the documented invalidates form', () => {
    const add = useMutation(addTodo.mutation({ invalidates: [listTodos] }))
    expectTypeOf(add.data()).toEqualTypeOf<{ id: string; title: string } | undefined>()
  })

  it('accepts a mutation with no options and with an empty invalidates list', () => {
    useMutation(addTodo.mutation())
    useMutation(addTodo.mutation({}))
    useMutation(addTodo.mutation({ invalidates: [] }))
  })

  it('goes through mutationOptions() too', () => {
    const opts = mutationOptions(addTodo.mutation({ invalidates: [listTodos, getTodo] }))
    useMutation(opts)
  })

  it('accepts an explicitly-undefined invalidates on a hand-written options object', () => {
    const maybe: unknown[][] | undefined = undefined
    useMutation({ mutationFn: (v: { title: string }) => addTodo({ json: v }), invalidates: maybe })
  })
})

describe('endpoint.query() → query hooks', () => {
  it('useQuery / useSuspenseQuery infer the response', () => {
    const q = useQuery(() => getTodo.query({ params: { id: '1' } }))
    expectTypeOf(q.data()).toEqualTypeOf<{ id: string; title: string } | undefined>()
    useSuspenseQuery(() => listTodos.query())
  })

  it('queryOptions() / useQueries / the QueryClient API', () => {
    const opts = queryOptions(getTodo.query({ params: { id: '1' } }))
    useQuery(() => opts)
    useQueries(() => [listTodos.query(), getTodo.query({ params: { id: '2' } })])
    const client = new QueryClient()
    void client.invalidateQueries({ queryKey: listTodos.key.prefix })
    void client.prefetchQuery(listTodos.query())
  })

  it('toQueryOptions() (the ad-hoc escape hatch)', () => {
    useQuery(() => toQueryOptions<{ ok: boolean }>(api, '/health'))
  })
})
