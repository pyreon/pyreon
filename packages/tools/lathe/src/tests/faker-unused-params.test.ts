/**
 * Faker builders compile under `noUnusedParameters` (audit A16): a builder
 * that never recurses never reads `d`, and a non-object model never spreads
 * `o`, so both are `_`-prefixed when unread.
 */
import { typecheckSpec } from './helpers/typecheck'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://a.test' }],
  paths: {},
  components: {
    schemas: {
      Leaf: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
      Branch: { type: 'object', required: ['leaf'], properties: { leaf: { $ref: '#/components/schemas/Leaf' } } },
      Tree: { type: 'object', properties: { kids: { type: 'array', items: { $ref: '#/components/schemas/Tree' } } } },
    },
  },
})

describe('faker builders under noUnusedParameters', () => {
  it('typechecks', () => {
    const { errors, result } = typecheckSpec('a16', SPEC, { plugins: ['schemas', 'faker'] }, { noUnused: true })
    expect(errors, errors.join('\n')).toEqual([])
    const faker = result.files.find((f) => f.path === 'faker.ts')?.contents ?? ''
    expect(faker).toContain('function buildLeaf(_d: number, o: Partial<Leaf>')
    expect(faker).toContain('function buildBranch(d: number, o: Partial<Branch>')
  })
})
