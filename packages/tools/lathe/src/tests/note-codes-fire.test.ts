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

/** A fixture: extra top-level fields, or raw JSON text (for what an object cannot hold, like a duplicate key). */
type Fixture = Record<string, unknown> | string

const doc = (extra: Fixture) =>
  loadOpenApi(
    typeof extra === 'string'
      ? extra
      : JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'T', version: '1' },
          servers: [{ url: 'https://t.test' }],
          paths: {},
          ...extra,
        }),
  ).doc

const HEAD = '"openapi":"3.1.0","info":{"title":"T","version":"1"},"servers":[{"url":"https://t.test"}],"paths":{}'

const json = (schema: unknown) => ({ 'application/json': { schema } })
const get = (op: Record<string, unknown>) => ({
  paths: { '/x': { get: { operationId: 'x', responses: { 200: { content: json({ type: 'string' }) } }, ...op } } },
})

/**
 * Codes the INPUT layer emits. `plugin` is excluded because no spec can make
 * the loader produce it -- a plugin's `transformDocument` does, and
 * `plugin-api.test.ts` proves it fires (and is quiet when no note is added).
 * `int64-native` is excluded for the same reason: `generate` adds it for a
 * `multiplatform` target, and `int64-bigint.test.ts` proves both halves.
 */
type LoaderCode = Exclude<IrNoteCode, 'plugin' | 'int64-native'>

/** [fires, quiet] per code. */
const CASES: Record<LoaderCode, [Fixture, Fixture]> = {
  // JSON.parse keeps the last of two same-named keys; the first is reported.
  'duplicate-key': [
    `{${HEAD},"components":{"schemas":{"A":{"type":"string"},"A":{"type":"number"}}}}`,
    `{${HEAD},"components":{"schemas":{"A":{"type":"string"},"B":{"type":"number"}}}}`,
  ],
  // `fetch` refuses TRACE, so the operation is reported, not generated.
  'unsupported-method': [
    { paths: { '/x': { trace: { operationId: 't', responses: {} } } } },
    { paths: { '/x': { get: { operationId: 't', responses: {} } } } },
  ],
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
  // A JSON error body is TYPED (the endpoint's `errors`); only one that
  // cannot be -- not JSON, or no schema -- is a loss.
  'error-responses': [
    get({ responses: { 200: { content: json({ type: 'string' }) }, 404: { content: { 'text/html': { schema: { type: 'string' } } } } } }),
    get({ responses: { 200: { content: json({ type: 'string' }) }, 404: { content: json({ type: 'object' }) } } }),
  ],
  'other-success-responses': [
    get({ responses: { 200: { content: json({ type: 'string' }) }, 202: { content: json({ type: 'object' }) } } }),
    get({ responses: { 200: { content: json({ type: 'string' }) }, 204: { description: 'none' } } }),
  ],
  'extra-tags': [get({ tags: ['a', 'b'] }), get({ tags: ['a'] })],
  'numeric-version': [{ info: { title: 'T', version: 2 } }, { info: { title: 'T', version: '2' } }],
  // An SSE response with no schema: events arrive as raw strings, and the
  // report says so. With `itemSchema` the event type is stated, not guessed.
  'stream-event': [
    get({ responses: { 200: { content: { 'text/event-stream': {} } } } }),
    get({
      responses: {
        200: {
          content: {
            'text/event-stream': {
              itemSchema: { type: 'object', properties: { data: { type: 'string', contentSchema: { type: 'object' } } } },
            },
          },
        },
      },
    }),
  ],
  'invalid-stream': [
    {
      paths: {
        '/x': { get: { operationId: 'x', responses: { 200: { content: { 'text/event-stream': { schema: { type: 'string' } } } } } } },
        '/y': { get: { operationId: 'xStream', responses: {} } },
      },
    },
    {
      paths: {
        '/x': { get: { operationId: 'x', responses: { 200: { content: { 'text/event-stream': { schema: { type: 'string' } } } } } } },
        '/y': { get: { operationId: 'other', responses: {} } },
      },
    },
  ],
  // A Swagger 2 document is up-converted; the `openapi` key the helper adds is
  // not read once `swagger` identifies the document.
  'swagger2-converted': [{ swagger: '2.0', host: 't.test', schemes: ['https'] }, {}],
  webhooks: [
    { webhooks: { ping: { post: { requestBody: { content: { 'application/json': { schema: { type: 'string' } } } } } } } },
    {},
  ],
  // `tsv` is carried (as `tabDelimited`) for a query; a HEADER has one 3.0
  // serialization, so there it is still a loss.
  'swagger2-lossy': [
    { swagger: '2.0', host: 't.test', schemes: ['https'], paths: swaggerArrayQuery('tsv', 'header') },
    { swagger: '2.0', host: 't.test', schemes: ['https'], paths: swaggerArrayQuery('tsv') },
  ],
}

function swaggerArrayQuery(collectionFormat: string, where = 'query'): Record<string, unknown> {
  return {
    '/x': {
      get: {
        operationId: 'x',
        parameters: [{ in: where, name: 'a', type: 'array', items: { type: 'string' }, collectionFormat }],
        responses: { 200: { description: 'ok' } },
      },
    },
  }
}

describe('every note code fires on its defect and not on the corrected form', () => {
  it('the table covers every code', () => {
    expect([...Object.keys(CASES), 'plugin', 'int64-native'].sort()).toEqual(Object.keys(NOTE_SEVERITY).sort())
  })

  for (const [code, [fires, quiet]] of Object.entries(CASES) as Array<[LoaderCode, (typeof CASES)[LoaderCode]]>) {
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
