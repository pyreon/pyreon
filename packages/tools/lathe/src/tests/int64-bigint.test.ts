/**
 * `int64: 'bigint'` — what each layer emits, and that the default is untouched.
 *
 * The end-to-end proof (a real server, every client × schema library) is
 * `int64-bigint-runtime.test.ts`; the typecheck of every plugin's output is in
 * `generated-typecheck.test.ts`. This file pins the pieces: the option is
 * validated, the IR reads int64 as `bigint` only when asked, the default mode
 * is byte-identical, each emitter spells the bigint form, and the notes say
 * what the mode does and does not cover.
 */
import { describe, expect, it } from 'vitest'
import { resolveConfig, type LatheSection } from '../core/config'
import { generate } from '../core/generate'
import { extractSurface, diffSurface } from '../core/surface'
import { loadOpenApi } from '../input/openapi'

const spec = (schemas: Record<string, unknown>, paths: Record<string, unknown> = {}): string =>
  JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'T', version: '1' },
    servers: [{ url: 'https://t.test' }],
    paths,
    components: { schemas },
  })

const ENTRY = {
  Entry: {
    type: 'object',
    required: ['id', 'amount'],
    properties: {
      id: { type: 'integer', format: 'int64', minimum: 1 },
      amount: { type: 'number' },
      count: { type: 'integer', format: 'int32' },
      refs: { type: 'array', items: { type: 'integer', format: 'int64' } },
    },
  },
}

const PATHS = {
  '/entries/{id}': {
    get: {
      operationId: 'getEntry',
      tags: ['e'],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', format: 'int64' } }],
      responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Entry' } } } } },
    },
  },
}

const run = (section: Omit<LatheSection, 'input'>, text = spec(ENTRY, PATHS)) =>
  generate(text, resolveConfig({ input: 'x', plugins: ['schemas', 'client', 'mocks', 'faker'], ...section }))

const file = (files: readonly { path: string; contents: string }[], path: string): string =>
  files.find((f) => f.path === path)?.contents ?? ''

describe('the int64 option', () => {
  it('defaults to number', () => {
    expect(resolveConfig({ input: 'x' }).int64).toBe('number')
  })

  it('rejects an unknown mode, naming the known ones', () => {
    expect(() => resolveConfig({ input: 'x', int64: 'string' as never })).toThrow(/unknown int64 `string`\. Known: number, bigint/)
  })

  it("refuses responseValidation: 'off' — validation is what widens a small int64", () => {
    expect(() => resolveConfig({ input: 'x', int64: 'bigint', responseValidation: 'off' })).toThrow(/needs response validation/)
    expect(() => resolveConfig({ input: 'x', int64: 'bigint', responseValidation: 'warn' })).not.toThrow()
  })

  it("refuses a per-operation 'off' on an operation whose response carries an int64", () => {
    expect(() => run({ int64: 'bigint', operations: { getEntry: { responseValidation: 'off' } } })).toThrow(
      /`getEntry` turns response validation off/,
    )
    // The default mode has nothing to widen, so the same setting is fine there.
    expect(() => run({ operations: { getEntry: { responseValidation: 'off' } } })).not.toThrow()
  })
})

describe('the IR', () => {
  const load = (int64?: 'number' | 'bigint') => loadOpenApi(spec(ENTRY), int64 ? { int64 } : {}).doc

  it('reads int64 as a number by default, and reports the precision loss', () => {
    const doc = load()
    const entry = doc.models[0]?.type
    expect(entry).toMatchObject({ kind: 'object' })
    expect(JSON.stringify(entry)).not.toContain('bigint')
    expect(JSON.stringify(entry)).not.toContain('acceptsBigInt')
    const note = doc.notes.find((n) => n.code === 'int64-precision')
    expect(note?.message).toContain("int64: 'bigint'")
  })

  it("reads int64 as bigint under int64: 'bigint' — and reports nothing lost", () => {
    const doc = load('bigint')
    const model = doc.models[0]!.type
    if (model.kind !== 'object') throw new Error('expected an object model')
    const fields = model.fields
    const byName = Object.fromEntries(fields.map((f) => [f.name, f.type]))
    expect(byName.id).toEqual({ kind: 'bigint', minimum: 1, maximum: undefined, exclusiveMinimum: undefined, exclusiveMaximum: undefined, multipleOf: undefined })
    expect(byName.refs).toMatchObject({ kind: 'array', items: { kind: 'bigint' } })
    // Every OTHER number accepts the bigint the lossless decoder hands it.
    expect(byName.amount).toMatchObject({ kind: 'number', acceptsBigInt: true })
    expect(byName.count).toMatchObject({ kind: 'number', integer: true, acceptsBigInt: true })
    expect(doc.notes.some((n) => n.code === 'int64-precision')).toBe(false)
  })

  it('drops an int64 bound past 2^53 - 1: the spec text already rounded it', () => {
    const doc = loadOpenApi(
      spec({ N: { type: 'integer', format: 'int64', minimum: -(2 ** 63), maximum: 2 ** 63 - 1 } }),
      { int64: 'bigint' },
    ).doc
    expect(doc.models[0]?.type).toMatchObject({ kind: 'bigint', minimum: undefined, maximum: undefined })
  })

  it('an int64 refined by a plain integer (allOf) stays an int64', () => {
    const doc = loadOpenApi(
      spec({ N: { allOf: [{ type: 'integer', format: 'int64' }, { type: 'integer', minimum: 3 }] } }),
      { int64: 'bigint' },
    ).doc
    expect(doc.models[0]?.type).toMatchObject({ kind: 'bigint', minimum: 3 })
  })

  it('marks no number when the spec has no int64 — no decoder, nothing to accept', () => {
    const doc = loadOpenApi(spec({ N: { type: 'object', properties: { n: { type: 'number' } } } }), { int64: 'bigint' }).doc
    expect(JSON.stringify(doc.models)).not.toContain('acceptsBigInt')
  })
})

