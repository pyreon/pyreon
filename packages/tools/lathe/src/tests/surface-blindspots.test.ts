/**
 * Contract changes the surface diff used to MISS entirely.
 *
 * Found by the input audit's probe: four breaking changes, four empty diffs.
 * `extractSurface` recorded a model only as the fields of a top-level object,
 * so every enum / union / array model had the surface `{}` and nothing about
 * it could ever change; and a field becoming nullable rendered identically
 * before and after, because nullability lived on the field and not the type.
 *
 * Direction matters and is asserted: narrowing a value the client SENDS
 * breaks existing calls; narrowing one it only RECEIVES does not. The reverse
 * holds for widening.
 */
import { describe, expect, it } from 'vitest'
import { diffSurface, extractSurface, type SurfaceChange } from '../core/surface'
import { loadOpenApi } from '../input/openapi'

const OK = { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/X' } } } } }

/** A surface whose model `X` is used as a response, a request body, or nowhere. */
function surface(schemas: Record<string, unknown>, use: 'response' | 'request' | 'none' = 'none') {
  const paths =
    use === 'response'
      ? { '/x': { get: { operationId: 'getX', responses: OK } } }
      : use === 'request'
        ? { '/x': { post: { operationId: 'postX', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/X' } } } }, responses: { '204': { description: 'ok' } } } } }
        : {}
  return extractSurface(
    loadOpenApi(JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths, components: { schemas } })).doc,
  )
}

const codes = (cs: SurfaceChange[]) => cs.map((c) => `${c.severity}:${c.code}`)

describe('the four changes the audit probe found missed', () => {
  it('a response field becoming nullable is breaking', () => {
    const cs = diffSurface(
      surface({ X: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } } }, 'response'),
      surface({ X: { type: 'object', required: ['a'], properties: { a: { type: ['string', 'null'] } } } }, 'response'),
    )
    expect(codes(cs)).toEqual(['breaking:field-now-nullable'])
  })

  it('a union model losing a member is caught', () => {
    const A = { type: 'object', properties: { x: { type: 'string' } } }
    const B = { type: 'object', properties: { y: { type: 'string' } } }
    const cs = diffSurface(
      surface({ A, B, X: { oneOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }] } }),
      surface({ A, B, X: { oneOf: [{ $ref: '#/components/schemas/A' }, { type: 'string' }] } }),
    )
    expect(codes(cs)).toContain('breaking:member-removed')
    expect(cs.find((c) => c.code === 'member-removed')?.detail).toContain('B')
  })

  it('an enum model losing a value is caught', () => {
    const cs = diffSurface(surface({ X: { type: 'string', enum: ['a', 'b'] } }), surface({ X: { type: 'string', enum: ['a'] } }))
    expect(codes(cs)).toEqual(['breaking:member-removed'])
  })

  it("an array model's item type changing is caught", () => {
    const cs = diffSurface(
      surface({ X: { type: 'array', items: { type: 'string' } } }),
      surface({ X: { type: 'array', items: { type: 'integer' } } }),
    )
    expect(codes(cs)).toEqual(['breaking:model-type-changed'])
  })
})

describe('the classification follows the direction the value travels', () => {
  const E2 = { X: { type: 'string', enum: ['a', 'b'] } }
  const E1 = { X: { type: 'string', enum: ['a'] } }

  it('an enum value REMOVED: breaking when sent, additive when only received', () => {
    expect(codes(diffSurface(surface(E2, 'request'), surface(E1, 'request')))).toEqual(['breaking:member-removed'])
    expect(codes(diffSurface(surface(E2, 'response'), surface(E1, 'response')))).toEqual(['additive:member-removed'])
  })

  it('an enum value ADDED: breaking when received, additive when only sent', () => {
    expect(codes(diffSurface(surface(E1, 'response'), surface(E2, 'response')))).toEqual(['breaking:member-added'])
    expect(codes(diffSurface(surface(E1, 'request'), surface(E2, 'request')))).toEqual(['additive:member-added'])
  })

  it('a field becoming nullable in a REQUEST-only model is additive; the reverse is breaking', () => {
    const nn = { X: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } } }
    const n = { X: { type: 'object', required: ['a'], properties: { a: { type: ['string', 'null'] } } } }
    expect(codes(diffSurface(surface(nn, 'request'), surface(n, 'request')))).toEqual(['additive:field-now-nullable'])
    expect(codes(diffSurface(surface(n, 'request'), surface(nn, 'request')))).toEqual(['breaking:field-no-longer-nullable'])
  })

  it('an unchanged surface diffs to nothing', () => {
    expect(diffSurface(surface(E2, 'response'), surface(E2, 'response'))).toEqual([])
  })
})
