/**
 * The bundler over the rest of the OpenAPI grammar: every structure a `$ref`
 * can sit in, every path spelling, and the inputs that must be reported
 * rather than guessed. Asserted on the BUNDLED document, which is what the
 * reader then sees -- `multi-file.test.ts` covers the IR-level behaviour.
 */
import { describe, expect, it } from 'vitest'
import { bundle, collectDocuments, collectDocumentsAsync, referencedDocuments, resolveDocId, type ReadOutcome } from '../input/bundle'

type Json = Record<string, unknown>

function bundled(files: Record<string, unknown>, root = 'r/openapi.json'): { doc: Json; codes: string[]; documents: string[] } {
  const read = (id: string): ReadOutcome => (id in files ? { doc: files[id] } : { error: `ENOENT ${id}` })
  const r = bundle(root, collectDocuments(files[root], root, read))
  return { doc: r.doc, codes: r.notes.map((n) => n.code), documents: r.documents }
}
const at = (doc: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((cur, k) => (cur !== null && typeof cur === 'object' ? (cur as Json)[k] : undefined), doc)
const head = { openapi: '3.1.0', info: { title: 'T', version: '1' } }

describe('document ids', () => {
  it.each([
    ['r/a.yaml', 'file:///abs/b.yaml', '/abs/b.yaml'],
    ['C:\\spec\\root.yaml', 'models\\pet.yaml', 'C:\\spec\\models\\pet.yaml'],
    ['C:\\spec\\root.yaml', 'D:\\other\\x.yaml', 'D:\\other\\x.yaml'],
    ['r/a.yaml', './././b.yaml', 'r/b.yaml'],
    ['a.yaml', '../../up.yaml', '../../up.yaml'],
    ['r/a.yaml', '', 'r/a.yaml'],
  ])('%s + %s -> %s', (base, rel, want) => {
    expect(resolveDocId(base, rel)).toBe(want)
  })
})

describe('what counts as a reference to another document', () => {
  it('scans structure, discriminator mappings that name files, and never data', () => {
    const refs = referencedDocuments(
      {
        a: { $ref: 'a.yaml' },
        same: { $ref: '#/x' },
        list: [{ $ref: 'b.yaml#/B' }],
        disc: { discriminator: { mapping: { c: 'c.yaml', local: '#/x', bare: 'Name', bad: 1 } } },
        example: { $ref: 'nope.yaml' },
        enum: [{ $ref: 'nope2.yaml' }],
      },
      'r/root.yaml',
    )
    expect(refs.sort()).toEqual(['r/a.yaml', 'r/b.yaml', 'r/c.yaml'])
  })

  it('reads each document ONCE, however many refer to it (sync and async)', async () => {
    const files: Record<string, unknown> = {
      r: { x: { $ref: 'a' }, y: { $ref: 'b' } },
      a: { $ref: 'shared' },
      b: { $ref: 'shared' },
      shared: {},
    }
    const reads: string[] = []
    const read = (id: string): ReadOutcome => {
      reads.push(id)
      return { doc: files[id] }
    }
    collectDocuments(files.r, 'r', read)
    expect(reads.sort()).toEqual(['a', 'b', 'shared'])
    reads.length = 0
    const docs = await collectDocumentsAsync(files.r, 'r', (id) => Promise.resolve(read(id)))
    expect(reads.sort()).toEqual(['a', 'b', 'shared'])
    expect([...docs.keys()].sort()).toEqual(['a', 'b', 'r', 'shared'])
  })
})

describe('every structure a reference can sit in', () => {
  it('inlines webhooks, callbacks, request bodies, parameter content and response headers', () => {
    const { doc, codes } = bundled({
      'r/openapi.json': {
        ...head,
        webhooks: { hook: { $ref: 'hook.json' } },
        paths: {
          '/x': {
            parameters: [{ $ref: 'param.json' }],
            post: {
              requestBody: { $ref: 'body.json' },
              callbacks: { cb: { $ref: 'callback.json' } },
              responses: { 200: { description: 'ok', headers: { 'X-A': { $ref: 'header.json' } } } },
            },
          },
        },
      },
      'r/hook.json': { post: { responses: {} } },
      'r/param.json': { name: 'p', in: 'query', content: { 'application/json': { schema: { $ref: 'p.json' } } } },
      'r/p.json': { type: 'string' },
      'r/body.json': { content: { 'application/json': { schema: { $ref: 'b.json' } } } },
      'r/b.json': { type: 'integer' },
      'r/callback.json': { '{$url}': { post: { responses: {} } } },
      'r/header.json': { schema: { $ref: 'h.json' } },
      'r/h.json': { type: 'boolean' },
    })
    expect(codes).toEqual([])
    expect(at(doc, 'webhooks', 'hook')).toEqual({ post: { responses: {} } })
    expect(at(doc, 'paths', '/x', 'parameters')).toEqual([
      { name: 'p', in: 'query', content: { 'application/json': { schema: { $ref: '#/components/schemas/p' } } } },
    ])
    expect(at(doc, 'paths', '/x', 'post', 'requestBody', 'content', 'application/json', 'schema')).toEqual({ $ref: '#/components/schemas/b' })
    expect(at(doc, 'paths', '/x', 'post', 'callbacks', 'cb')).toEqual({ '{$url}': { post: { responses: {} } } })
    expect(at(doc, 'paths', '/x', 'post', 'responses', '200', 'headers', 'X-A')).toEqual({ schema: { $ref: '#/components/schemas/h' } })
    expect(Object.keys(at(doc, 'components', 'schemas') as Json).sort()).toEqual(['b', 'h', 'p'])
  })

  it('every components section, and a Swagger 2 root', () => {
    const { doc } = bundled({
      'r/openapi.json': {
        ...head,
        components: {
          schemas: { Local: { type: 'string' } },
          parameters: { P: { $ref: 'parts.json#/p' } },
          responses: { R: { $ref: 'parts.json#/r' } },
          requestBodies: { B: { $ref: 'parts.json#/b' } },
          headers: { H: { $ref: 'parts.json#/h' } },
          pathItems: { I: { $ref: 'parts.json#/i' } },
          callbacks: { C: { $ref: 'parts.json#/c' } },
        },
      },
      'r/parts.json': {
        p: { name: 'p', in: 'query', schema: { $ref: 'm.json' } },
        r: { description: 'r', content: { 'application/json': { schema: { $ref: 'm.json' } } } },
        b: { content: {} },
        h: { schema: { type: 'string' } },
        i: { get: { responses: {} } },
        c: { '{$u}': { post: { responses: {} } } },
      },
      'r/m.json': { type: 'number' },
    })
    const c = doc.components as Json
    expect(Object.keys(c.schemas as Json).sort()).toEqual(['Local', 'm'])
    expect(at(c, 'parameters', 'P', 'schema')).toEqual({ $ref: '#/components/schemas/m' })
    expect(at(c, 'pathItems', 'I')).toEqual({ get: { responses: {} } })

    const swagger = bundled({
      'r/openapi.json': {
        swagger: '2.0',
        info: {},
        definitions: { Pet: { $ref: 'pet.json' } },
        parameters: { P: { $ref: 'pet.json#/properties/id' } },
        responses: { R: { description: 'r', schema: { $ref: 'pet.json' } } },
        paths: {},
      },
      'r/pet.json': { type: 'object', properties: { id: { in: 'query', name: 'id', type: 'integer' } } },
    }).doc
    expect(at(swagger, 'definitions', 'Pet', 'type')).toBe('object')
    expect(at(swagger, 'responses', 'R', 'schema')).toEqual({ $ref: '#/definitions/Pet' })
    expect(at(swagger, 'parameters', 'P')).toEqual({ in: 'query', name: 'id', type: 'integer' })
  })

  it('a reference to a SCALAR (a shared description) becomes the value; 3.1 siblings override the target', () => {
    const { doc } = bundled({
      'r/openapi.json': {
        ...head,
        info: { title: 'T', version: '1', description: { $ref: 'text.json#/intro' } },
        paths: { '/x': { $ref: 'item.json', summary: 'mine' } },
      },
      'r/text.json': { intro: 'Hello.' },
      'r/item.json': { summary: 'theirs', get: { responses: {} } },
    })
    expect(at(doc, 'info', 'description')).toBe('Hello.')
    expect(at(doc, 'paths', '/x')).toEqual({ summary: 'mine', get: { responses: {} } })
  })

  it('a pointer can index an array; a reference back into the ROOT becomes local', () => {
    const { doc } = bundled({
      'r/openapi.json': {
        ...head,
        paths: { '/x': { get: { parameters: [{ $ref: 'list.json#/1' }], responses: { 200: { $ref: 'back.json' } } } } },
        components: { schemas: { Pet: { type: 'string' } } },
      },
      'r/list.json': [{ name: 'a' }, { name: 'b', in: 'query' }],
      'r/back.json': { description: 'ok', content: { 'application/json': { schema: { $ref: 'openapi.json#/components/schemas/Pet' } } } },
    })
    expect(at(doc, 'paths', '/x', 'get', 'parameters')).toEqual([{ name: 'b', in: 'query' }])
    expect(at(doc, 'paths', '/x', 'get', 'responses', '200', 'content', 'application/json', 'schema')).toEqual({ $ref: '#/components/schemas/Pet' })
  })

  it('a local reference INSIDE another document hoists its target from that document', () => {
    const { doc } = bundled({
      'r/openapi.json': { ...head, paths: { '/x': { get: { responses: { 200: { $ref: 'lib.json#/responses/ok' } } } } } },
      'r/lib.json': {
        responses: { ok: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/schemas/Thing' } } } } },
        schemas: { Thing: { type: 'object', properties: { next: { $ref: '#/schemas/Thing' } } } },
      },
    })
    expect(at(doc, 'components', 'schemas', 'Thing', 'properties', 'next')).toEqual({ $ref: '#/components/schemas/Thing' })
  })
})

describe('discriminator mappings', () => {
  it('follow their members into hoisted models, from the root and from another file', () => {
    const { doc } = bundled({
      'r/openapi.json': {
        ...head,
        components: {
          schemas: {
            Pet: { oneOf: [{ $ref: 'cat.json' }], discriminator: { propertyName: 'k', mapping: { cat: 'cat.json', self: 'openapi.json#/components/schemas/Pet', n: 7 } } },
            Zoo: { $ref: 'zoo.json#/Zoo' },
          },
        },
      },
      'r/cat.json': { type: 'object' },
      'r/zoo.json': { Zoo: { oneOf: [{ $ref: '#/Dog' }], discriminator: { propertyName: 'k', mapping: { dog: '#/Dog', plain: 'Dog' } } }, Dog: { type: 'object' } },
    })
    expect(at(doc, 'components', 'schemas', 'Pet', 'discriminator', 'mapping')).toEqual({
      cat: '#/components/schemas/cat',
      self: '#/components/schemas/Pet',
      n: 7,
    })
    expect(at(doc, 'components', 'schemas', 'Zoo', 'discriminator', 'mapping')).toEqual({ dog: '#/components/schemas/Dog', plain: 'Dog' })
  })
})

describe('what is reported instead of guessed', () => {
  it('a pointer that does not resolve, a document missing from the set, and an adopted target that is gone', () => {
    const files = {
      'r/openapi.json': {
        ...head,
        components: { schemas: { Gone: { $ref: 'missing.json' }, Bad: { $ref: 'lib.json#/nope' } } },
        paths: { '/x': { get: { responses: { 200: { $ref: 'lib.json#/also/nope' } } } } },
      },
      'r/lib.json': {},
    }
    const { doc, codes } = bundled(files)
    expect(codes.filter((c) => c === 'unsupported-ref')).toHaveLength(3)
    expect(at(doc, 'components', 'schemas', 'Gone')).toEqual({})

    // A document the caller never collected (not merely unreadable).
    const r = bundle('r/openapi.json', new Map<string, ReadOutcome>([['r/openapi.json', { doc: files['r/openapi.json'] }]]))
    expect(r.notes.find((n) => n.message.includes('lib.json'))?.message).toContain('could not be read')
  })

  it('refuses a root that is not an object', () => {
    expect(() => bundle('r', new Map<string, ReadOutcome>([['r', { doc: [] }]]))).toThrow(/did not parse to an object/)
  })

  it('names a remote target by its file, ignoring the query string', () => {
    const { doc } = bundled(
      {
        'https://x.test/api/openapi.json': { ...head, paths: { '/x': { get: { responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: 'pet.json?v=2' } } } } } } } } },
        'https://x.test/api/pet.json?v=2': { type: 'string' },
      },
      'https://x.test/api/openapi.json',
    )
    expect(Object.keys(at(doc, 'components', 'schemas') as Json)).toEqual(['pet'])
  })
})