describe('the default mode is byte-identical', () => {
  it("int64 unset and int64: 'number' produce the same files", () => {
    const a = run({}).files
    const b = run({ int64: 'number' }).files
    expect(b).toEqual(a)
  })

  it("int64: 'bigint' over a spec with NO int64 produces the default output", () => {
    const text = spec({ N: { type: 'object', required: ['n'], properties: { n: { type: 'integer', format: 'int32' } } } }, {
      '/n': { get: { operationId: 'getN', tags: ['n'], responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/N' } } } } } } },
    })
    for (const client of ['pyreon', 'axios'] as const) {
      expect(run({ client, int64: 'bigint' }, text).files).toEqual(run({ client }, text).files)
    }
  })
})

describe('what each emitter writes', () => {
  it('the schema: a bigint with bigint-literal bounds, widened from a safe integer', () => {
    for (const [validator, b] of [['pyreon', 's'], ['zod', 'z']] as const) {
      const out = file(run({ int64: 'bigint', validator }).files, 'schemas/Entry.ts')
      expect(out).toContain(`${b}.preprocess((v) => (typeof v === 'number' && Number.isInteger(v) ? BigInt(v) : v), /* @__PURE__ */ ${b}.bigint().min(1n))`)
      // A plain number reads a bigint back as the double JSON.parse would give.
      expect(out).toContain(`${b}.preprocess((v) => (typeof v === 'bigint' ? Number(v) : v), /* @__PURE__ */ ${b}.number())`)
      expect(out).toContain('id: bigint')
      expect(out).toContain('refs?: bigint[] | undefined')
    }
  })

  it('the pyreon client installs the lossless codec', () => {
    const out = file(run({ int64: 'bigint' }).files, 'client.ts')
    expect(out).toContain("import { losslessJson } from '@pyreon/http/json'")
    expect(out).toContain('  json: losslessJson,')
    expect(file(run({}).files, 'client.ts')).not.toContain('losslessJson')
  })

  it('an adapter client carries its own copy of the codec, and uses it both ways', () => {
    for (const client of ['fetch', 'axios', 'ky'] as const) {
      const out = file(run({ int64: 'bigint', client }).files, 'client.ts')
      expect(out, client).toContain('export function parseJsonLossless(text: string): unknown')
      expect(out, client).toContain('export function stringifyJsonLossless(value: unknown): string')
      expect(out, client).toContain('payload = stringifyJsonLossless(args.json)')
      // Every body the client decodes goes through the lossless parser.
      expect(out, client).toContain(client === 'axios' ? 'parseJsonLossless(res.data as string)' : 'parseJsonLossless(text) as unknown')
    }
    expect(file(run({ int64: 'bigint', client: 'ky' }).files, 'client.ts')).toContain('parseJson: parseJsonLossless })')
    expect(file(run({ int64: 'bigint', client: 'axios' }).files, 'client.ts')).toContain('transformResponse: [(d: unknown) => d]')
  })

  it('an int64 path parameter accepts the bigint the client decoded (typed bigint | number)', () => {
    const out = file(run({ int64: 'bigint' }).files, 'endpoints/e.ts')
    expect(out).toContain('params: { id: bigint | number }')
  })

  it('mock fixtures and faker factories produce bigints', () => {
    const { files } = run({ int64: 'bigint' })
    expect(file(files, 'mocks.ts')).toMatch(/"id": \d+n/)
    expect(file(files, 'faker.ts')).toContain('BigInt(faker.number.int(')
  })

  it('the contract surface names the type int64, so int32 -> int64 is a breaking change', () => {
    const narrow = spec({ N: { type: 'object', required: ['id'], properties: { id: { type: 'integer', format: 'int32' } } } })
    const wide = spec({ N: { type: 'object', required: ['id'], properties: { id: { type: 'integer', format: 'int64' } } } })
    const surface = (text: string) => extractSurface(loadOpenApi(text, { int64: 'bigint' }).doc)
    expect(JSON.stringify(surface(wide))).toContain('"int64"')
    const changes = diffSurface(surface(narrow), surface(wide))
    expect(changes).toContainEqual(expect.objectContaining({ severity: 'breaking', code: 'field-type-changed', subject: 'N.id' }))
    // Default mode: the generated type does not change, and neither does the surface.
    const plain = (text: string) => extractSurface(loadOpenApi(text).doc)
    expect(diffSurface(plain(narrow), plain(wide))).toEqual([])
  })
})

describe('the native modules', () => {
  const native = (int64: 'number' | 'bigint') =>
    generate(spec(ENTRY, PATHS), resolveConfig({ input: 'x', target: 'multiplatform', int64 }))

  it('keep the platform integer — the same schema the default mode emits', () => {
    const pick = (r: ReturnType<typeof native>) => r.files.filter((f) => f.path.endsWith('.native.tsx'))
    expect(pick(native('bigint'))).toEqual(pick(native('number')))
  })

  it('report the difference: int64-native fires for multiplatform, never for web', () => {
    const note = native('bigint').doc.notes.find((n) => n.code === 'int64-native')
    expect(note?.message).toContain('Kotlin `Int` (32-bit')
    expect(run({ int64: 'bigint' }).doc.notes.some((n) => n.code === 'int64-native')).toBe(false)
    expect(native('number').doc.notes.some((n) => n.code === 'int64-native')).toBe(false)
  })
})
