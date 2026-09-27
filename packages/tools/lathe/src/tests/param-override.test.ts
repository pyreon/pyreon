/**
 * An operation-level parameter overrides a path-level one with the same
 * `name` + `in` (audit A9). Both used to be kept.
 */
import { loadOpenApi } from '../input/openapi'
import { typecheckSpec } from './helpers/typecheck'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://a.test' }],
  paths: {
    '/items/{id}': {
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'string' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'limit', in: 'header', schema: { type: 'string' } },
      ],
      get: {
        operationId: 'getItem',
        parameters: [
          { name: 'limit', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'x', content: { 'application/json': { schema: { type: 'string' } } } } },
      },
    },
  },
})

describe('parameter override', () => {
  it('operation-level wins, keyed on name + in', () => {
    const op = loadOpenApi(SPEC).doc.operations[0]
    expect(op?.queryParams).toEqual([expect.objectContaining({ name: 'limit', required: true, type: { kind: 'number', integer: true } })])
    expect(op?.pathParams).toEqual([expect.objectContaining({ name: 'id', type: { kind: 'number', integer: true } })])
  })

  it('the generated hook typechecks', () => {
    const { errors } = typecheckSpec('a9', SPEC, { plugins: ['schemas', 'client', 'queries'] })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
