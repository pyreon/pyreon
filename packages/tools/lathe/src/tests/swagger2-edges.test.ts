/**
 * Swagger 2 up-conversion: the less common rows of the mapping, and the
 * malformed input a converter must survive without inventing structure.
 *
 * Asserted on the CONVERTED 3.0 document, because these are shapes the IR
 * reads back unchanged (a response header, an extension, a security flow) --
 * the IR-level contract is `swagger2.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { isSwagger2, upgradeSwagger2 } from '../input/swagger2'

type Json = Record<string, unknown>
const up = (doc: Json, sourceUrl?: string): { doc: Json; codes: string[] } => {
  const r = upgradeSwagger2({ swagger: '2.0', info: { title: 'S', version: '1' }, ...doc }, sourceUrl)
  return { doc: r.doc, codes: r.notes.map((n) => n.code) }
}
const at = (doc: Json, ...path: string[]): unknown =>
  path.reduce<unknown>((cur, k) => (cur !== null && typeof cur === 'object' ? (cur as Json)[k] : undefined), doc)

describe('recognising Swagger 2', () => {
  it.each([
    [{ swagger: '2.0' }, true],
    [{ swagger: 2 }, true],
    [{ swagger: '2' }, true],
    [{ swagger: '1.2' }, false],
    [{ openapi: '3.0.0' }, false],
    [null, false],
    ['swagger: 2.0', false],
  ])('%j -> %s', (doc, want) => {
    expect(isSwagger2(doc)).toBe(want)
  })
})

describe('servers', () => {
  it('a host with a root basePath has no trailing slash, and every declared scheme is kept', () => {
    expect(up({ host: 'h.test', basePath: '/', schemes: ['ws', 'http', 'https'] }).doc.servers).toEqual([
      { url: 'https://h.test' },
      { url: 'http://h.test' },
      { url: 'ws://h.test' },
    ])
  })

  it('no host and no basePath: a root-relative server only when the source is known', () => {
    expect(up({}).doc.servers).toBeUndefined()
    expect(up({}, 'https://docs.test/s.json').doc.servers).toEqual([{ url: '/' }])
  })

  it('an unparseable source URL is ignored, not thrown', () => {
    const r = up({ host: 'h.test' }, 'not a url')
    expect(r.doc.servers).toEqual([{ url: 'https://h.test' }])
    expect(r.codes).toContain('swagger2-lossy')
  })
})

describe('what is carried across verbatim', () => {
  it('extensions, tags, externalDocs and security', () => {
    const { doc } = up({
      'x-logo': { url: 'l' },
      tags: [{ name: 't' }],
      externalDocs: { url: 'e' },
      security: [{ k: [] }],
      paths: { '/x': { 'x-owner': 'me', $ref: 'other.json#/x' } },
    })
    expect(doc['x-logo']).toEqual({ url: 'l' })
    expect(doc.tags).toEqual([{ name: 't' }])
    expect(doc.externalDocs).toEqual({ url: 'e' })
    expect(doc.security).toEqual([{ k: [] }])
    expect(at(doc, 'paths', '/x')).toEqual({ $ref: 'other.json#/x', 'x-owner': 'me' })
  })

  it('an input without info gets a placeholder rather than an invalid document', () => {
    expect(upgradeSwagger2({ swagger: '2.0' }).doc.info).toEqual({ title: 'API', version: '0.0.0' })
  })
})

describe('components', () => {
  it('global responses, and a response header with an item schema', () => {
    const { doc } = up({
      responses: {
        NotFound: {
          description: 'gone',
          schema: { $ref: '#/definitions/E' },
          headers: { 'X-Ids': { type: 'array', items: { type: 'integer' }, description: 'ids' } },
          examples: { 'application/json': { m: 'x' } },
          'x-meta': 1,
        },
      },
      definitions: { E: { type: 'object' } },
    })
    expect(at(doc, 'components', 'responses', 'NotFound')).toEqual({
      description: 'gone',
      'x-meta': 1,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/E' }, example: { m: 'x' } } },
      headers: { 'X-Ids': { description: 'ids', schema: { type: 'array', items: { type: 'integer' } } } },
    })
  })

  it('a named global body keeps its parameter name as x-codegen-request-body-name', () => {
    const { doc } = up({ parameters: { B: { in: 'body', name: 'pet', schema: { type: 'string' } } } })
    expect(at(doc, 'components', 'requestBodies', 'B', 'x-codegen-request-body-name')).toBe('pet')
  })

  it('a global formData parameter is inlined at its use site, not made a component', () => {
    const { doc } = up({
      parameters: { F: { in: 'formData', name: 'f', type: 'string', required: true } },
      paths: { '/x': { post: { parameters: [{ $ref: '#/parameters/F' }], responses: {} } } },
    })
    expect(at(doc, 'components', 'parameters')).toBeUndefined()
    expect(at(doc, 'paths', '/x', 'post', 'requestBody')).toEqual({
      required: true,
      content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { f: { type: 'string' } }, required: ['f'] } } },
    })
  })

  it('a global body parameter under an operation-specific `consumes` is inlined with those types', () => {
    const { doc } = up({
      parameters: { B: { in: 'body', name: 'body', schema: { type: 'string' } } },
      paths: { '/x': { post: { consumes: ['text/plain'], parameters: [{ $ref: '#/parameters/B' }], responses: {} } } },
    })
    expect(at(doc, 'paths', '/x', 'post', 'requestBody')).toEqual({ content: { 'text/plain': { schema: { type: 'string' } } } })
  })

  it('skips malformed entries rather than inventing structure', () => {
    const { doc } = up({
      parameters: { Bad: 'nope' },
      paths: { '/bad': 'nope', '/ok': { get: { parameters: ['nope', { $ref: '#/parameters/Missing' }], responses: { 200: 'nope' } } } },
    })
    expect(at(doc, 'paths', '/bad')).toBeUndefined()
    expect(at(doc, 'paths', '/ok', 'get', 'responses', '200')).toBe('nope')
  })
})

describe('parameters and bodies', () => {
  it('both a body and form fields: the body wins, the fields are reported', () => {
    const r = up({
      paths: {
        '/x': {
          post: {
            parameters: [
              { in: 'body', name: 'body', schema: { type: 'string' } },
              { in: 'formData', name: 'f', type: 'string' },
            ],
            responses: {},
          },
        },
      },
    })
    expect(r.codes).toContain('swagger2-lossy')
    expect(at(r.doc, 'paths', '/x', 'post', 'requestBody', 'content')).toEqual({ 'application/json': { schema: { type: 'string' } } })
  })

  it('form fields keep their serialization, nullability and an items schema', () => {
    const { doc } = up({
      paths: {
        '/x': {
          post: {
            consumes: ['multipart/form-data'],
            parameters: [
              { in: 'formData', name: 'tags', type: 'array', items: { type: 'string', collectionFormat: 'csv' }, collectionFormat: 'multi' },
              { in: 'formData', name: 'note', type: 'string', 'x-nullable': true },
              { in: 'formData', type: 'string' },
            ],
            responses: {},
          },
        },
      },
    })
    expect(at(doc, 'paths', '/x', 'post', 'requestBody')).toEqual({
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: { tags: { type: 'array', items: { type: 'string' } }, note: { type: 'string', nullable: true } },
          },
          encoding: { tags: { style: 'form', explode: true } },
        },
      },
    })
  })

  it.each([
    ['path', 'csv', { style: 'simple', explode: false }],
    ['header', 'csv', { style: 'simple', explode: false }],
    ['path', 'multi', {}],
    ['path', 'pipes', {}],
  ])('a %s parameter with collectionFormat %s', (where, fmt, want) => {
    const r = up({
      paths: {
        '/x/{a}': {
          get: { parameters: [{ in: where, name: 'a', required: true, type: 'array', items: { type: 'string' }, collectionFormat: fmt }], responses: {} },
        },
      },
    })
    const param = at(r.doc, 'paths', '/x/{a}', 'get', 'parameters', '0') as Json
    expect({ style: param.style, explode: param.explode }).toEqual({ style: undefined, explode: undefined, ...want })
    expect(r.codes.includes('swagger2-lossy')).toBe(Object.keys(want).length === 0)
  })

  it('an x- key under responses is carried, and a parameter `type: file` becomes binary', () => {
    const { doc } = up({
      paths: {
        '/x': {
          get: {
            parameters: [{ in: 'query', name: 'q', type: 'file' }],
            responses: { 'x-rate': 1, 200: { description: 'ok' } },
          },
        },
      },
    })
    expect(at(doc, 'paths', '/x', 'get', 'responses', 'x-rate')).toBe(1)
    expect(at(doc, 'paths', '/x', 'get', 'parameters', '0', 'schema')).toEqual({ type: 'string', format: 'binary' })
  })
})

describe('schemas', () => {
  it('rewrites refs in every subschema position', () => {
    const { doc } = up({
      definitions: {
        A: {
          type: 'object',
          properties: { p: { $ref: '#/definitions/B' } },
          additionalProperties: { $ref: '#/definitions/B' },
          allOf: [{ $ref: '#/definitions/B' }],
          items: [{ $ref: '#/definitions/B' }],
          not: { $ref: 'ext.json#/definitions/C' },
          'x-nullable': false,
        },
        B: { type: 'string' },
      },
    })
    const a = at(doc, 'components', 'schemas', 'A') as Json
    expect(a.properties).toEqual({ p: { $ref: '#/components/schemas/B' } })
    expect(a.additionalProperties).toEqual({ $ref: '#/components/schemas/B' })
    expect(a.allOf).toEqual([{ $ref: '#/components/schemas/B' }])
    expect(a.items).toEqual([{ $ref: '#/components/schemas/B' }])
    expect(a.not).toEqual({ $ref: 'ext.json#/components/schemas/C' })
    expect(a.nullable).toBeUndefined()
  })
})

describe('security definitions', () => {
  it.each([
    ['implicit', 'implicit'],
    ['password', 'password'],
    ['application', 'clientCredentials'],
    ['accessCode', 'authorizationCode'],
  ])('oauth2 flow %s -> %s', (flow, name) => {
    const { doc } = up({ securityDefinitions: { o: { type: 'oauth2', flow, tokenUrl: 't', authorizationUrl: 'a', scopes: { r: 'read' }, description: 'd' } } })
    const scheme = at(doc, 'components', 'securitySchemes', 'o') as Json
    expect(scheme.type).toBe('oauth2')
    expect(scheme.description).toBe('d')
    expect(Object.keys(scheme.flows as Json)).toEqual([name])
  })

  it('an unknown flow or type is dropped and reported', () => {
    const r = up({ securityDefinitions: { a: { type: 'oauth2', flow: 'magic' }, b: { type: 'mtls' }, c: 'nope' } })
    expect(at(r.doc, 'components', 'securitySchemes')).toEqual({})
    expect(r.codes.filter((c) => c === 'swagger2-lossy')).toHaveLength(3)
  })
})
