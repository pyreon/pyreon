/**
 * Typed error responses: 4xx / 5xx / range / `default` bodies reach the IR, the
 * endpoint declaration (`errors: { … }`), and the hooks' `error` type.
 *
 * They used to be dropped with an `error-responses` note on every spec that
 * had them -- a failed call rejected with an error whose body was `unknown`,
 * however precisely the spec described it. The runtime half (validated body,
 * `matched` key) is proven against the REAL generated `@pyreon/http` client
 * here; the three adapter clients are proven in `adapter-runtime.test.ts`, and
 * the types compile under strict TypeScript in `generated-typecheck.test.ts`.
 */
import type { HttpRequest, HttpResponse } from '@pyreon/http'
import { loadOpenApi } from '../input/openapi'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const json = (schema: unknown) => ({ description: 'x', content: { 'application/json': { schema } } })
const PROBLEM = { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/pets/{id}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: json({ $ref: '#/components/schemas/Pet' }),
          default: json({ type: 'object', required: ['code'], properties: { code: { type: 'integer' } } }),
          '5XX': json({ $ref: '#/components/schemas/Problem' }),
          404: json({ $ref: '#/components/schemas/Problem' }),
          410: { description: 'gone' },
          418: { description: 'html', content: { 'text/html': { schema: { type: 'string' } } } },
        },
      },
      delete: {
        operationId: 'deletePet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'gone' }, 409: json({ $ref: '#/components/schemas/Problem' }) },
      },
    },
    '/plain': { get: { operationId: 'plain', responses: { 200: json({ type: 'string' }) } } },
  },
  components: {
    schemas: {
      Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      Problem: PROBLEM,
    },
  },
})

afterAll(() => cleanEmitted('typed-errors'))

describe('the IR carries typed error responses', () => {
  const doc = loadOpenApi(SPEC).doc
  const getPet = doc.operations.find((o) => o.id === 'getPet')

  it('in the order a client matches them: exact codes, ranges, `default`', () => {
    expect(getPet?.errors?.map((e) => e.status)).toEqual(['404', '5XX', 'default'])
    expect(getPet?.errors?.[0]?.type).toEqual({ kind: 'ref', name: 'Problem' })
  })

  it('reports only the error bodies it cannot type (not JSON), and skips body-less ones', () => {
    const notes = doc.notes.filter((n) => n.code === 'error-responses')
    expect(notes).toHaveLength(1)
    expect(notes[0]?.message).toContain('`418`')
    expect(notes[0]?.message).not.toContain('`410`')
  })

  it('a `default` read as the SUCCESS response is not repeated as an error', () => {
    const only = loadOpenApi(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: { '/x': { get: { operationId: 'x', responses: { default: json({ type: 'string' }) } } } },
      }),
    ).doc.operations[0]
    expect(only?.response).toEqual({ kind: 'string' })
    expect(only?.errors).toBeUndefined()
  })
})

describe('the generated client', () => {
  const e = emitToDisk('typed-errors', SPEC, { plugins: ['schemas', 'client', 'queries'] })

  it('declares the schemas on the endpoint and types the hooks with them', () => {
    const endpoints = e.layer('endpoints')
    expect(endpoints).toContain("errors: { 404: Problem, '5XX': Problem, default: getPet$errorDefault }")
    const queries = e.layer('queries')
    expect(queries).toContain('useQuery<Awaited<ReturnType<typeof getPet>>, EndpointError<typeof getPet>, TData>')
    expect(queries).toContain('MutationOptions<Awaited<ReturnType<typeof deletePet>>, EndpointError<typeof deletePet>,')
    // An operation that declares no error bodies keeps `Error`.
    expect(queries).toContain('useQuery<Awaited<ReturnType<typeof plain>>, Error, TData>')
  })

  const respond = (status: number, body: unknown) => (req: HttpRequest): Promise<HttpResponse> =>
    Promise.resolve({
      raw: new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
      status,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      request: req,
    })

  it('rejects with the validated body and the key it matched', async () => {
    const client = await e.load<{ setDevTransport(m: unknown): void }>('client.ts')
    const eps = await e.load<Record<string, (a: unknown) => Promise<unknown>>>('endpoints/index.ts')
    const call = async (status: number, body: unknown): Promise<{ status: number; matched: unknown; body: unknown }> => {
      client.setDevTransport(respond(status, body))
      try {
        await eps.getPet?.({ params: { id: '1' } })
      } catch (err) {
        return err as { status: number; matched: unknown; body: unknown }
      } finally {
        client.setDevTransport(null)
      }
      throw new Error('expected a rejection')
    }
    expect(await call(404, { message: 'no pet' })).toMatchObject({ matched: '404', body: { message: 'no pet' } })
    expect(await call(503, { message: 'down' })).toMatchObject({ matched: '5XX', status: 503 })
    expect(await call(400, { code: 3 })).toMatchObject({ matched: 'default', body: { code: 3 } })
    // Fails its schema: still the HTTP failure, unmatched, raw body kept.
    expect(await call(404, { oops: 1 })).toMatchObject({ status: 404, matched: undefined, body: { oops: 1 } })
  })
})
