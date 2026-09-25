/**
 * Operation ids and model names that collide with what the EMITTERS bind
 * (audit A14) — `api`, the validator binding, `keys`, a hook named `useQuery`,
 * a model named `Record` / `Infer` / `Schema` / `Partial`.
 */
import { modelIdent, operationIdent } from '../core/naming'
import { typecheckSpec } from './helpers/typecheck'

const ok = { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Record' } } } } }
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://a.test' }],
  paths: {
    '/a': { get: { operationId: 'api', responses: ok } },
    '/b': { get: { operationId: 's', responses: ok } },
    '/c': { get: { operationId: 'z', responses: ok } },
    '/d': { get: { operationId: 'keys', responses: ok } },
    '/e': { get: { operationId: 'query', responses: ok } },
    '/f': { post: { operationId: 'mutation', responses: ok } },
  },
  components: {
    schemas: {
      Record: { type: 'object', properties: { meta: { $ref: '#/components/schemas/Infer' }, extra: { type: 'object', additionalProperties: { type: 'string' } } } },
      Infer: { type: 'object', properties: { s: { $ref: '#/components/schemas/Schema' } } },
      Schema: { type: 'object', properties: { p: { $ref: '#/components/schemas/Partial' } } },
      Partial: { type: 'object', properties: { x: { type: 'string' } } },
    },
  },
})

describe('emitter-reserved names', () => {
  it('suffixes names the emitters bind, leaves ordinary ones alone', () => {
    expect(operationIdent('api')).toBe('apiOp')
    expect(operationIdent('query')).toBe('queryOp')
    expect(operationIdent('listPets')).toBe('listPets')
    expect(modelIdent('Record')).toBe('Record_') // a language global: typeIdent's own suffix
    expect(modelIdent('ApiConfig')).toBe('ApiConfigModel')
    expect(modelIdent('Pet')).toBe('Pet')
  })

  for (const validator of ['pyreon', 'zod'] as const) {
    it(`a spec naming them still typechecks (validator=${validator})`, () => {
      const { errors } = typecheckSpec(`a14-${validator}`, SPEC, {
        validator,
        plugins: ['schemas', 'client', 'queries', 'mocks', 'faker', 'types'],
      })
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
})
