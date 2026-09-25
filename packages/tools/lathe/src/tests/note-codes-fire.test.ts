/**
 * Every note code FIRES on its defect and stays QUIET on the corrected form.
 *
 * A note that never fires passes every structural test there is -- which is
 * exactly how "losses are reported, never silent" held for the six codes that
 * existed while header parameters, security schemes, response headers, error
 * bodies, `const`, `deprecated`, and an optional request body were all dropped
 * without a word. So each code gets a fixture that must produce it and a
 * counterpart that must not, and the table is asserted TOTAL over the code
 * union: a new code fails here until it proves it fires.
 */
import { describe, expect, it } from 'vitest'
import { NOTE_SEVERITY, type IrNoteCode } from '../core/ir'
import { loadOpenApi, ptr } from '../input/openapi'

const doc = (extra: Record<string, unknown>) =>
  loadOpenApi(
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://t.test' }],
      paths: {},
      ...extra,
    }),
  ).doc

const json = (schema: unknown) => ({ 'application/json': { schema } })
const get = (op: Record<string, unknown>) => ({
  paths: { '/x': { get: { operationId: 'x', responses: { 200: { content: json({ type: 'string' }) } }, ...op } } },
})

/** [fires, quiet] per code. */
const CASES: Record<IrNoteCode, [Record<string, unknown>, Record<string, unknown>]> = {
  'unsupported-schema': [
    { components: { schemas: { X: { type: 'frobnicate' } } } },
    { components: { schemas: { X: { type: 'string' } } } },
  ],
  'unsupported-ref': [
    { components: { schemas: { X: { $ref: 'other.yaml#/X' } } } },
    { components: { schemas: { X: { $ref: '#/components/schemas/Y' }, Y: { type: 'string' } } } },
  ],
  // A scalar `const` IS enforced (a one-value enum); only a non-scalar one --
  // which no JSON literal schema can spell -- is a loss.
  'unsupported-const': [
    { components: { schemas: { X: { const: { a: 1 } } } } },
    { components: { schemas: { X: { type: 'string', const: 'a' } } } },
  ],
  'int64-precision': [
    { components: { schemas: { X: { type: 'integer', format: 'int64' } } } },
    { components: { schemas: { X: { type: 'integer', format: 'int32' } } } },
  ],
  'cyclic-ref': [
    { $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } }, components: { schemas: { X: { $ref: '#/$defs/A' } } } },
    // A recursive schema that passes through a real object is represented
    // (hoisted into a model), not a loss.
    { $defs: { N: { type: 'object', properties: { next: { $ref: '#/$defs/N' } } } }, components: { schemas: { X: { $ref: '#/$defs/N' } } } },
  ],
  'missing-operation-id': [
    { paths: { '/x': { get: { responses: {} } } } },
    { paths: { '/x': { get: { operationId: 'x', responses: {} } } } },
  ],
  'multiple-content-types': [
    get({ responses: { 200: { content: { ...json({ type: 'string' }), 'application/xml': {} } } } }),
    get({}),
  ],
  // A non-JSON response is decoded by media type now (audit B4) — a choice is
  // noted only when several non-JSON types were on offer.
  'body-on-get': [
    get({ requestBody: { content: json({ type: 'object' }) } }),
    { paths: { '/x': { post: { operationId: 'x', requestBody: { content: json({ type: 'string' }) }, responses: {} } } } },
  ],
  'invalid-pagination': [
    get({ 'x-pyreon-pagination': { kind: 'cursor', param: 'cursor' } }),
    get({}),
  ],
  'no-servers': [{ servers: [] }, {}],
  // Header and cookie parameters are typed call arguments now; what is left
  // with no place in the call is a location 3.x does not define (`body` is
  // Swagger 2's).
  'unsupported-parameter': [
    get({ parameters: [{ name: 'payload', in: 'body', schema: { type: 'string' } }] }),
    get({ parameters: [{ name: 'X-Id', in: 'header', schema: { type: 'string' } }] }),
  ],
  // A query style/explode is HONOURED (audit B2); a path style is not.
  'parameter-serialization': [
    { paths: { '/x/{f}': { get: { operationId: 'x', parameters: [{ name: 'f', in: 'path', required: true, style: 'label', schema: { type: 'string' } }], responses: {} } } } },
    get({ parameters: [{ name: 'f', in: 'query', style: 'deepObject', schema: { type: 'object' } }] }),
  ],
  // A scheme with a generated `auth` helper loses nothing (dx D8).
  'unsupported-security': [
    { components: { securitySchemes: { d: { type: 'http', scheme: 'digest' } } } },
    { components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }, security: [{ bearer: [] }] },
  ],
  'response-headers': [
    get({ responses: { 200: { headers: { 'X-Next': { schema: { type: 'string' } } }, content: json({ type: 'string' }) } } }),
    get({}),
  ],
  'error-responses': [
    get({ responses: { 200: { content: json({ type: 'string' }) }, 404: { content: json({ type: 'object' }) } } }),
    // An error status with NO body loses nothing -- there is nothing to type.
    get({ responses: { 200: { content: json({ type: 'string' }) }, 404: { description: 'gone' } } }),
  ],
  'other-success-responses': [
    get({ responses: { 200: { content: json({ type: 'string' }) }, 202: { content: json({ type: 'object' }) } } }),
    get({ responses: { 200: { content: json({ type: 'string' }) }, 204: { description: 'none' } } }),
  ],
  deprecated: [get({ deprecated: true }), get({ deprecated: false })],
  'extra-tags': [get({ tags: ['a', 'b'] }), get({ tags: ['a'] })],
  'description-dropped': [
    get({ summary: 's', description: 'd' }),
    get({ description: 'only a description' }),
  ],
  'numeric-version': [{ info: { title: 'T', version: 2 } }, { info: { title: 'T', version: '2' } }],
  // A Swagger 2 document is up-converted; the `openapi` key the helper adds is
  // not read once `swagger` identifies the document.
  'swagger2-converted': [{ swagger: '2.0', host: 't.test', schemes: ['https'] }, {}],
  'swagger2-lossy': [
    { swagger: '2.0', host: 't.test', schemes: ['https'], paths: swaggerArrayQuery('tsv') },
    { swagger: '2.0', host: 't.test', schemes: ['https'], paths: swaggerArrayQuery('csv') },
  ],
}

