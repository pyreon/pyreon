/**
 * Reducing an OpenAPI document to the IR.
 *
 * This is the step where a spec becomes types, and every loss is silent
 * by construction: the reduction succeeds, a client is generated, and
 * the wrong shape ships. Nobody sees an error — they see a response that
 * does not match the server, or a body the API rejects.
 *
 * lathe's answer is that a reduction the IR cannot represent becomes a
 * NOTE with a stable code and a JSON-pointer location, so the loss is
 * reported once at the boundary rather than rediscovered per emitter.
 * That makes the notes the thing worth asserting: an unrepresentable
 * shape that produces NO note is exactly the silent loss the design
 * exists to prevent.
 *
 * The `$ref` resolver is the other half. A ref that fails to resolve
 * must degrade to `unknown` with a reason rather than to an empty
 * object — an empty object generates a schema that validates nothing and
 * a type that accepts anything, which is worse than `unknown` because it
 * looks correct.
 */
import { describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'
import type { IrType } from '../core/ir'

const spec = (extra: Record<string, unknown>) =>
  loadOpenApi(JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'T', version: '1.0.0' },
    paths: {},
    ...extra,
  })).doc

/** Reduce one component schema and hand back its IR type. */
const typeOf = (schema: unknown): IrType => {
  const doc = spec({ components: { schemas: { X: schema } } })
  return doc.models.find((m) => m.name === 'X')!.type
}

const codes = (d: ReturnType<typeof spec>) => d.notes.map((n) => n.code)

describe('document metadata degrades to defaults, never to undefined', () => {
  it('reads title, version and the first server', () => {
    // The control.
    const doc = spec({ servers: [{ url: 'https://api.example.com/v1/' }] })
    expect(doc.title).toBe('T')
    expect(doc.version).toBe('1.0.0')
    expect(doc.baseUrl, 'a trailing slash would double in every URL').toBe(
      'https://api.example.com/v1',
    )
  })

  it('defaults a missing title and version rather than emitting undefined', () => {
    // These reach generated file headers and package metadata; `undefined`
    // there is visible in the output.
    const doc = loadOpenApi(JSON.stringify({ openapi: '3.0.0', paths: {} })).doc
    expect(doc.title).toBe('API')
    expect(doc.version).toBe('0.0.0')
  })

  it('uses an empty baseUrl when there are no servers', () => {
    expect(spec({}).baseUrl).toBe('')
  })

  it('REFUSES a document that is not an object', () => {
    // A YAML file holding a bare scalar, or an empty one. Reducing it to
    // an empty document would generate an empty client silently.
    for (const src of ['null', '42', '"a string"', '[]']) {
      expect(() => loadOpenApi(src), src).toThrow(/did not parse to an object|lathe/)
    }
  })
})

describe('primitive and composite schemas reduce to their IR shape', () => {
  it('reduces each primitive', () => {
    expect(typeOf({ type: 'string' })).toMatchObject({ kind: 'string' })
    expect(typeOf({ type: 'number' })).toMatchObject({ kind: 'number' })
    expect(typeOf({ type: 'integer' })).toMatchObject({ kind: 'number' })
    expect(typeOf({ type: 'boolean' })).toMatchObject({ kind: 'boolean' })
  })

  it('reduces an enum of strings', () => {
    // An enum stays a STRING carrying its members rather than becoming
    // a separate kind — emitters that only understand `string` still
    // produce something correct, just wider.
    expect(typeOf({ type: 'string', enum: ['a', 'b'] })).toMatchObject({
      kind: 'string', enum: ['a', 'b'],
    })
  })

  it('reduces an array and its items', () => {
    const t = typeOf({ type: 'array', items: { type: 'string' } })
    expect(t).toMatchObject({ kind: 'array' })
    expect((t as { items: IrType }).items).toMatchObject({ kind: 'string' })
  })

  it('reduces an array with NO items to an unknown element', () => {
    // `type: array` with no `items` is legal and means "anything". An
    // empty object there would generate a typed element that is a lie.
    const t = typeOf({ type: 'array' })
    expect(t).toMatchObject({ kind: 'array' })
    expect((t as { items: { kind: string } }).items.kind).toBe('unknown')
  })

  it('reduces an object with required and optional fields', () => {
    const t = typeOf({
      type: 'object',
      properties: { id: { type: 'string' }, note: { type: 'string' } },
      required: ['id'],
    }) as unknown as { fields: Array<{ name: string; required: boolean }> }
    const byName = Object.fromEntries(t.fields.map((f) => [f.name, f]))
    expect(byName.id!.required).toBe(true)
    expect(byName.note!.required, 'a field absent from `required` is optional').toBe(false)
  })

  it('marks a NULLABLE field, in both spellings', () => {
    // OpenAPI 3.0 says `nullable: true`; 3.1 says `type: ['string','null']`.
    // Missing either generates a non-null type for a field the server
    // sends as null.
    for (const schema of [
      { type: 'object', properties: { a: { type: 'string', nullable: true } }, required: ['a'] },
      { type: 'object', properties: { a: { type: ['string', 'null'] } }, required: ['a'] },
    ]) {
      const t = typeOf(schema) as unknown as { fields: Array<{ name: string; nullable?: boolean }> }
      expect(t.fields[0]!.nullable, JSON.stringify(schema)).toBe(true)
    }
  })

  it('reduces a free-form object', () => {
    expect(typeOf({ type: 'object' })).toMatchObject({ kind: 'object' })
    expect(typeOf({ type: 'object', additionalProperties: true })).toMatchObject({ kind: 'object' })
  })

  it('reduces a record via additionalProperties', () => {
    // A dynamic-key map has no dedicated IR kind — it is an object with
    // `additional` set, which is what the emitters branch on.
    const t = typeOf({ type: 'object', additionalProperties: { type: 'number' } })
    expect(t.kind).toBe('object')
    expect((t as { additional?: unknown }).additional).toBeTruthy()
  })

  it('reduces a schema with NO type to unknown, not to an empty object', () => {
    // An empty object accepts anything and LOOKS typed; `unknown` at
    // least tells the caller nothing is known.
    expect(typeOf({}).kind).toBe('unknown')
  })
})

