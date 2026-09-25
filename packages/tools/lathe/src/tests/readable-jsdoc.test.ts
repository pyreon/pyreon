/**
 * The generated JSDoc is written for the person hovering a symbol: the spec's
 * summary AND description, what each parameter means, `@deprecated` where the
 * spec says so, a copyable `@example`, a `@see` link, and field-level docs on
 * the model interfaces.
 *
 * `description`, `deprecated` (operation, parameter, property, schema) and
 * `externalDocs` used to be dropped -- `deprecated` and `description-dropped`
 * existed as notes saying so. Honoured now, both notes are gone.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type PluginName } from '../core/config'
import { generate } from '../core/generate'
import { loadOpenApi } from '../input/openapi'
import { jsLiteral, sampleArgs } from '../emit/jsdoc'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const HERE = dirname(fileURLToPath(import.meta.url))
const PETSTORE3 = readFileSync(join(HERE, 'fixtures', 'petstore3.json'), 'utf8')

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Zoo', version: '2' },
  servers: [{ url: 'https://zoo.test' }],
  paths: {
    '/animals/{id}': {
      get: {
        operationId: 'getAnimal',
        tags: ['animals'],
        summary: 'Fetch one animal.',
        description: 'Returns the animal with the given id.\n\nArchived animals are included.',
        externalDocs: { url: 'https://docs.zoo.test/animals', description: 'Animal guide' },
        parameters: [
          { name: 'id', in: 'path', required: true, description: 'The animal id.', schema: { type: 'integer' }, example: 42 },
          { name: 'legacy', in: 'query', deprecated: true, description: 'Old flag.', schema: { type: 'boolean' } },
        ],
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Animal' } } } } },
      },
      delete: {
        operationId: 'removeAnimal',
        tags: ['animals'],
        summary: 'Remove an animal.',
        deprecated: true,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '204': { description: 'gone' } },
      },
    },
    '/animals': {
      post: {
        operationId: 'addAnimal',
        tags: ['animals'],
        summary: 'Add an animal.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Animal' }, example: { name: 'Rex', legs: 4 } } },
        },
        responses: { '201': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Animal' } } } } },
      },
    },
  },
  components: {
    schemas: {
      Animal: {
        type: 'object',
        description: 'Something that lives at the zoo.',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'What the keepers call it.', example: 'Rex' },
          legs: { type: 'integer' },
          tag: { type: 'string', deprecated: true },
        },
      },
      Cage: { type: 'object', deprecated: true, properties: { size: { type: 'integer' } } },
    },
  },
})

const PLUGINS: PluginName[] = ['schemas', 'client', 'queries', 'mocks', 'components']
const gen = (spec = SPEC, plugins = PLUGINS) => generate(spec, resolveConfig({ input: 'x', plugins }))
const fileOf = (out: ReturnType<typeof gen>, path: string): string => {
  const f = out.files.find((x) => x.path === path)
  if (!f) throw new Error(`no ${path}`)
  return f.contents
}
/** The JSDoc block immediately above `marker`. */
const blockAbove = (src: string, marker: string): string => {
  const at = src.indexOf(marker)
  if (at < 0) throw new Error(`no ${marker}`)
  const start = src.lastIndexOf('/**', at)
  return src.slice(start, at)
}

afterAll(() => cleanTypecheck('readable-jsdoc'))

describe('operation JSDoc', () => {
  const out = gen()
  const endpoints = fileOf(out, 'endpoints/animals.ts')
  const queries = fileOf(out, 'queries/animals.ts')

  it('carries the summary, the description paragraphs and the wire line', () => {
    const b = blockAbove(endpoints, 'export const getAnimal')
    expect(b).toContain(' * Fetch one animal.\n *\n * Returns the animal with the given id.\n *\n * Archived animals are included.')
    expect(b).toContain(' * `GET /animals/:id`')
  })

  it('documents every parameter with its location, optionality and description', () => {
    const b = blockAbove(endpoints, 'export const getAnimal')
    expect(b).toContain(' * - `id` (path) — The animal id.')
    expect(b).toContain(' * - `legacy` (query, optional, deprecated) — Old flag.')
  })

  it('marks a deprecated operation on the endpoint AND the hook', () => {
    expect(blockAbove(endpoints, 'export const removeAnimal')).toContain('@deprecated')
    expect(blockAbove(queries, 'export function useRemoveAnimal')).toContain('@deprecated')
    expect(blockAbove(endpoints, 'export const getAnimal')).not.toContain('@deprecated')
  })

  it('shows a copyable example built from the spec examples', () => {
    // The path parameter's own `example` (42) and the body's media example.
    expect(blockAbove(endpoints, 'export const getAnimal')).toContain(
      'const result = await getAnimal({ params: { id: 42 } })',
    )
    expect(blockAbove(queries, 'export function useGetAnimal')).toContain(
      'const q = useGetAnimal(() => ({ params: { id: 42 } }))',
    )
    const add = blockAbove(queries, 'export function useAddAnimal')
    expect(add).toContain("m.mutate({ json: { name: 'Rex', legs: 4 } })")
    // No response body: the example does not bind a result it cannot have.
    expect(blockAbove(endpoints, 'export const removeAnimal')).toContain('await removeAnimal({ params: { id: 1 } })')
  })

  it('links externalDocs', () => {
    expect(blockAbove(endpoints, 'export const getAnimal')).toContain(
      '@see {@link https://docs.zoo.test/animals Animal guide}',
    )
  })

  it('no longer reports what it now honours', () => {
    const codes = loadOpenApi(SPEC).doc.notes.map((n) => n.code as string)
    expect(codes).not.toContain('deprecated')
    expect(codes).not.toContain('description-dropped')
  })
})

