/**
 * The input layer's less common shapes, each with the IR it must produce.
 *
 * These are the branches the headline suites do not reach: degenerate unions,
 * enums holding non-scalars, schemas with no `type`, merges of non-object
 * parts, oversized distributions, media types without a body, server
 * variables without a default, and direction-splitting through every
 * position a type can occupy. Each is a real shape a spec can contain, and
 * each asserts the specific IR (and note) rather than merely "no throw".
 */
import { describe, expect, it } from 'vitest'
import type { IrType } from '../core/ir'
import { loadOpenApi } from '../input/openapi'

const doc = (schemas: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  loadOpenApi(JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {}, components: { schemas }, ...extra })).doc

const model = (d: ReturnType<typeof doc>, name: string): IrType | undefined => d.models.find((m) => m.name === name)?.type

describe('scalars and enums', () => {
  it('a `const` holding an object is unsupported, with a note', () => {
    const d = doc({ X: { const: { a: 1 } } })
    expect(model(d, 'X')?.kind).toBe('unknown')
    expect(d.notes.some((n) => n.code === 'unsupported-const')).toBe(true)
  })

  it('an enum of only non-scalars is unsupported; a mixed one keeps its scalars with a note', () => {
    const d = doc({ A: { enum: [{ a: 1 }] }, B: { enum: ['x', { a: 1 }] } })
    expect(model(d, 'A')?.kind).toBe('unknown')
    expect(model(d, 'B')).toEqual({ kind: 'enum', values: ['x'] })
    expect(d.notes.some((n) => n.message.includes('non-scalar value'))).toBe(true)
  })

  it('`type: [null]` alone is null', () => {
    expect(model(doc({ X: { type: ['null'] } }), 'X')).toEqual({ kind: 'null' })
  })

  it('a schema with no `type` is inferred from items / length keywords', () => {
    const d = doc({ A: { items: { type: 'string' } }, S: { maxLength: 3 } })
    expect(model(d, 'A')).toMatchObject({ kind: 'array', items: { kind: 'string' } })
    expect(model(d, 'S')).toMatchObject({ kind: 'string', maxLength: 3 })
  })

  it("3.0's boolean exclusiveMaximum becomes a strict bound", () => {
    expect(model(doc({ N: { type: 'number', maximum: 10, exclusiveMaximum: true } }), 'N')).toMatchObject({
      kind: 'number',
      maximum: undefined,
      exclusiveMaximum: 10,
    })
  })

  it('a property whose schema is not an object is skipped, not crashed on', () => {
    expect(model(doc({ O: { type: 'object', properties: { a: true, b: { type: 'string' } } } }), 'O')).toMatchObject({
      fields: [{ name: 'b' }],
    })
  })

  it('a component that is not a schema object is skipped', () => {
    expect(doc({ Bad: true, Good: { type: 'string' } }).models.map((m) => m.name)).toEqual(['Good'])
  })
})

describe('unions and discriminators', () => {
  it('a union of only nulls is null', () => {
    expect(model(doc({ X: { anyOf: [{ type: 'null' }, { type: 'null' }] } }), 'X')).toEqual({ kind: 'null' })
  })

  it('a discriminator is dropped (noted) when a member lacks the tag, or two members share a value', () => {
    const d = doc({
      Missing: { oneOf: [{ type: 'object', required: ['k'], properties: { k: { const: 'a' } } }, { type: 'object', properties: { x: { type: 'string' } } }], discriminator: { propertyName: 'k' } },
      Dup: { oneOf: [{ type: 'object', required: ['k'], properties: { k: { const: 'a' } } }, { type: 'object', required: ['k'], properties: { k: { const: 'a' } } }], discriminator: { propertyName: 'k' } },
    })
    expect(model(d, 'Missing')).toMatchObject({ kind: 'union', discriminator: undefined })
    expect(model(d, 'Dup')).toMatchObject({ kind: 'union', discriminator: undefined })
    expect(d.notes.some((n) => n.message.includes('a member has no `k` field'))).toBe(true)
    expect(d.notes.some((n) => n.message.includes('two members claim the tag value `a`'))).toBe(true)
  })

  it('a member that is a ref cycle with no object is a non-object member', () => {
    const d = doc({
      A: { $ref: '#/components/schemas/B' },
      B: { $ref: '#/components/schemas/A' },
      U: { oneOf: [{ $ref: '#/components/schemas/A' }, { type: 'object', required: ['k'], properties: { k: { const: 'x' } } }], discriminator: { propertyName: 'k' } },
    })
    expect(model(d, 'U')).toMatchObject({ kind: 'union', discriminator: undefined })
  })
})

