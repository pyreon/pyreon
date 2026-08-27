/**
 * The contract diff — the one change in this pipeline that can break an app
 * without breaking a build.
 *
 * Regenerate after a response field is deleted and everything still typechecks:
 * against the NEW types, which agree with the new spec and with nothing the app
 * was written for. `check-lathe-fresh` catches a spec edit with no
 * regeneration; this catches a regeneration that quietly changed the contract.
 *
 * Every spec here asserts the CLASSIFICATION, not merely that a difference was
 * noticed. A diff that reports every change with equal weight is the same as
 * reporting none — the whole value is in knowing which three of forty lines
 * can break a running app.
 */
import { describe, expect, it } from 'vitest'
import {
  diffSurface,
  extractSurface,
  renderType,
  type ApiSurface,
  type SurfaceOperation,
} from '../core/surface'
import { loadOpenApi } from '../input/openapi'

const spec = (bookProps: string, required = '[id, title]'): string => `openapi: 3.1.0
info: { title: Shelf, version: '1' }
servers: [{ url: 'https://api.test' }]
paths:
  /books/{id}:
    get:
      operationId: getBook
      tags: [books]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses:
        '200': { description: ok, content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } }
components:
  schemas:
    Book:
      type: object
      required: ${required}
      properties:
${bookProps}
`

const BASE = `        id: { type: string }
        title: { type: string }
        pages: { type: integer }`

const surfaceOf = (source: string): ApiSurface => extractSurface(loadOpenApi(source).doc)

/** The `getBook` operation from a surface, typed — the tests rebuild it. */
const opOf = (s: ApiSurface): SurfaceOperation => s.operations.getBook as SurfaceOperation

const codes = (a: ApiSurface, b: ApiSurface): string[] =>
  diffSurface(a, b).map((c) => `${c.severity}:${c.code}:${c.subject}`)

describe('a change that breaks a running app', () => {
  it('a removed response field is breaking', () => {
    const before = surfaceOf(spec(BASE))
    const after = surfaceOf(spec(`        id: { type: string }\n        title: { type: string }`))
    expect(codes(before, after)).toContain('breaking:field-removed:Book.pages')
  })

  it('a required field becoming OPTIONAL is breaking — the subtle one', () => {
    // The app reads it unconditionally today and keeps typechecking against
    // the regenerated optional type, because it never asks. At runtime the
    // value is now sometimes absent.
    const before = surfaceOf(spec(BASE, '[id, title]'))
    const after = surfaceOf(spec(BASE, '[id]'))
    expect(codes(before, after)).toContain('breaking:field-now-optional:Book.title')
  })

  it("a field's type changing is breaking", () => {
    const after = surfaceOf(spec(`        id: { type: string }\n        title: { type: string }\n        pages: { type: string }`))
    expect(codes(surfaceOf(spec(BASE)), after)).toContain('breaking:field-type-changed:Book.pages')
  })

  it('a removed operation is breaking', () => {
    const before = surfaceOf(spec(BASE))
    const after: ApiSurface = { ...before, operations: {} }
    expect(codes(before, after)).toContain('breaking:operation-removed:getBook')
  })

  it('an operation moving to another path is breaking', () => {
    const before = surfaceOf(spec(BASE))
    const moved: ApiSurface = {
      ...before,
      operations: {
        getBook: { ...opOf(before), path: '/v2/books/:id' },
      },
    }
    expect(codes(before, moved)).toContain('breaking:operation-moved:getBook')
  })

  it('a new REQUIRED parameter is breaking — existing calls omit it', () => {
    const before = surfaceOf(spec(BASE))
    const after: ApiSurface = {
      ...before,
      operations: {
        getBook: {
          ...opOf(before),
          params: { id: 'string', tenant: 'string' },
          requiredParams: ['id', 'tenant'],
        },
      },
    }
    expect(codes(before, after)).toContain('breaking:param-now-required:getBook.tenant')
  })
})

describe('a change that cannot break a running app', () => {
  it('a new response field is additive', () => {
    const after = surfaceOf(`${spec(`${BASE}\n        isbn: { type: string }`)}`)
    expect(codes(surfaceOf(spec(BASE)), after)).toContain('additive:field-added:Book.isbn')
  })

  it('a new OPTIONAL parameter is additive', () => {
    const before = surfaceOf(spec(BASE))
    const after: ApiSurface = {
      ...before,
      operations: {
        getBook: {
          ...opOf(before),
          params: { id: 'string', page: 'integer' },
          requiredParams: ['id'],
        },
      },
    }
    expect(codes(before, after)).toContain('additive:param-added:getBook.page')
  })

  it('dropping a parameter the CLIENT sends is additive, not breaking', () => {
    // The asymmetry that makes this a hand-written classifier rather than a
    // deep-equal: the request still goes out, the server ignores the extra.
    const before = surfaceOf(spec(BASE))
    const after: ApiSurface = {
      ...before,
      operations: {
        getBook: { ...opOf(before), params: {}, requiredParams: [] },
      },
    }
    expect(codes(before, after)).toContain('additive:param-removed:getBook.id')
  })

  it('an identical spec reports NOTHING — no noise on a no-op run', () => {
    expect(diffSurface(surfaceOf(spec(BASE)), surfaceOf(spec(BASE)))).toEqual([])
  })
})

describe('the surface is stable against changes that are not contract changes', () => {
  it('reordering a union does not register', () => {
    // A spec reordering its `oneOf` is not a contract change, and a diff that
    // says otherwise trains people to ignore it.
    const a = renderType({ kind: 'union', options: [{ kind: 'boolean' }, { kind: 'null' }] })
    const b = renderType({ kind: 'union', options: [{ kind: 'null' }, { kind: 'boolean' }] })
    expect(a).toBe(b)
  })

  it('reordering object fields does not register', () => {
    const fields = (names: string[]) =>
      renderType({
        kind: 'object',
        fields: names.map((n) => ({ name: n, type: { kind: 'string' as const }, required: true, nullable: false })),
      })
    expect(fields(['a', 'b'])).toBe(fields(['b', 'a']))
  })

  it('breaking changes sort FIRST — the reader who stops early sees them', () => {
    const before = surfaceOf(spec(BASE))
    const after = surfaceOf(spec(`        id: { type: string }\n        title: { type: string }\n        isbn: { type: string }`))
    const out = diffSurface(before, after)
    expect(out.length).toBeGreaterThan(1)
    expect(out[0]?.severity).toBe('breaking')
    expect(out.at(-1)?.severity).toBe('additive')
  })
})