describe('model JSDoc', () => {
  const schema = fileOf(gen(), 'schemas/Animal.ts')

  it('documents the model and each field', () => {
    expect(schema).toContain('/** Something that lives at the zoo. */\nexport interface Animal {')
    expect(schema).toContain("  /**\n   * What the keepers call it.\n   * @example 'Rex'\n   */\n  name: string")
    expect(schema).toContain('  /** @deprecated */\n  tag?: string | undefined')
    // A field the spec says nothing about gets no empty block.
    expect(schema).toContain('  legs?: number | undefined')
    expect(schema).not.toMatch(/\/\*\*\s*\*\/\n {2}legs/)
  })

  it('marks a deprecated schema', () => {
    expect(fileOf(gen(), 'schemas/Cage.ts')).toContain('@deprecated The spec marks this schema deprecated.')
  })
})

describe('the generated files read as documentation, not generator notes', () => {
  const out = gen(PETSTORE3, ['schemas', 'client', 'queries', 'mocks', 'faker', 'components', 'atlas'])

  it('one short header', () => {
    const head = fileOf(out, 'client.ts').split('\n').slice(0, 4)
    expect(head).toEqual([
      '/* eslint-disable */',
      '// @generated by @pyreon/lathe from Swagger Petstore - OpenAPI 3.0 1.0.27.',
      '// Do not edit: change the spec and run `lathe generate`.',
      '',
    ])
  })

  it('no audit references, measurements or generator internals in any doc block', () => {
    for (const f of out.files.filter((x) => /\.tsx?$/.test(x.path))) {
      const docs = [...f.contents.matchAll(/\/\*\*[\s\S]*?\*\//g)].map((m) => m[0]).join('\n')
      expect(docs, f.path).not.toMatch(/\baudit [A-Z]\d|\bmeasured\b|\bemitter\b|\bPMTC\b|\bdx D\d/)
    }
  })

  it('examples name real symbols from THIS spec, never a placeholder API', () => {
    // keys.ts and faker.ts used to show `keys.books…` / `createBook()` whatever the spec.
    expect(fileOf(out, 'keys.ts')).toContain('keys.pet.findPetsByStatus.all')
    expect(fileOf(out, 'faker.ts')).toContain('createApiResponse()')
    expect(fileOf(out, 'keys.ts')).not.toContain('keys.books')
  })

  it('is deterministic', () => {
    const again = gen(PETSTORE3, ['schemas', 'client', 'queries', 'mocks', 'faker', 'components', 'atlas'])
    expect(again.files).toEqual(out.files)
  })
})

describe('sample arguments', () => {
  const { doc } = loadOpenApi(PETSTORE3)
  const op = (id: string) => doc.operations.find((o) => o.id === id)!

  it('fill every required input, using spec examples where they fit', () => {
    expect(sampleArgs(op('getPetById'), doc)).toEqual({ params: { petId: 1 } })
    // An enum query parameter gets its first value; an optional one is left out.
    expect(sampleArgs(op('findPetsByStatus'), doc)).toEqual({ query: { status: 'available' } })
    expect(sampleArgs(op('getInventory'), doc)).toBeUndefined()
  })

  it('renders as a TypeScript literal that fits the line when it can', () => {
    expect(jsLiteral({ params: { petId: 1 }, 'x-y': ['a', 'b'] })).toBe(`{ params: { petId: 1 }, "x-y": ['a', 'b'] }`)
    expect(jsLiteral({ a: 'x'.repeat(90) })).toBe(`{\n  a: '${'x'.repeat(90)}',\n}`)
  })
})

describe('the documented output still typechecks', () => {
  it('including the field comments and example-derived preview arguments', () => {
    const { errors } = typecheckSpec('readable-jsdoc', SPEC, { plugins: PLUGINS })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