function swaggerArrayQuery(collectionFormat: string): Record<string, unknown> {
  return {
    '/x': {
      get: {
        operationId: 'x',
        parameters: [{ in: 'query', name: 'a', type: 'array', items: { type: 'string' }, collectionFormat }],
        responses: { 200: { description: 'ok' } },
      },
    },
  }
}

describe('every note code fires on its defect and not on the corrected form', () => {
  it('the table covers every code', () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(NOTE_SEVERITY).sort())
  })

  for (const [code, [fires, quiet]] of Object.entries(CASES) as Array<[IrNoteCode, (typeof CASES)[IrNoteCode]]>) {
    it(`${code} — fires`, () => {
      expect(doc(fires).notes.map((n) => n.code)).toContain(code)
    })
    it(`${code} — quiet on the corrected form`, () => {
      expect(doc(quiet).notes.map((n) => n.code)).not.toContain(code)
    })
  }
})

describe('note locations are real JSON pointers', () => {
  it('escapes `/` and `~` inside a segment (RFC 6901)', () => {
    expect(ptr('paths', '/pets/{id}', 'get')).toBe('#/paths/~1pets~1{id}/get')
    expect(ptr('components', 'schemas', 'a~b')).toBe('#/components/schemas/a~0b')
  })

  it('an operation note points at the operation, not at `#/paths//x`', () => {
    const d = doc({ paths: { '/x/y': { get: { responses: {} } } } })
    expect(d.notes.find((n) => n.code === 'missing-operation-id')?.at).toBe('#/paths/~1x~1y/get')
  })

  it('a parameter note points at its INDEX, which is where it lives', () => {
    const d = doc(get({ parameters: [{ name: 'q', in: 'query' }, { name: 'X-A', in: 'formData' }] }))
    expect(d.notes.find((n) => n.code === 'unsupported-parameter')?.at).toBe('#/paths/~1x/get/parameters/1')
  })

  it('a union note points at the SPEC key, not the generated model name', () => {
    const d = doc({
      components: {
        schemas: {
          'my-shape': { oneOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }], discriminator: { propertyName: 't' } },
          A: { type: 'object', properties: { t: { type: 'string' } } },
          B: { type: 'object', properties: { t: { type: 'string' } } },
        },
      },
    })
    const note = d.notes.find((n) => n.message.includes('discriminator `t`'))
    expect(note?.at).toBe('#/components/schemas/my-shape')
  })
})

describe('the docs page documents every note code, with its real severity', () => {
  it('has one row per code and nothing stale', async () => {
    // A code table maintained by hand drifts the day a code is added; this
    // reads the published page so a new code fails here until it is documented.
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const page = readFileSync(
      fileURLToPath(new URL('../../../../../docs/src/content/docs/lathe.md', import.meta.url)),
      'utf8',
    )
    const rows = new Map<string, string>()
    for (const m of page.matchAll(/^\| `([a-z0-9-]+)`(?: \/ `([a-z0-9-]+)`)? \| (loss|choice) \|/gm)) {
      rows.set(m[1] as string, m[3] as string)
      if (m[2]) rows.set(m[2], m[3] as string)
    }
    expect(Object.fromEntries([...rows].sort())).toEqual(
      Object.fromEntries(Object.entries(NOTE_SEVERITY).sort()),
    )
  })
})
