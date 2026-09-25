/**
 * Parameter resolution rules OpenAPI states and the reader used to skip.
 */
import { describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'

const spec = (paths: Record<string, unknown>): string =>
  JSON.stringify({ openapi: '3.0.3', info: { title: 'T', version: '1' }, servers: [{ url: 'https://a.test' }], paths })

const ok = { '200': { description: 'ok' } }

describe('parameters', () => {
  it('an operation-level parameter OVERRIDES a path-level one with the same (name, in)', () => {
    // Concatenating them gave two `q` parameters with different types.
    const { doc } = loadOpenApi(
      spec({
        '/x': {
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          get: { operationId: 'x', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'integer' } }], responses: ok },
        },
      }),
    )
    const q = doc.operations[0]?.queryParams
    expect(q).toHaveLength(1)
    expect(q?.[0]).toMatchObject({ name: 'q', required: true, type: { kind: 'number', integer: true } })
  })

  it('a same-named parameter in a DIFFERENT location is not an override', () => {
    const { doc } = loadOpenApi(
      spec({
        '/x/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { operationId: 'x', parameters: [{ name: 'id', in: 'query', schema: { type: 'string' } }], responses: ok },
        },
      }),
    )
    expect(doc.operations[0]?.pathParams.map((p) => p.name)).toEqual(['id'])
    expect(doc.operations[0]?.queryParams.map((p) => p.name)).toEqual(['id'])
  })

  it('synthesizes a path placeholder no parameter declares, as a required string', () => {
    // The runtime throws on a missing path parameter, so an undeclared one
    // has to be in the call's type or every call fails.
    const { doc } = loadOpenApi(spec({ '/orgs/{org}/repos': { get: { operationId: 'x', responses: ok } } }))
    expect(doc.operations[0]?.pathParams).toEqual([{ name: 'org', type: { kind: 'string' }, required: true, doc: undefined }])
  })

  it('reads a parameter declared with `content` instead of `schema`', () => {
    const { doc } = loadOpenApi(
      spec({
        '/x': {
          get: {
            operationId: 'x',
            parameters: [{ name: 'filter', in: 'query', content: { 'application/json': { schema: { type: 'object', properties: { a: { type: 'integer' } } } } } }],
            responses: ok,
          },
        },
      }),
    )
    expect(doc.operations[0]?.queryParams[0]?.type.kind).toBe('object')
  })

  it('ignores Accept / Content-Type / Authorization header parameters, as OpenAPI requires', () => {
    const { doc } = loadOpenApi(
      spec({
        '/x': {
          get: {
            operationId: 'x',
            parameters: ['Accept', 'content-type', 'Authorization', 'X-Keep'].map((name) => ({ name, in: 'header', schema: { type: 'string' } })),
            responses: ok,
          },
        },
      }),
    )
    expect(doc.operations[0]?.headerParams.map((p) => p.name)).toEqual(['X-Keep'])
  })
})