describe('a $ref resolves, or degrades with a REASON', () => {
  it('resolves a component ref', () => {
    const doc = spec({
      components: {
        schemas: {
          User: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          Wrapper: { $ref: '#/components/schemas/User' },
        },
      },
    })
    expect(doc.models.map((m) => m.name).sort()).toContain('User')
  })

  it('degrades an UNRESOLVED ref to unknown, naming the pointer', () => {
    // The commonest broken spec: a ref to a schema that was renamed. An
    // empty object here generates a validator that accepts anything.
    // The TYPE degrades to `unknown`; the pointer travels on the NOTE,
    // which is the channel the design reports losses through. Asserting
    // it on the type would be asserting the wrong half.
    const doc = spec({
      components: { schemas: { X: { $ref: '#/components/schemas/Missing' } } },
    })
    expect(doc.models.find((m) => m.name === 'X')!.type.kind).toBe('unknown')
    const note = doc.notes.find((n) => n.code === 'unsupported-ref')
    expect(note, 'an unresolved ref must be reported, not just degraded').toBeTruthy()
    expect(note!.message).toContain('Missing')
    expect(note!.at, 'and located').toContain('X')
  })

  it('degrades an EXTERNAL ref rather than trying to fetch it', () => {
    // lathe reads one document. Silently resolving to nothing would
    // generate a client for endpoints whose types came from elsewhere.
    const t = typeOf({ $ref: 'other.yaml#/components/schemas/User' }) as { kind: string }
    expect(t.kind).toBe('unknown')
  })

  it('does not hang on a self-referential ref', () => {
    // A tree node, a comment with replies — ordinary shapes. Without a
    // cycle guard the reduction never returns.
    const doc = spec({
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: { child: { $ref: '#/components/schemas/Node' } },
          },
        },
      },
    })
    expect(doc.models.map((m) => m.name)).toContain('Node')
  })

  it('does not hang on a MUTUAL reference', () => {
    const doc = spec({
      components: {
        schemas: {
          A: { type: 'object', properties: { b: { $ref: '#/components/schemas/B' } } },
          B: { type: 'object', properties: { a: { $ref: '#/components/schemas/A' } } },
        },
      },
    })
    expect(doc.models.map((m) => m.name).sort()).toEqual(['A', 'B'])
  })
})

