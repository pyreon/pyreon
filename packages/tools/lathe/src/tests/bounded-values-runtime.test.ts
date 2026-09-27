/**
 * Exclusive bounds, fractional steps, non-string enums and nullable unions --
 * the constraint shapes a generated FIXTURE or FACTORY most easily violates.
 *
 * Both generators are checked by execution: the mock fixture is read back out
 * of the emitted route table, and the faker factory is imported, called many
 * times and validated against the schema emitted by the same run.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { writeTree } from './helpers/write-tree'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import type { IrDocument, IrType } from '../core/ir'
import { emitMocks } from '../emit/mock'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'bounded-values')

/** The JSON body the emitted mock route serves for a response of `type`. */
function mockValue(type: IrType): unknown {
  const doc: IrDocument = {
    title: 'T',
    version: '1',
    baseUrl: '',
    models: [],
    notes: [],
    operations: [
      { id: 'get', method: 'GET', path: '/x', tag: 'x', pathParams: [], queryParams: [], headerParams: [], cookieParams: [], response: type },
    ],
  }
  const text = emitMocks(doc).build('').contents
  const m = /json: ([\s\S]*?),\n {2}\},\n\]/.exec(text)
  if (!m) throw new Error(`no fixture in:\n${text}`)
  return JSON.parse(m[1] as string)
}

describe('mock fixtures honour numeric bounds', () => {
  it('an exclusive integer range lands strictly inside', () => {
    const v = mockValue({ kind: 'number', integer: true, exclusiveMinimum: 10, exclusiveMaximum: 12 }) as number
    expect(v).toBe(11)
  })

  it('a fractional step with exclusive bounds lands on the step, inside', () => {
    const v = mockValue({ kind: 'number', integer: false, exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.25 }) as number
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(1)
    expect(Number.isInteger(v / 0.25)).toBe(true)
  })

  it('an upper bound alone clamps below it', () => {
    const v = mockValue({ kind: 'number', integer: false, exclusiveMaximum: 1, multipleOf: 0.5 }) as number
    expect(v).toBeLessThan(1)
  })

  it('a nullable response serves the non-null shape', () => {
    expect(mockValue({ kind: 'nullable', inner: { kind: 'string', minLength: 9 } })).toMatch(/^sample.{3,}$/)
  })
})

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /b:
    get:
      operationId: getB
      tags: [b]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Bounds' } } } } }
components:
  schemas:
    Bounds:
      type: object
      required: [count, price, level, flag, tags, mixed]
      properties:
        count: { type: integer, exclusiveMinimum: true, minimum: 10, exclusiveMaximum: true, maximum: 20 }
        price: { type: number, minimum: 1, maximum: 5, multipleOf: 0.25 }
        level: { type: integer, enum: [1, 2, 3] }
        flag: { type: boolean, enum: [true] }
        tags: { type: array, uniqueItems: true, maxItems: 3, items: { type: string, enum: [a, b, c, d] } }
        mixed: { oneOf: [{ type: string }, { type: integer }] }
        maybe: { type: string, nullable: true }
`

type Validator = { '~standard': { validate: (v: unknown) => { issues?: readonly unknown[] } } }
let createBounds: (o?: Record<string, unknown>) => Record<string, unknown>
let seedFaker: (seed?: number) => void
let Bounds: Validator

beforeAll(async () => {
  const dir = join(ROOT, 'pyreon')
  mkdirSync(dir, { recursive: true })
  const cfg = resolveConfig({ input: 'x', validator: 'pyreon', plugins: ['schemas', 'faker'] })
  writeTree(dir, generate(SPEC, cfg).files, (p) => p.endsWith('.ts'))
  ;({ createBounds, seedFaker } = (await import(join(dir, 'faker.ts'))) as {
    createBounds: typeof createBounds
    seedFaker: typeof seedFaker
  })
  ;({ Bounds } = (await import(join(dir, 'schemas.ts'))) as { Bounds: Validator })
}, 60_000)

afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

describe('faker factories honour the same bounds', () => {
  it('every draw passes the schema emitted by the same run', () => {
    seedFaker(11)
    for (let i = 0; i < 200; i++) expect(Bounds['~standard'].validate(createBounds()).issues ?? []).toEqual([])
  })

  it('an exclusive integer range never produces an endpoint', () => {
    seedFaker(12)
    for (let i = 0; i < 200; i++) {
      const c = createBounds().count as number
      expect(c).toBeGreaterThan(10)
      expect(c).toBeLessThan(20)
    }
  })

  it('a unique enum array has no duplicates', () => {
    seedFaker(13)
    for (let i = 0; i < 100; i++) {
      const tags = createBounds().tags as string[]
      expect(new Set(tags).size).toBe(tags.length)
    }
  })
})
