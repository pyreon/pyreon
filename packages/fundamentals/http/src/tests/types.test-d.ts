/**
 * The TYPE contract, asserted.
 *
 * These are the guarantees the package sells as "strictly typed", and
 * every one of them has a way to silently degrade to `unknown` (or worse,
 * to something wrong that still compiles) under a small refactor. `tsc`
 * running over this file is the gate.
 *
 * The load-bearing case is ArkType: its schemas are CALLABLE, so a
 * `V extends ParseFn<infer T>` branch placed before the schema-brand check
 * infers `ArkErrors | Output` — the error type unioned into your data. That
 * type-checks. It looks strict. It is wrong.
 */

import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createHttp, type HttpClient } from '../client'
import type { Endpoint, PathParamNames, ResponseOf } from '../endpoint'
import { standardSchema } from '../schema'
import type {
  HttpMiddleware,
  ParseFn,
  StandardSchemaShape,
  ValidatorOutput,
} from '../types'

const api: HttpClient = createHttp({ baseUrl: '/api', schema: standardSchema })

describe('.json() inference', () => {
  it('infers the output of a zod schema', async () => {
    expectTypeOf(await api.get('/x').json(z.object({ id: z.string() }))).toEqualTypeOf<{
      id: string
    }>()
  })

  it('infers the output of a valibot schema', async () => {
    expectTypeOf(await api.get('/x').json(v.object({ id: v.string() }))).toEqualTypeOf<{
      id: string
    }>()
  })

  it('infers the OUTPUT of a callable ArkType schema, not ArkErrors | Output', async () => {
    expectTypeOf(await api.get('/x').json(type({ id: 'string' }))).toEqualTypeOf<{
      id: string
    }>()
  })

  it('infers a top-level array and a scalar', async () => {
    expectTypeOf(await api.get('/x').json(z.array(z.number()))).toEqualTypeOf<number[]>()
    expectTypeOf(await api.get('/x').json(z.string())).toEqualTypeOf<string>()
  })

  it('infers the return type of a plain parse function', async () => {
    expectTypeOf(
      await api.get('/x').json((raw: unknown): { id: number } => raw as { id: number }),
    ).toEqualTypeOf<{ id: number }>()
  })

  it('honours an explicit type argument, and is unknown with neither', async () => {
    expectTypeOf(await api.get('/x').json<{ a: 1 }>()).toEqualTypeOf<{ a: 1 }>()
    expectTypeOf(await api.get('/x').json()).toEqualTypeOf<unknown>()
  })

  it('reflects a COERCING schema — the output type, not the input', async () => {
    expectTypeOf(await api.get('/x').json(z.object({ n: z.coerce.number() }))).toEqualTypeOf<{
      n: number
    }>()
  })
})

describe('ValidatorOutput', () => {
  it('prefers the schema brand over the callable shape', () => {
    // A value that is BOTH callable and branded must resolve as a schema.
    type Both = ParseFn<'wrong'> & StandardSchemaShape<'right'>
    expectTypeOf<ValidatorOutput<Both>>().toEqualTypeOf<'right'>()
  })

  it('falls back to the function return for an unbranded callable', () => {
    expectTypeOf<ValidatorOutput<ParseFn<number>>>().toEqualTypeOf<number>()
  })

  it('is unknown for anything else', () => {
    expectTypeOf<ValidatorOutput<{ nope: true }>>().toEqualTypeOf<unknown>()
  })
})

describe('endpoint typing', () => {
  it('extracts path parameter names from the literal', () => {
    expectTypeOf<PathParamNames<'/users/:id'>>().toEqualTypeOf<'id'>()
    expectTypeOf<PathParamNames<'/u/:a/p/:b'>>().toEqualTypeOf<'a' | 'b'>()
    expectTypeOf<PathParamNames<'/u/:a/p/:b/x/:c'>>().toEqualTypeOf<'a' | 'b' | 'c'>()
    expectTypeOf<PathParamNames<'/users'>>().toEqualTypeOf<never>()
  })

  it('narrows method and path to the literals from the spec', () => {
    const getUser = api.endpoint('GET /users/:id')
    expectTypeOf(getUser.method).toEqualTypeOf<'GET'>()
    expectTypeOf(getUser.path).toEqualTypeOf<'/users/:id'>()
  })

  it('infers the response through the same schema-first ordering', async () => {
    const zodEp = api.endpoint('GET /users/:id', { response: z.object({ id: z.string() }) })
    expectTypeOf(await zodEp({ params: { id: '1' } })).toEqualTypeOf<{ id: string }>()

    const arkEp = api.endpoint('GET /users/:id', { response: type({ id: 'string' }) })
    expectTypeOf(await arkEp({ params: { id: '1' } })).toEqualTypeOf<{ id: string }>()

    const fnEp = api.endpoint('GET /users/:id', {
      response: (raw: unknown): { id: number } => raw as { id: number },
    })
    expectTypeOf(await fnEp({ params: { id: '1' } })).toEqualTypeOf<{ id: number }>()
  })

  it('is unknown when no response validator is declared', () => {
    expectTypeOf<ResponseOf<undefined>>().toEqualTypeOf<unknown>()
  })

  it('requires params exactly when the path declares them', () => {
    const getUser = api.endpoint('GET /users/:id')
    const listUsers = api.endpoint('GET /users')

    void getUser({ params: { id: '1' } })
    void listUsers()

    // @ts-expect-error — the argument is required when the path has params
    void getUser()
    // @ts-expect-error — `userId` is not a parameter of `/users/:id`
    void getUser({ params: { userId: '1' } })
    // @ts-expect-error — a path with no params accepts no `params`
    void listUsers({ params: { id: '1' } })
  })

  it('threads the response type into the query and mutation adapters', () => {
    const ep = api.endpoint('GET /users/:id', { response: z.object({ id: z.string() }) })

    expectTypeOf(ep.query({ params: { id: '1' } }).queryFn).returns.resolves.toEqualTypeOf<{
      id: string
    }>()
    expectTypeOf(ep.mutation().mutationFn).returns.resolves.toEqualTypeOf<{ id: string }>()
  })

  it('rejects a spec that is not "<METHOD> <path>"', () => {
    // @ts-expect-error — no method
    void api.endpoint('/users')
    // @ts-expect-error — not an HTTP method
    void api.endpoint('FETCH /users')
  })

  it('keeps Endpoint assignable to a widened alias', () => {
    const ep = api.endpoint('GET /users/:id', { response: z.object({ id: z.string() }) })
    expectTypeOf(ep).toExtend<Endpoint<'GET /users/:id', { id: string }>>()
  })
})

describe('client typing', () => {
  it('rejects an unknown config key', () => {
    // @ts-expect-error — `baseURL` is axios's spelling; ours is `baseUrl`
    void createHttp({ baseURL: '/api' })
  })

  it('rejects a middleware with the wrong shape', () => {
    // @ts-expect-error — middleware must return a Promise<HttpResponse>
    const bad: HttpMiddleware = () => 'nope'
    void bad
  })

  it('types extend() as returning a client', () => {
    expectTypeOf(api.extend({ baseUrl: '/v2' })).toEqualTypeOf<HttpClient>()
  })
})