describe('allOf merges', () => {
  it('two string parts merge their constraints; incompatible scalars keep the first with a note', () => {
    const d = doc({
      S: { allOf: [{ type: 'string', minLength: 2, maxLength: 9 }, { type: 'string', minLength: 4, maxLength: 7, pattern: '^a' }] },
      N: { allOf: [{ type: 'number', minimum: 1, maximum: 10, multipleOf: 2 }, { type: 'integer', minimum: 3, exclusiveMaximum: 8 }] },
      B: { allOf: [{ type: 'boolean' }, { type: 'boolean' }] },
      Mixed: { allOf: [{ type: 'string' }, { type: 'integer' }] },
    })
    expect(model(d, 'S')).toMatchObject({ kind: 'string', minLength: 4, maxLength: 7, pattern: '^a' })
    expect(model(d, 'N')).toMatchObject({ kind: 'number', integer: true, minimum: 3, maximum: 10, exclusiveMaximum: 8, multipleOf: 2 })
    expect(model(d, 'B')).toEqual({ kind: 'boolean' })
    expect(model(d, 'Mixed')?.kind).toBe('string')
    expect(d.notes.some((n) => n.message.includes('incompatible non-object'))).toBe(true)
  })

  it('an object part and a scalar part: the scalar is dropped with a note', () => {
    const d = doc({ X: { allOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'string' }] } })
    expect(model(d, 'X')).toMatchObject({ kind: 'object', fields: [{ name: 'a' }] })
    expect(d.notes.some((n) => n.message.includes('non-object parts'))).toBe(true)
  })

  it('an allOf whose parts constrain nothing is unknown', () => {
    expect(model(doc({ X: { allOf: [{ description: 'x' }] } }), 'X')?.kind).toBe('unknown')
  })

  it('a sibling oneOf next to an allOf distributes too', () => {
    const d = doc({
      X: {
        allOf: [{ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }],
        oneOf: [{ type: 'object', required: ['a'], properties: { a: { type: 'string' } } }, { type: 'object', required: ['b'], properties: { b: { type: 'string' } } }],
      },
    })
    const x = model(d, 'X')
    expect(x?.kind).toBe('union')
    expect(x?.kind === 'union' && x.options.map((o) => (o.kind === 'object' ? o.fields.map((f) => f.name) : []))).toEqual([
      ['id', 'a'],
      ['id', 'b'],
    ])
  })

  it('a distribution that would exceed the cap keeps the first union, with a note', () => {
    const five = (p: string) => ({ oneOf: [1, 2, 3, 4, 5].map((i) => ({ type: 'object', properties: { [`${p}${i}`]: { type: 'string' } } })) })
    const d = doc({ X: { allOf: [five('a'), five('b'), five('c')] } })
    expect(model(d, 'X')).toMatchObject({ kind: 'union' })
    expect(d.notes.some((n) => n.message.includes('125 shapes'))).toBe(true)
  })

  it('an allOf part that refs a HOISTED recursive model merges its fields', () => {
    const d = doc(
      { X: { allOf: [{ $ref: '#/$defs/Node' }, { type: 'object', properties: { extra: { type: 'string' } } }] }, T: { $ref: '#/$defs/Node' } },
      { $defs: { Node: { type: 'object', properties: { next: { $ref: '#/$defs/Node' } } } } },
    )
    const x = model(d, 'X')
    expect(x?.kind === 'object' && x.fields.map((f) => f.name).sort()).toEqual(['extra', 'next'])
  })

  it('a hoisted pointer referenced a second time reuses the model', () => {
    const d = doc(
      { A: { type: 'object', properties: { n: { $ref: '#/$defs/Node' } } }, B: { type: 'object', properties: { n: { $ref: '#/$defs/Node' } } } },
      { $defs: { Node: { type: 'object', properties: { next: { $ref: '#/$defs/Node' } } } } },
    )
    expect(d.models.filter((m) => m.name.startsWith('Node'))).toHaveLength(1)
  })

  it('an unresolvable local pointer is unknown, with a note', () => {
    const d = doc({ X: { type: 'object', properties: { a: { $ref: '#/nowhere/at/all' } } } })
    expect(model(d, 'X')).toMatchObject({ fields: [{ type: { kind: 'unknown' } }] })
    expect(d.notes.some((n) => n.code === 'unsupported-ref')).toBe(true)
  })
})

