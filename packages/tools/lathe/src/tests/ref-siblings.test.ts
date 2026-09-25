/**
 * Keywords next to a `$ref`.
 *
 * 3.1 (JSON Schema 2020-12) makes a `$ref` one assertion among its siblings, and
 * 3.0 specs carry them anyway -- OpenAI's has 34. They were ignored: a
 * `{ $ref: Code, maxLength: 3 }` accepted any length, a
 * `{ $ref: Base, required: [id] }` left `id` optional. Constraining siblings now
 * merge with the target; annotation-only ones keep the plain named reference.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'
import { cleanupGenerated, issuesOf, loadGeneratedSchemas } from './helpers/generated-schemas'

const SPEC = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: {
    schemas: {
      Code: { type: 'string', minLength: 1 },
      Base: { type: 'object', properties: { id: { type: 'string' }, n: { type: 'integer' } } },
      Holder: {
        type: 'object',
        required: ['code', 'base', 'plain'],
        properties: {
          code: { $ref: '#/components/schemas/Code', maxLength: 3 },
          base: { $ref: '#/components/schemas/Base', required: ['id'] },
          plain: { $ref: '#/components/schemas/Code', description: 'just a note', readOnly: false },
          maybe: { $ref: '#/components/schemas/Code', nullable: true },
        },
      },
    },
  },
})

afterAll(() => cleanupGenerated())

describe('$ref siblings', () => {
  const holder = loadOpenApi(SPEC).doc.models.find((m) => m.name === 'Holder')?.type
  const field = (name: string) => (holder?.kind === 'object' ? holder.fields.find((f) => f.name === name)?.type : undefined)

  it('annotation-only siblings keep the NAMED reference', () => {
    expect(field('plain')).toEqual({ kind: 'ref', name: 'Code' })
    expect(field('maybe')).toEqual({ kind: 'nullable', inner: { kind: 'ref', name: 'Code' } })
  })

  it('a constraining sibling merges with the target', () => {
    expect(field('code')).toMatchObject({ kind: 'string', minLength: 1, maxLength: 3 })
  })

  for (const validator of ['pyreon', 'zod'] as const) {
    it(`${validator}: the merged constraints are enforced`, async () => {
      const { schemas } = await loadGeneratedSchemas(SPEC, validator, 'ref-siblings')
      expect(issuesOf(schemas.Holder, { code: 'abc', base: { id: 'x' }, plain: 'p' })).toEqual([])
      expect(issuesOf(schemas.Holder, { code: 'abcd', base: { id: 'x' }, plain: 'p' }).length).toBeGreaterThan(0)
      expect(issuesOf(schemas.Holder, { code: 'abc', base: { n: 1 }, plain: 'p' }).length).toBeGreaterThan(0)
    }, 60_000)
  }
})
