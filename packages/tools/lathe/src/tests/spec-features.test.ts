/**
 * Spec features the reader used to drop without a word, now represented.
 *
 * Each was found by a census over real specs: `allOf` refinements (a
 * required-only part, a later part narrowing a field, an `allOf` member that
 * is itself a `oneOf`), properties shared NEXT TO a `oneOf`, `readOnly` /
 * `writeOnly` (a request had to invent the server's `id`; a response failed
 * on the missing password), operation-level `servers`, server variables and
 * relative server URLs. Each case asserts what the generated SCHEMA accepts
 * or what the generated CLIENT declares -- not just the IR.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { relativeServerAdvice } from '../cli/pull'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { loadOpenApi } from '../input/openapi'
import { cleanupGenerated, issuesOf, loadGeneratedSchemas, type LoadedSchemas } from './helpers/generated-schemas'

const COMPOSITION = `
openapi: 3.1.0
info: { title: T, version: '1' }
paths: {}
components:
  schemas:
    Base:
      type: object
      properties:
        id: { type: string }
        status: { type: string }
    # A required-only refinement: \`x\` stayed optional.
    Strict:
      allOf:
        - { $ref: '#/components/schemas/Base' }
        - { required: [id] }
    # A later part narrowing a field: the first declaration used to win.
    Narrowed:
      allOf:
        - { $ref: '#/components/schemas/Base' }
        - { type: object, properties: { status: { type: string, enum: [open, closed] } } }
    # An allOf member that is a oneOf: silently dropped once fields existed.
    Event:
      allOf:
        - { type: object, required: [at], properties: { at: { type: string } } }
        - oneOf:
            - { type: object, required: [kind, url], properties: { kind: { const: link }, url: { type: string } } }
            - { type: object, required: [kind, text], properties: { kind: { const: note }, text: { type: string } } }
          discriminator: { propertyName: kind }
    # Properties NEXT TO a oneOf: shared by every member, and were dropped.
    Pet:
      type: object
      required: [name]
      properties: { name: { type: string }, kind: { type: string } }
      oneOf:
        - { type: object, required: [kind, meows], properties: { kind: { const: cat }, meows: { type: boolean } } }
        - { type: object, required: [kind, barks], properties: { kind: { const: dog }, barks: { type: boolean } } }
      discriminator: { propertyName: kind }
    # oneOf AND anyOf: must satisfy both; anyOf was dropped.
    Both:
      oneOf: [{ type: object, required: [a], properties: { a: { type: string } } }, { type: object, required: [b], properties: { b: { type: string } } }]
      anyOf: [{ type: object, properties: { c: { type: integer } } }]
    # allOf siblings: additionalProperties was lost.
    Labels:
      allOf: [{ type: object, properties: { id: { type: string } } }]
      additionalProperties: { type: string }
    MaybeUser:
      type: [object, 'null']
      properties: { login: { type: string } }
    OnlyNullable:
      allOf: [{ $ref: '#/components/schemas/MaybeUser' }]
    NotNullable:
      allOf: [{ $ref: '#/components/schemas/MaybeUser' }, { type: object, properties: { extra: { type: string } } }]
`

const loaded = new Map<'pyreon' | 'zod', LoadedSchemas>()
beforeAll(async () => {
  for (const v of ['pyreon', 'zod'] as const) loaded.set(v, await loadGeneratedSchemas(COMPOSITION, v, 'spec-features'))
}, 120_000)
afterAll(() => cleanupGenerated())

for (const v of ['pyreon', 'zod'] as const) {
  describe(`${v}: allOf and oneOf composition validates what the spec says`, () => {
    const ok = (name: string, value: unknown): void => {
      expect(issuesOf(loaded.get(v)?.schemas[name], value), `${name} accepts ${JSON.stringify(value)}`).toEqual([])
    }
    const no = (name: string, value: unknown): void => {
      expect(issuesOf(loaded.get(v)?.schemas[name], value).length, `${name} rejects ${JSON.stringify(value)}`).toBeGreaterThan(0)
    }

    it('a required-only allOf part makes the field required', () => {
      ok('Strict', { id: 'a' })
      no('Strict', { status: 'x' })
    })

    it('a later allOf part narrows a field', () => {
      ok('Narrowed', { status: 'open' })
      no('Narrowed', { status: 'lost' })
    })

    it('an allOf member that is a oneOf distributes, keeping the shared fields', () => {
      ok('Event', { at: 't', kind: 'link', url: 'u' })
      ok('Event', { at: 't', kind: 'note', text: 'x' })
      no('Event', { kind: 'link', url: 'u' })
      no('Event', { at: 't', kind: 'link', text: 'x' })
    })

    it('properties next to a oneOf apply to every member', () => {
      ok('Pet', { name: 'Tom', kind: 'cat', meows: true })
      no('Pet', { kind: 'cat', meows: true })
    })

    it('oneOf AND anyOf are both enforced', () => {
      ok('Both', { a: 'x', c: 1 })
      no('Both', { a: 'x', c: 'not-an-int' })
    })

    it('additionalProperties next to an allOf is kept', () => {
      ok('Labels', { id: 'a', extra: 'b' })
      no('Labels', { id: 'a', extra: 1 })
    })

    it('an allOf is nullable only when every part admits null', () => {
      ok('OnlyNullable', null)
      no('NotNullable', null)
    })
  })
}

describe('readOnly / writeOnly give a model request and response shapes', () => {
  const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test' }]
paths:
  /users:
    post:
      operationId: createUser
      tags: [u]
      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
      responses: { '201': { content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } } }
components:
  schemas:
    User:
      type: object
      required: [id, name, password, team]
      properties:
        id: { type: string, readOnly: true }
        name: { type: string }
        password: { type: string, writeOnly: true }
        team: { $ref: '#/components/schemas/Team' }
    Team:
      type: object
      required: [id, title]
      properties:
        id: { type: integer, readOnly: true }
        title: { type: string }
`

  it('the model keeps the RESPONSE shape and gains an Input variant', () => {
    const { doc } = loadOpenApi(SPEC)
    const fieldsOf = (n: string) => {
      const t = doc.models.find((m) => m.name === n)?.type
      return t?.kind === 'object' ? t.fields.map((f) => f.name) : []
    }
    expect(fieldsOf('User')).toEqual(['id', 'name', 'team'])
    expect(fieldsOf('UserInput')).toEqual(['name', 'password', 'team'])
    expect(fieldsOf('TeamInput')).toEqual(['title'])
    // The nested ref follows the direction.
    const input = doc.models.find((m) => m.name === 'UserInput')?.type
    expect(input?.kind === 'object' && input.fields.find((f) => f.name === 'team')?.type).toEqual({ kind: 'ref', name: 'TeamInput' })
    const op = doc.operations[0]
    expect(op?.body?.type).toEqual({ kind: 'ref', name: 'UserInput' })
    expect(op?.response).toEqual({ kind: 'ref', name: 'User' })
  })

  it('the generated mutation takes the Input shape', () => {
    // The input type is declared on the ENDPOINT; the hook derives it.
    const files = generate(SPEC, resolveConfig({ input: 'x' })).files
    const endpoints = files.find((f) => f.path === 'endpoints/u.ts')?.contents ?? ''
    expect(endpoints).toContain('json?: UserInput | undefined')
  })

  for (const v of ['pyreon', 'zod'] as const) {
    it(`${v}: a response without the writeOnly password validates`, async () => {
      const { schemas } = await loadGeneratedSchemas(SPEC, v, 'spec-features-direction')
      expect(issuesOf(schemas.User, { id: 'u1', name: 'Ada', team: { id: 1, title: 't' } })).toEqual([])
    }, 60_000)
  }
})

describe('servers', () => {
  const spec = (servers: unknown, paths: Record<string, unknown> = {}): string =>
    JSON.stringify({ openapi: '3.0.3', info: { title: 'T', version: '1' }, servers, paths })

  it('substitutes server variables with their defaults', () => {
    const { doc } = loadOpenApi(
      spec([{ url: 'https://{region}.api.test/{version}', variables: { region: { default: 'eu' }, version: { default: 'v2' } } }]),
    )
    expect(doc.baseUrl).toBe('https://eu.api.test/v2')
  })

  it('an operation-level server travels with that operation, on web and native', () => {
    const src = spec([{ url: 'https://api.box.test/2.0' }], {
      '/files/content': {
        post: {
          operationId: 'upload',
          tags: ['f'],
          servers: [{ url: 'https://upload.box.test/api/2.0' }],
          responses: { '200': { description: 'ok' } },
        },
        get: { operationId: 'list', tags: ['f'], responses: { '200': { description: 'ok' } } },
      },
    })
    const { doc } = loadOpenApi(src)
    expect(doc.operations.find((o) => o.id === 'upload')?.baseUrl).toBe('https://upload.box.test/api/2.0')
    expect(doc.operations.find((o) => o.id === 'list')?.baseUrl).toBeUndefined()
    const web = generate(src, resolveConfig({ input: 'x' })).files.find((f) => f.path === 'endpoints/f.ts')?.contents
    expect(web).toContain("('POST https://upload.box.test/api/2.0/files/content'")
    const native = generate(src, resolveConfig({ input: 'x', target: 'multiplatform' })).files.find((f) =>
      f.path.endsWith('.native.tsx'),
    )?.contents
    expect(native).toContain("const api2 = createHttp({ baseUrl: 'https://upload.box.test/api/2.0'")
    expect(native).toContain("api2.endpoint('POST /files/content'")
  })

  it('a RELATIVE server is reported, and resolved when the spec URL is known', () => {
    const src = spec([{ url: '/api/v3' }])
    const plain = loadOpenApi(src).doc
    expect(plain.baseUrl).toBe('/api/v3')
    expect(plain.notes.some((n) => /RELATIVE/.test(n.message))).toBe(true)
    const resolved = loadOpenApi(src, { sourceUrl: 'https://petstore3.swagger.io/api/v3/openapi.json' }).doc
    expect(resolved.baseUrl).toBe('https://petstore3.swagger.io/api/v3')
    expect(relativeServerAdvice(JSON.parse(src), 'https://petstore3.swagger.io/api/v3/openapi.json')).toContain(
      "baseUrl: 'https://petstore3.swagger.io/api/v3'",
    )
  })
})