describe('operations carry their parameters by location', () => {
  const doc = () => spec({
    paths: {
      '/users/{id}': {
        get: {
          operationId: 'getUser',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
            { name: 'session', in: 'cookie', schema: { type: 'string' } },
          ],
          responses: { 200: { content: { 'application/json': { schema: { type: 'string' } } } } },
        },
      },
    },
  })

  it('separates path from query parameters', () => {
    // A path param sent as a query string requests the wrong URL, and
    // the server answers 404 rather than complaining about the shape.
    const op = doc().operations[0]!
    expect(op.pathParams.map((p) => p.name)).toEqual(['id'])
    expect(op.queryParams.map((p) => p.name)).toEqual(['page'])
  })

  it('defaults a parameter with NO schema to string', () => {
    const d = spec({
      paths: { '/x': { get: { operationId: 'x', parameters: [{ name: 'q', in: 'query' }], responses: {} } } },
    })
    expect(d.operations[0]!.queryParams[0]!.type).toMatchObject({ kind: 'string' })
  })

  it('ignores a parameter with no name rather than emitting an unnamed one', () => {
    const d = spec({
      paths: { '/x': { get: { operationId: 'x', parameters: [{ in: 'query' }], responses: {} } } },
    })
    expect(d.operations[0]!.queryParams).toEqual([])
  })

  it('picks application/json over another content type', () => {
    // A client generated against the XML schema of a JSON API types
    // everything wrong.
    const d = spec({
      paths: { '/x': { get: { operationId: 'x', responses: { 200: { content: {
        'application/xml': { schema: { type: 'number' } },
        'application/json': { schema: { type: 'string' } },
      } } } } } },
    })
    expect(d.operations[0]!.response).toMatchObject({ kind: 'string' })
  })

  it('accepts a +json media type', () => {
    // `application/vnd.api+json`, `application/problem+json`. Falling
    // through to "no schema" loses the response type entirely.
    const d = spec({
      paths: { '/x': { get: { operationId: 'x', responses: { 200: { content: {
        'application/vnd.api+json': { schema: { type: 'string' } },
      } } } } } },
    })
    expect(d.operations[0]!.response).toMatchObject({ kind: 'string' })
  })

  it('falls back to the DEFAULT response when there is no 2xx', () => {
    const d = spec({
      paths: { '/x': { get: { operationId: 'x', responses: { default: { content: {
        'application/json': { schema: { type: 'boolean' } },
      } } } } } },
    })
    expect(d.operations[0]!.response).toMatchObject({ kind: 'boolean' })
  })

  it('leaves the response undefined when there is nothing to read', () => {
    // A 204. Inventing a type would make callers destructure nothing.
    const d = spec({ paths: { '/x': { get: { operationId: 'x', responses: { 204: {} } } } } })
    expect(d.operations[0]!.response).toBeUndefined()
  })

  it('skips a path item that is not an object', () => {
    const d = spec({ paths: { '/x': null, '/y': { get: { operationId: 'y', responses: {} } } } })
    expect(d.operations.map((o) => o.id)).toEqual(['y'])
  })
})

describe('an unrepresentable shape becomes a NOTE, never a silent drop', () => {
  it('notes a multi-media-type response', () => {
    // Only one is generated. Without the note the author never learns
    // the other was dropped.
    const d = spec({
      paths: { '/x': { get: { operationId: 'x', responses: { 200: { content: {
        'application/json': { schema: { type: 'string' } },
        'text/csv': { schema: { type: 'string' } },
      } } } } } },
    })
    expect(d.notes.length, 'the drop must be reported').toBeGreaterThan(0)
  })

  it('notes an EMPTY oneOf rather than emitting an empty union', () => {
    // An empty union is uninhabited — every value fails validation, and
    // the generated client rejects correct data.
    const d = spec({ components: { schemas: { X: { oneOf: [] } } } })
    expect(d.notes.length).toBeGreaterThan(0)
  })

  it('gives every note a stable CODE and a pointer location', () => {
    // The code is what an author greps for and a gate keys on; the
    // pointer is what makes it findable in a 4000-line spec.
    const d = spec({
      paths: { '/x': { get: { operationId: 'x', responses: { 200: { content: {
        'application/json': { schema: { type: 'string' } },
        'text/csv': { schema: { type: 'string' } },
      } } } } } },
    })
    for (const note of d.notes) {
      expect(note.code, 'a note without a code cannot be grepped').toBeTruthy()
      expect(typeof note.code).toBe('string')
      expect(note.at, 'a note without a location cannot be found').toBeTruthy()
    }
  })

  it('emits no LOSS notes for a spec that reduces cleanly', () => {
    // A note on a clean spec trains authors to ignore them. `no-servers`
    // is not a loss — it reports that the generated client gets a
    // relative baseUrl, which is a real constraint on native lowering,
    // and this fixture deliberately declares none.
    const d = spec({
      components: { schemas: { X: { type: 'object', properties: { a: { type: 'string' } } } } },
      paths: { '/x': { get: { operationId: 'x', responses: { 200: { content: {
        'application/json': { schema: { $ref: '#/components/schemas/X' } },
      } } } } } },
    })
    expect(codes(d).filter((c) => c !== 'no-servers')).toEqual([])
  })

  it('reports a relative baseUrl, because it cannot lower to native', () => {
    // PMTC bakes URLs at compile time and needs a literal absolute one,
    // so a spec with no server is a real limit on where the generated
    // client can run — worth saying once rather than discovering later.
    const note = spec({}).notes.find((n) => n.code === 'no-servers')
    expect(note).toBeTruthy()
    expect(note!.message).toMatch(/baseUrl/)
  })
})