describe('media types and bodies', () => {
  const op = (requestBody: unknown, responses: unknown = { '200': { description: 'ok' } }) =>
    loadOpenApi(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        servers: [{ url: 'https://a.test' }],
        paths: { '/x': { post: { operationId: 'x', requestBody, responses } } },
      }),
    ).doc.operations[0]

  it('a text body is a string; a body with no content or an empty content map is none', () => {
    expect(op({ content: { 'text/plain': {} } })?.body).toEqual({ mediaType: 'text/plain', encoding: 'text', type: { kind: 'string' } })
    expect(op({ description: 'no content' })?.body).toBeUndefined()
    expect(op({ content: {} })?.body).toBeUndefined()
  })

  it('invalid form encoding entries are ignored; an empty set is no encoding', () => {
    const body = op({
      content: {
        'application/x-www-form-urlencoded': {
          schema: { type: 'object', properties: { a: { type: 'string' } } },
          encoding: { a: 'nope', b: { style: 'weird' } },
        },
      },
    })?.body
    expect(body?.fieldEncoding).toBeUndefined()
  })

  it('a response with an empty content map has no body', () => {
    expect(op(undefined, { '200': { content: {} } })?.response).toBeUndefined()
  })
})

describe('servers', () => {
  it('a variable without a default stays literal, with a note', () => {
    const d = doc({}, { servers: [{ url: 'https://{tenant}.api.test' }] })
    expect(d.baseUrl).toBe('https://{tenant}.api.test')
    expect(d.notes.some((n) => n.message.includes('`{tenant}` has no default'))).toBe(true)
  })
})

describe('direction split reaches every position', () => {
  it('rewrites params, arrays, nullables, unions and maps to the Input shape', () => {
    const d = loadOpenApi(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        servers: [{ url: 'https://a.test' }],
        paths: {
          '/x/{id}': {
            post: {
              operationId: 'x',
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'f', in: 'query', schema: { $ref: '#/components/schemas/Row' } },
                { name: 'h', in: 'header', schema: { type: 'string' } },
                { name: 'c', in: 'cookie', schema: { type: 'string' } },
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        list: { type: 'array', items: { $ref: '#/components/schemas/Row' } },
                        maybe: { allOf: [{ $ref: '#/components/schemas/Row' }], nullable: true },
                        either: { oneOf: [{ $ref: '#/components/schemas/Row' }, { type: 'string' }] },
                        map: { type: 'object', additionalProperties: { $ref: '#/components/schemas/Row' } },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
        components: {
          schemas: {
            Row: { type: 'object', description: 'A row.', properties: { id: { type: 'string', readOnly: true }, v: { type: 'string' } } },
            Holder: { type: 'object', properties: { row: { $ref: '#/components/schemas/Row' } } },
          },
        },
      }),
    ).doc
    expect(d.models.map((m) => m.name).sort()).toEqual(['Holder', 'HolderInput', 'Row', 'RowInput'])
    expect(d.models.find((m) => m.name === 'RowInput')?.doc).toContain('A row.')
    const o = d.operations[0]
    expect(o?.queryParams[0]?.type).toEqual({ kind: 'ref', name: 'RowInput' })
    const text = JSON.stringify(o?.body?.type)
    expect(text).not.toContain('"name":"Row"')
    expect(text).toContain('RowInput')
  })
})
