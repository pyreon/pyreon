/**
 * Faker factories over the shapes real specs are full of and lathe's own
 * fixtures were not.
 *
 * Each block is a defect that shipped because the emitted source was only ever
 * compared against strings:
 *
 * - an array item or union branch that is an INLINE object rendered as
 *   `() => { id: …, name: … }` -- a block with a label, and with two fields a
 *   syntax error. GitHub's generated `faker.ts` carried 346 of them and did not
 *   parse at all.
 * - a model that is not an object (an array like the OAI petstore's `Pets`, an
 *   enum, a union) got `overrides: Partial<X> = {}`, which does not typecheck
 *   (`{}` is not a `Pet[]`) and was never applied anyway.
 * - the "is recursive in the spec" notice read cycle membership off the
 *   topological sort's back edges, split on `'->'` while the key format is
 *   `from|to` -- so it never fired, for any model.
 *
 * So the output is PARSED, EXECUTED and validated against the schema the same
 * run emitted.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { writeTree } from './helpers/write-tree'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { resolveConfig, type ValidatorName } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'faker-shapes')

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /pets:
    get:
      operationId: listPets
      tags: [p]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Pets' } } } } }
components:
  schemas:
    Pet:
      type: object
      required: [id, labels, shape]
      properties:
        id: { type: integer }
        labels:
          type: array
          items:
            type: object
            required: [key, value]
            properties:
              key: { type: string }
              value: { type: string }
        shape:
          oneOf:
            - { type: object, required: [r], properties: { r: { type: number } } }
            - { type: object, required: [w, h], properties: { w: { type: number }, h: { type: number } } }
    Pets:
      type: array
      items: { $ref: '#/components/schemas/Pet' }
    Mark:
      type: string
      enum: [X, O]
    Either:
      oneOf:
        - { type: string }
        - { $ref: '#/components/schemas/Pet' }
    Cat: { type: object, required: [kind], properties: { kind: { type: string, enum: [cat] } } }
    Dog: { type: object, required: [kind], properties: { kind: { type: string, enum: [dog] }, barks: { type: boolean } } }
    Animal:
      oneOf: [ { $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' } ]
      discriminator: { propertyName: kind }
    Alpha:
      type: object
      properties:
        beta: { $ref: '#/components/schemas/Beta' }
    Beta:
      type: object
      properties:
        gamma: { $ref: '#/components/schemas/Gamma' }
    Gamma:
      type: object
      properties:
        alpha: { $ref: '#/components/schemas/Alpha' }
`

type Validator = { '~standard': { validate: (v: unknown) => { issues?: readonly unknown[] } } }
const loaded = new Map<ValidatorName, { faker: Record<string, (...a: unknown[]) => unknown>; schemas: Record<string, Validator> }>()
let fakerSource = ''

beforeAll(async () => {
  for (const validator of ['pyreon', 'zod'] as const) {
    const cfg = resolveConfig({ input: 'x', validator, plugins: ['schemas', 'faker'] })
    const dir = join(ROOT, validator)
    mkdirSync(dir, { recursive: true })
    const files = generate(SPEC, cfg).files
    writeTree(dir, files, (p) => p.endsWith('.ts'))
    fakerSource = files.find((f) => f.path === 'faker.ts')?.contents ?? ''
    loaded.set(validator, {
      faker: (await import(join(dir, 'faker.ts'))) as never,
      schemas: (await import(join(dir, 'schemas.ts'))) as never,
    })
  }
  // Cold dynamic imports of freshly written TS, one of them `@faker-js/faker`
  // -- the same budget, for the same reason, as `faker-runtime.test.ts`.
}, 60_000)

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('an inline object inside an arrow is parenthesized', () => {
  it('the emitted factories PARSE', () => {
    const { errors } = parseSync('faker.ts', fakerSource)
    expect(errors.map((e) => e.message)).toEqual([])
  })

  it('array items and union branches return object LITERALS, not blocks', () => {
    expect(fakerSource).toMatch(/faker\.helpers\.multiple\(\(\) => \(\{/)
    expect(fakerSource).toMatch(/arrayElement\(\[\(\) => \(\{/)
  })
})

describe('only an object model takes overrides', () => {
  it('a non-object model factory takes no parameter', () => {
    expect(fakerSource).toContain('export function createPets(): Pets {')
    expect(fakerSource).toContain('export function createMark(): Mark {')
    expect(fakerSource).toContain('export function createEither(): Either {')
    expect(fakerSource).toContain('export function createPet(overrides: Partial<Pet> = {}): Pet {')
  })
})

describe('the recursion notice fires for every member of a cycle', () => {
  it('names each model that can reach itself, including the middle of a 3-cycle', () => {
    for (const m of ['Alpha', 'Beta', 'Gamma']) {
      expect(fakerSource).toContain(`\`${m}\` is recursive in the spec`)
    }
  })

  it('does not name a model that cannot', () => {
    for (const m of ['Pet', 'Pets', 'Mark', 'Either', 'Animal']) {
      expect(fakerSource).not.toContain(`\`${m}\` is recursive in the spec`)
    }
  })
})

for (const validator of ['pyreon', 'zod'] as const) {
  describe(`generated ${validator} factories over these shapes`, () => {
    const get = () => loaded.get(validator) as NonNullable<ReturnType<typeof loaded.get>>
    const issues = (schema: Validator, value: unknown): readonly unknown[] =>
      schema['~standard'].validate(value).issues ?? []

    // `Animal` is a discriminated union over NAMED models, which the emit
    // casts through the object-schema type -- this is the runtime half of that.
    for (const name of ['Pet', 'Pets', 'Mark', 'Either', 'Alpha', 'Animal']) {
      it(`create${name}() produces a value its own schema accepts`, () => {
        const { faker, schemas } = get()
        ;(faker.seedFaker as (n: number) => void)(7)
        for (let i = 0; i < 50; i++) {
          const value = (faker[`create${name}`] as () => unknown)()
          expect(issues(schemas[name] as Validator, value)).toEqual([])
        }
      })
    }
  })
}

describe('a discriminated union over named models still dispatches', () => {
  for (const validator of ['pyreon', 'zod'] as const) {
    it(`rejects a value no member accepts (${validator})`, () => {
      const animal = (loaded.get(validator)?.schemas.Animal ?? null) as Validator | null
      expect(animal).not.toBeNull()
      const v = animal as Validator
      expect(v['~standard'].validate({ kind: 'cat' }).issues ?? []).toEqual([])
      expect((v['~standard'].validate({ kind: 'fish' }).issues ?? []).length).toBeGreaterThan(0)
    })
  }
})
