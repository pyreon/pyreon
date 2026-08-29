/**
 * The generated zod schemas, EXECUTED.
 *
 * Emitting `z.object({ … })` is easy to do plausibly and wrongly: a spelling
 * that exists in zod 3 and not 4 (or the reverse), a constraint attached to the
 * wrong kind, an optional/nullable pair in an order that changes the inferred
 * type. None of that shows up in a string assertion.
 *
 * So the emitted `schemas.ts` is written to disk, imported, and run against
 * values that should pass and values that should fail — and its inferred TYPE
 * is checked by the package typecheck, since the file is real TypeScript on
 * disk under `src/`.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type ValidatorName } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'validator')

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
      required: [name]
      properties:
        name: { type: string, minLength: 2 }
        email: { type: string, format: email }
    Book:
      type: object
      required: [id, title, author, status]
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        pages: { type: integer, minimum: 1 }
        status: { type: string, enum: [available, borrowed] }
        author: { $ref: '#/components/schemas/Author' }
        tags: { type: array, items: { type: string } }
`

interface Schemas {
  Book: { '~standard': { validate: (v: unknown) => { issues?: readonly unknown[] } } }
  Author: { '~standard': { validate: (v: unknown) => { issues?: readonly unknown[] } } }
}

const modules = new Map<ValidatorName, Schemas>()

beforeAll(async () => {
  for (const validator of ['pyreon', 'zod'] as const) {
    const cfg = resolveConfig({ input: 'x', validator, plugins: ['schemas'] })
    const file = generate(SPEC, cfg).files.find((f) => f.path === 'schemas.ts')
    if (!file) throw new Error('no schemas.ts')
    const dir = join(ROOT, validator)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'schemas.ts'), file.contents)
    modules.set(validator, (await import(join(dir, 'schemas.ts'))) as Schemas)
  }
  // 60s, against vitest's 10s hook default, which this hook blew under load.
  //
  // Same class as `faker-runtime.test.ts`: the hook writes TypeScript and then
  // COLD-imports it, so each import pays a vitest transform of a file that
  // cannot be cached because it did not exist a moment ago, and one pulls
  // `zod`. Fewer imports than that sibling, but the cost here is dominated by
  // cold transform under contention rather than by the import COUNT, so a
  // proportionally smaller budget would just move the cliff instead of
  // removing it.
  //
  // A generous hook budget is close to free: it does not slow the happy path,
  // it only bounds how long a genuinely hung hook takes to report.
}, 60_000)

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

const VALID = {
  id: '00000000-0000-4000-8000-000000000000',
  title: 'Dune',
  pages: 412,
  status: 'available',
  author: { name: 'Frank', email: 'f@example.com' },
  tags: ['scifi'],
}

const validate = (validator: ValidatorName, value: unknown): readonly unknown[] => {
  const mod = modules.get(validator)
  if (!mod) throw new Error(`no module for ${validator}`)
  return mod.Book['~standard'].validate(value).issues ?? []
}

for (const validator of ['pyreon', 'zod'] as const) {
  describe(`generated ${validator} schemas`, () => {
    it('accepts a value the spec describes', () => {
      expect(validate(validator, VALID)).toEqual([])
    })

    it('rejects a missing required field', () => {
      const { title: _drop, ...rest } = VALID
      expect(validate(validator, rest).length).toBeGreaterThan(0)
    })

    it('rejects a wrong primitive type', () => {
      expect(validate(validator, { ...VALID, pages: 'many' }).length).toBeGreaterThan(0)
    })

    it('accepts an absent OPTIONAL field', () => {
      const { pages: _drop, ...rest } = VALID
      expect(validate(validator, rest)).toEqual([])
    })

    it('enforces an enum from the spec', () => {
      expect(validate(validator, { ...VALID, status: 'on-fire' }).length).toBeGreaterThan(0)
    })

    it('enforces a minimum from the spec', () => {
      expect(validate(validator, { ...VALID, pages: 0 }).length).toBeGreaterThan(0)
    })

    it('enforces a format from the spec', () => {
      expect(validate(validator, { ...VALID, id: 'not-a-uuid' }).length).toBeGreaterThan(0)
    })

    it('validates a REFERENCED model through the field that names it', () => {
      // The `$ref` is emitted as the model's own binding, so a nested value
      // that violates the referenced schema has to fail here too.
      expect(validate(validator, { ...VALID, author: { name: 'F' } }).length).toBeGreaterThan(0)
    })

    it('enforces the element type of an array', () => {
      expect(validate(validator, { ...VALID, tags: [1] }).length).toBeGreaterThan(0)
    })

    it('is a Standard Schema, so any consumer can validate it uniformly', () => {
      // This is what lets `@pyreon/http` — and the generated adapter clients —
      // accept either library without knowing which was chosen.
      const mod = modules.get(validator)
      expect(typeof mod?.Book['~standard'].validate).toBe('function')
    })
  })
}

describe('the two validators agree on what is valid', () => {
  const cases: [string, unknown][] = [
    ['a complete value', VALID],
    ['a missing required field', { ...VALID, title: undefined }],
    ['a wrong enum member', { ...VALID, status: 'x' }],
    ['a bad nested model', { ...VALID, author: { name: 'F' } }],
    ['a bad array element', { ...VALID, tags: [1] }],
    ['a below-minimum integer', { ...VALID, pages: 0 }],
  ]
  for (const [name, value] of cases) {
    it(name, () => {
      // Not the same MESSAGES — each library words its own. The contract that
      // matters is the verdict, because that is what a request either passes
      // or fails on, and it must not depend on a config word.
      const pyreonOk = validate('pyreon', value).length === 0
      const zodOk = validate('zod', value).length === 0
      expect(zodOk, `pyreon=${pyreonOk} zod=${zodOk}`).toBe(pyreonOk)
    })
  }
})
