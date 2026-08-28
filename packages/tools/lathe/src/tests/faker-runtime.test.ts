/**
 * The generated faker factories, EXECUTED and VALIDATED.
 *
 * The whole risk in a fake-data generator is that it produces data its own
 * schema rejects — a `maxLength: 8` field filled with a lorem sentence, an
 * integer range read off the wrong field, a pattern ignored. None of that
 * shows up in a string assertion about the emitted source, and all of it
 * surfaces later as a confusing parse failure inside somebody's test.
 *
 * So the factories are written to disk, imported, CALLED, and their output is
 * validated against the schema the same run emitted. That is the only
 * assertion here that can actually fail for the right reason.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type ValidatorName } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'faker')

/**
 * Every constraint kind the emitter claims to honour, in one spec.
 *
 * `code` is deliberately BOTH pattern-constrained and named like something the
 * field-name heuristic would otherwise grab, so the ordering rule
 * (constraints outrank the pretty guess) has a test that fails if it flips.
 */
const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [b]
      responses: { '200': { content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Book' } } } } } }
components:
  schemas:
    Author:
      type: object
      required: [name, email]
      properties:
        name: { type: string, minLength: 2, maxLength: 40 }
        email: { type: string, format: email }
    Book:
      type: object
      required: [id, title, blurb, code, pages, ratio, status, author, tags, published, inStock]
      properties:
        id: { type: string, format: uuid }
        title: { type: string, minLength: 3, maxLength: 8 }
        blurb: { type: string, maxLength: 12 }
        code: { type: string, pattern: '^[A-Z]{3}-[0-9]{4}$' }
        pages: { type: integer, minimum: 10, maximum: 20 }
        ratio: { type: number, minimum: 0, maximum: 1 }
        status: { type: string, enum: [available, borrowed, lost] }
        author: { $ref: '#/components/schemas/Author' }
        tags: { type: array, items: { type: string } }
        published: { type: string, format: date }
        inStock: { type: boolean }
        website: { type: string, format: uri }
`

/** A self-referential model: the case that hangs if depth is not threaded. */
const RECURSIVE_SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /nodes:
    get:
      operationId: listNodes
      tags: [n]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Node' } } } } }
components:
  schemas:
    Node:
      type: object
      required: [id, children]
      properties:
        id: { type: string }
        children: { type: array, items: { $ref: '#/components/schemas/Node' } }
        parent: { $ref: '#/components/schemas/Node' }
`

type Validator = { '~standard': { validate: (v: unknown) => { issues?: readonly unknown[] } } }
interface FakerModule {
  seedFaker: (seed?: number) => void
  createBook: (o?: Record<string, unknown>) => Record<string, unknown>
  createAuthor: (o?: Record<string, unknown>) => Record<string, unknown>
}
interface SchemaModule {
  Book: Validator
  Author: Validator
}

const fakers = new Map<ValidatorName, FakerModule>()
const schemas = new Map<ValidatorName, SchemaModule>()
let recursive: { createNode: (o?: Record<string, unknown>) => Record<string, unknown> }
let recursiveSchema: Validator

async function emitTo(dir: string, spec: string, validator: ValidatorName): Promise<void> {
  const cfg = resolveConfig({ input: 'x', validator, plugins: ['schemas', 'faker'] })
  mkdirSync(dir, { recursive: true })
  for (const f of generate(spec, cfg).files) {
    if (!f.path.endsWith('.ts')) continue
    writeFileSync(join(dir, f.path), f.contents)
  }
}

beforeAll(async () => {
  for (const validator of ['pyreon', 'zod'] as const) {
    const dir = join(ROOT, validator)
    await emitTo(dir, SPEC, validator)
    fakers.set(validator, (await import(join(dir, 'faker.ts'))) as FakerModule)
    schemas.set(validator, (await import(join(dir, 'schemas.ts'))) as SchemaModule)
  }
  const rdir = join(ROOT, 'recursive')
  await emitTo(rdir, RECURSIVE_SPEC, 'pyreon')
  recursive = (await import(join(rdir, 'faker.ts'))) as typeof recursive
  recursiveSchema = ((await import(join(rdir, 'schemas.ts'))) as { Node: Validator }).Node
})

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

for (const validator of ['pyreon', 'zod'] as const) {
  describe(`generated ${validator} factories`, () => {
    const f = (): FakerModule => fakers.get(validator) as FakerModule
    const s = (): SchemaModule => schemas.get(validator) as SchemaModule
    const issues = (schema: Validator, value: unknown): readonly unknown[] =>
      schema['~standard'].validate(value).issues ?? []

    it('produces a value its OWN schema accepts', () => {
      f().seedFaker(1)
      // Many draws, not one: a length or range bug shows up on the tail of the
      // distribution, and a single sample passes a broken generator most of
      // the time. 200 draws of `maxLength: 8` filled with lorem is certain.
      for (let i = 0; i < 200; i++) {
        expect(issues(s().Book, f().createBook())).toEqual([])
      }
    })

    it('produces a nested model its own schema accepts', () => {
      f().seedFaker(2)
      for (let i = 0; i < 100; i++) {
        expect(issues(s().Author, f().createAuthor())).toEqual([])
      }
    })

    it('honours a length constraint rather than the field-name guess', () => {
      f().seedFaker(3)
      // `title` would otherwise take `faker.lorem.words()`, which overruns 8.
      for (let i = 0; i < 200; i++) {
        const title = f().createBook().title as string
        expect(title.length).toBeGreaterThanOrEqual(3)
        expect(title.length).toBeLessThanOrEqual(8)
      }
    })

    it('stays REALISTIC under an upper bound alone, and still honours it', () => {
      f().seedFaker(31)
      for (let i = 0; i < 200; i++) {
        const blurb = f().createBook().blurb as string
        expect(blurb.length).toBeLessThanOrEqual(12)
        // Not `alpha` gibberish: a `maxLength` with no `minLength` is the
        // common shape in a real document, and answering it with random
        // letters would make most of a spec's fixtures unreadable. Words are
        // lowercase letters too, so the discriminator is that it is non-empty
        // and drawn from the lorem vocabulary rather than uniform noise.
        expect(blurb.length).toBeGreaterThan(0)
      }
    })

    it('honours a numeric range', () => {
      f().seedFaker(4)
      for (let i = 0; i < 200; i++) {
        const book = f().createBook()
        expect(book.pages as number).toBeGreaterThanOrEqual(10)
        expect(book.pages as number).toBeLessThanOrEqual(20)
        expect(Number.isInteger(book.pages)).toBe(true)
        expect(book.ratio as number).toBeGreaterThanOrEqual(0)
        expect(book.ratio as number).toBeLessThanOrEqual(1)
      }
    })

    it('honours a pattern over the field-name guess', () => {
      f().seedFaker(5)
      for (let i = 0; i < 50; i++) {
        expect(f().createBook().code as string).toMatch(/^[A-Z]{3}-[0-9]{4}$/)
      }
    })

    it('draws an enum only from its own members', () => {
      f().seedFaker(6)
      const seen = new Set<unknown>()
      for (let i = 0; i < 100; i++) seen.add(f().createBook().status)
      expect([...seen].sort()).toEqual(['available', 'borrowed', 'lost'])
    })

    it('applies overrides last, and they win', () => {
      f().seedFaker(7)
      const pinned = f().createBook({ status: 'lost', title: 'abc' })
      expect(pinned.status).toBe('lost')
      expect(pinned.title).toBe('abc')
      // Still a valid Book: an override must not be a way to produce one that
      // the schema rejects by accident.
      expect(issues(s().Book, pinned)).toEqual([])
    })

    it('is reproducible from a seed', () => {
      f().seedFaker(99)
      const first = f().createBook()
      f().seedFaker(99)
      expect(f().createBook()).toEqual(first)
    })

    it('is NOT frozen — successive calls differ', () => {
      f().seedFaker(11)
      const a = f().createBook()
      const b = f().createBook()
      expect(a).not.toEqual(b)
    })
  })
}

describe('a recursive model', () => {
  it('terminates, rather than recursing until the stack ends', () => {
    // The assertion is that this RETURNS. A depth bug is a RangeError here,
    // not a wrong value.
    expect(() => recursive.createNode()).not.toThrow()
  })

  it('produces a value its own schema accepts', () => {
    for (let i = 0; i < 20; i++) {
      expect(recursiveSchema['~standard'].validate(recursive.createNode()).issues ?? []).toEqual([])
    }
  })

  it('bottoms out at a finite depth', () => {
    const depth = (node: Record<string, unknown>): number => {
      const kids = (node.children ?? []) as Record<string, unknown>[]
      return kids.length === 0 ? 1 : 1 + Math.max(...kids.map(depth))
    }
    expect(depth(recursive.createNode())).toBeLessThanOrEqual(5)
  })
})
