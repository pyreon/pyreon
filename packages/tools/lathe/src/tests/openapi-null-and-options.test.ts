/**
 * Null-bearing unions, null-only schemas, `allOf` over an empty part, and the
 * per-parameter / per-operation notes -- each pinned to the IR it produces.
 */
import { describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'

const load = (extra: Record<string, unknown>) =>
  loadOpenApi(
    JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, servers: [{ url: 'https://t.test' }], paths: {}, ...extra }),
  ).doc
const model = (schema: unknown) => load({ components: { schemas: { X: schema } } }).models.find((m) => m.name === 'X')?.type

const op = (o: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  load({
    paths: {
      '/x/{id}': {
        get: { operationId: 'x', responses: { 200: { content: { 'application/json': { schema: { type: 'string' } } } } }, ...o },
      },
    },
    ...extra,
  })

describe('null inside a union', () => {
  it('lifts null out of a 3-member anyOf, leaving a nullable 2-member union', () => {
    expect(model({ anyOf: [{ type: 'null' }, { type: 'string' }, { type: 'integer' }] })).toEqual({
      kind: 'nullable',
      inner: { kind: 'union', options: [{ kind: 'string' }, { kind: 'number', integer: true }] },
    })
  })

  it('treats a `nullable: true` member the same as a null member', () => {
    expect(model({ oneOf: [{ type: 'string', nullable: true }, { type: 'integer' }] })).toEqual({
      kind: 'nullable',
      inner: { kind: 'union', options: [{ kind: 'string' }, { kind: 'number', integer: true }] },
    })
  })

  it('a union of only nulls is `null`, not an empty union', () => {
    expect(model({ anyOf: [{ type: 'null' }, { type: 'null' }] })).toEqual({ kind: 'null' })
  })
})

describe('null-only schemas', () => {
  it('`enum: [null]` is null', () => expect(model({ enum: [null] })).toEqual({ kind: 'null' }))
  it('`type: [null]` is null', () => expect(model({ type: ['null'] })).toEqual({ kind: 'null' }))
})

describe('allOf with an empty part', () => {
  it('an empty `{}` part contributes nothing; the constrained part wins', () => {
    expect(model({ allOf: [{}, { type: 'string', maxLength: 2 }] })).toEqual({ kind: 'string', maxLength: 2 })
  })
})

describe('an unresolved $ref', () => {
  it('is unknown with an unsupported-ref note naming the pointer', () => {
    const doc = load({ components: { schemas: { X: { $ref: '#/components/schemas/Nope' } } } })
    expect(doc.models.find((m) => m.name === 'X')?.type.kind).toBe('unknown')
    expect(doc.notes).toContainEqual(
      expect.objectContaining({ code: 'unsupported-ref', message: expect.stringContaining('#/components/schemas/Nope') }),
    )
  })
})

describe('parameter notes', () => {
  const notes = op({
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, deprecated: true },
      { name: 'q', in: 'query', schema: { type: 'string' }, allowReserved: true },
    ],
  }).notes

  it('a deprecated parameter is noted at its own pointer', () => {
    expect(notes).toContainEqual(
      expect.objectContaining({ code: 'deprecated', at: '#/paths/~1x~1{id}/get/parameters/0' }),
    )
  })

  it('`allowReserved: true` is a serialization loss', () => {
    expect(notes).toContainEqual(
      expect.objectContaining({
        code: 'parameter-serialization',
        at: '#/paths/~1x~1{id}/get/parameters/1',
        message: expect.stringContaining('allowReserved: true'),
      }),
    )
  })
})

// Bearer / basic / apiKey have a generated `auth` helper (dx D8) and lose
// nothing; a scheme with no helper is the loss these notes are about.
describe('security notes', () => {
  it('an operation-level requirement is noted on the operation, with the scheme kind', () => {
    const notes = op({ security: [{ k: [] }] }, { components: { securitySchemes: { k: { type: 'http', scheme: 'digest' } } } }).notes
    expect(notes.map((n) => n.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('(http digest)'), expect.stringContaining('requires `k`')]),
    )
  })

  it('`security: []` opts an operation out: only the global note remains', () => {
    const notes = op(
      { security: [] },
      { security: [{ k: [] }], components: { securitySchemes: { k: { type: 'http', scheme: 'digest' } } } },
    ).notes.filter((n) => n.code === 'unsupported-security')
    expect(notes.some((n) => n.message.startsWith('requires'))).toBe(false)
    expect(notes.map((n) => n.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('(http digest)'), expect.stringContaining('every operation requires `k`')]),
    )
  })
})
