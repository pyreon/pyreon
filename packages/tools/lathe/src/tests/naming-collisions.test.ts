/**
 * Spec names that NORMALIZE to the same identifier must stay distinct.
 *
 * Every generated name is derived (`user_profile` -> `UserProfile`), and
 * derivation is many-to-one. Found on the audit's collision probe: models
 * `User`, `User2`, `user` became `User`, `User2`, `User2`, so one schema
 * overwrote another and a `$ref: User2` (an integer) silently validated as the
 * boolean; `getUser` / `getUser2` / `get_user` did the same to operations;
 * `{a-b}` and `{a_b}` put two `:aB` segments in one path; and tags `Users` and
 * `users` both wrote `endpoints/users.ts`, one replacing the other. Nothing is
 * ever DROPPED to resolve a collision -- every spec entity keeps an output.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { loadOpenApi } from '../input/openapi'
import { cleanupGenerated, issuesOf, loadGeneratedSchemas } from './helpers/generated-schemas'

const op = (id: string, tag: string) => ({
  operationId: id,
  tags: [tag],
  responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'string' } } } } },
})

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/a': { get: op('getUser', 'Users') },
    '/b': { get: op('getUser2', 'users') },
    '/c': { get: op('get_user', 'users') },
    '/x/{a-b}/{a_b}': {
      get: {
        ...op('both', 'misc'),
        parameters: [
          { name: 'a-b', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'a_b', in: 'path', required: true, schema: { type: 'integer' } },
        ],
      },
    },
  },
  components: {
    schemas: {
      User: { type: 'string' },
      User2: { type: 'integer' },
      user: { type: 'boolean' },
      Record: { type: 'object', additionalProperties: { type: 'string' } },
      Holder: {
        type: 'object',
        required: ['v', 'r'],
        properties: { v: { $ref: '#/components/schemas/User2' }, r: { $ref: '#/components/schemas/Record' } },
      },
    },
  },
})

afterAll(() => cleanupGenerated())

describe('models', () => {
  it('assigns a distinct name to every schema, keeping exact names', () => {
    const names = loadOpenApi(SPEC).doc.models.map((m) => m.name).sort()
    expect(names).toEqual(['Holder', 'Record_', 'User', 'User2', 'User3'])
  })

  for (const validator of ['pyreon', 'zod'] as const) {
    it(`${validator}: a $ref binds to the schema it NAMES`, async () => {
      const { schemas } = await loadGeneratedSchemas(SPEC, validator, 'naming-collisions')
      expect(issuesOf(schemas.Holder, { v: 3, r: {} })).toEqual([])
      // The pre-fix binding: `User2` was the boolean.
      expect(issuesOf(schemas.Holder, { v: true, r: {} }).length).toBeGreaterThan(0)
    }, 60_000)
  }
})

describe('operations, path parameters and tags', () => {
  const { doc } = loadOpenApi(SPEC)

  it('gives every operation its own id', () => {
    expect(doc.operations.map((o) => o.id).sort()).toEqual(['both', 'getUser', 'getUser2', 'getUser3'])
  })

  it('gives each path placeholder its own identifier, matched by its parameter', () => {
    const both = doc.operations.find((o) => o.id === 'both')
    expect(both?.path).toBe('/x/:aB/:aB2')
    expect(both?.pathParams.map((p) => [p.name, p.type.kind])).toEqual([
      ['aB', 'string'],
      ['aB2', 'number'],
    ])
  })

  it('writes one file per tag even when tags differ only in case', () => {
    const files = generate(SPEC, resolveConfig({ input: 'x' })).files.map((f) => f.path)
    const endpoints = files.filter((f) => f.startsWith('endpoints/') && f !== 'endpoints/index.ts')
    expect(new Set(endpoints.map((f) => f.toLowerCase())).size).toBe(endpoints.length)
    expect(endpoints).toContain('endpoints/users.ts')
    expect(endpoints).toContain('endpoints/users-2.ts')
    // Nothing dropped: every operation is exported by some endpoint file.
    const all = generate(SPEC, resolveConfig({ input: 'x' }))
      .files.filter((f) => f.path.startsWith('endpoints/'))
      .map((f) => f.contents)
      .join('\n')
    for (const id of ['getUser', 'getUser2', 'getUser3', 'both']) expect(all).toContain(`export const ${id} =`)
  })
})
