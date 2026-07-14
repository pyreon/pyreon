/**
 * `toJsonSchema` — the `@pyreon/validate/json-schema` subpath. Locks the
 * draft-2020-12 emission for every representable kind, the metadata mapping,
 * the unrepresentable policy split, and the documented approximations
 * (transform → inner, pipe → source, preprocess → target, catch → default).
 */
import { describe, expect, it } from 'vitest'
import { toJsonSchema } from '../json-schema'
import { s } from '../v1'

const HDR = { $schema: 'https://json-schema.org/draft/2020-12/schema' }

describe('toJsonSchema — primitives + checks', () => {
  it('string with length/format checks', () => {
    expect(toJsonSchema(s.string().min(2).max(8))).toEqual({ ...HDR, type: 'string', minLength: 2, maxLength: 8 })
    expect(toJsonSchema(s.string().email())).toEqual({ ...HDR, type: 'string', format: 'email' })
    expect(toJsonSchema(s.string().url())).toEqual({ ...HDR, type: 'string', format: 'uri' })
    expect(toJsonSchema(s.string().uuid())).toEqual({ ...HDR, type: 'string', format: 'uuid' })
    expect(toJsonSchema(s.string().iso.date())).toEqual({ ...HDR, type: 'string', format: 'date' })
    expect(toJsonSchema(s.string().iso.dateTime())).toEqual({ ...HDR, type: 'string', format: 'date-time' })
    expect(toJsonSchema(s.string().regex(/^x\d+$/))).toEqual({ ...HDR, type: 'string', pattern: '^x\\d+$' })
    expect(toJsonSchema(s.string().startsWith('a.b'))).toEqual({ ...HDR, type: 'string', pattern: '^a\\.b' })
    expect(toJsonSchema(s.string().endsWith('x'))).toEqual({ ...HDR, type: 'string', pattern: 'x$' })
    expect(toJsonSchema(s.string().length(4))).toEqual({ ...HDR, type: 'string', minLength: 4, maxLength: 4 })
    expect(toJsonSchema(s.string().nonEmpty())).toEqual({ ...HDR, type: 'string', minLength: 1 })
  })

  it('number with range checks; .int() upgrades the type', () => {
    expect(toJsonSchema(s.number())).toEqual({ ...HDR, type: 'number' })
    expect(toJsonSchema(s.number().int().min(0).max(150))).toEqual({ ...HDR, type: 'integer', minimum: 0, maximum: 150 })
    expect(toJsonSchema(s.number().gt(0).lt(10))).toEqual({ ...HDR, type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 })
    expect(toJsonSchema(s.number().between(1, 9))).toEqual({ ...HDR, type: 'number', minimum: 1, maximum: 9 })
    expect(toJsonSchema(s.number().positive())).toEqual({ ...HDR, type: 'number', exclusiveMinimum: 0 })
    expect(toJsonSchema(s.number().nonNegative())).toEqual({ ...HDR, type: 'number', minimum: 0 })
    expect(toJsonSchema(s.number().multipleOf(3))).toEqual({ ...HDR, type: 'number', multipleOf: 3 })
    expect(toJsonSchema(s.number().safe())).toEqual({ ...HDR, type: 'number', minimum: -9007199254740991, maximum: 9007199254740991 })
  })

  it('boolean / null / any / unknown / never / literal / enum / nativeEnum / stringbool', () => {
    expect(toJsonSchema(s.boolean())).toEqual({ ...HDR, type: 'boolean' })
    expect(toJsonSchema(s.null())).toEqual({ ...HDR, type: 'null' })
    expect(toJsonSchema(s.any())).toEqual({ ...HDR })
    expect(toJsonSchema(s.unknown())).toEqual({ ...HDR })
    expect(toJsonSchema(s.never())).toEqual({ ...HDR, not: {} })
    expect(toJsonSchema(s.literal(42))).toEqual({ ...HDR, const: 42 })
    expect(toJsonSchema(s.enum(['red', 'green']))).toEqual({ ...HDR, enum: ['red', 'green'] })
    enum E {
      A = 'a',
      B = 'b',
    }
    expect(toJsonSchema(s.nativeEnum(E))).toEqual({ ...HDR, enum: ['a', 'b'] })
    const sb = toJsonSchema(s.stringbool())
    expect(sb.type).toBe('string')
    expect(sb.enum).toContain('true')
    expect(sb.enum).toContain('false')
  })
})

describe('toJsonSchema — composition', () => {
  it('object: properties + required; optional/nullish/default fields not required', () => {
    const schema = s.object({
      name: s.string().min(2),
      age: s.number().int().optional(),
      nick: s.string().default('anon'),
      bio: s.string().nullish(),
      tag: s.string().nullable(),
    })
    expect(toJsonSchema(schema)).toEqual({
      ...HDR,
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2 },
        age: { type: 'integer' },
        nick: { type: 'string', default: 'anon' },
        bio: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        tag: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['name', 'tag'],
    })
  })

  it('object key policies: strict → additionalProperties false; catchall → schema', () => {
    const base = { a: s.string() }
    expect(toJsonSchema(s.object(base).strict()).additionalProperties).toBe(false)
    expect(toJsonSchema(s.object(base)).additionalProperties).toBeUndefined()
    expect(toJsonSchema(s.object(base).passthrough()).additionalProperties).toBeUndefined()
    expect(toJsonSchema(s.object(base).catchall(s.number())).additionalProperties).toEqual({ type: 'number' })
  })

  it('array / set / record / tuple', () => {
    expect(toJsonSchema(s.array(s.string()).min(1).max(5))).toEqual({
      ...HDR,
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 5,
    })
    expect(toJsonSchema(s.set(s.number().int()))).toEqual({
      ...HDR,
      type: 'array',
      uniqueItems: true,
      items: { type: 'integer' },
    })
    expect(toJsonSchema(s.record(s.number()))).toEqual({
      ...HDR,
      type: 'object',
      additionalProperties: { type: 'number' },
    })
    expect(toJsonSchema(s.record(s.string().regex(/^k/), s.boolean()))).toEqual({
      ...HDR,
      type: 'object',
      additionalProperties: { type: 'boolean' },
      propertyNames: { type: 'string', pattern: '^k' },
    })
    expect(toJsonSchema(s.tuple([s.string(), s.number()]))).toEqual({
      ...HDR,
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      minItems: 2,
      maxItems: 2,
      items: false,
    })
    expect(toJsonSchema(s.tuple([s.string()]).rest(s.number()))).toEqual({
      ...HDR,
      type: 'array',
      prefixItems: [{ type: 'string' }],
      minItems: 1,
      items: { type: 'number' },
    })
  })

  it('union / discriminatedUnion → anyOf; intersection → allOf', () => {
    expect(toJsonSchema(s.union([s.string(), s.number()]))).toEqual({
      ...HDR,
      anyOf: [{ type: 'string' }, { type: 'number' }],
    })
    const du = s.discriminatedUnion('t', [
      s.object({ t: s.literal('a'), v: s.string() }),
      s.object({ t: s.literal('b'), n: s.number() }),
    ])
    const emitted = toJsonSchema(du)
    expect(emitted.anyOf).toHaveLength(2)
    expect(toJsonSchema(s.intersection(s.object({ a: s.string() }), s.object({ b: s.number() })))).toEqual({
      ...HDR,
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
      ],
    })
  })

  it('lazy resolves non-cyclic thunks; cyclic throws with guidance', () => {
    expect(toJsonSchema(s.lazy(() => s.number().int()))).toEqual({ ...HDR, type: 'integer' })
    type Tree = { v: number; kids: Tree[] }
    const tree: ReturnType<typeof s.object> = s.object({
      v: s.number(),
      kids: s.array(s.lazy((): never => tree as never)),
    })
    expect(() => toJsonSchema(tree as never)).toThrow(/cyclic s\.lazy/)
  })
})

describe('toJsonSchema — wrappers, metadata, approximations', () => {
  it('transform → inner (input shape); pipe → source; preprocess → target', () => {
    expect(toJsonSchema(s.string().transform((v) => v.length))).toEqual({ ...HDR, type: 'string' })
    expect(toJsonSchema(s.string().pipe(s.string().min(2)))).toEqual({ ...HDR, type: 'string' })
    expect(toJsonSchema(s.preprocess((v) => String(v), s.string().min(1)))).toEqual({
      ...HDR,
      type: 'string',
      minLength: 1,
    })
  })

  it('refine / superRefine / serverCheck / brand are structurally omitted', () => {
    expect(toJsonSchema(s.string().refine((v) => v !== 'no', { message: 'x' }))).toEqual({ ...HDR, type: 'string' })
    expect(toJsonSchema(s.object({ a: s.string() }).superRefine(() => {}))).toEqual({
      ...HDR,
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
    })
    expect(toJsonSchema(s.string().serverCheck('unique'))).toEqual({ ...HDR, type: 'string' })
    expect(toJsonSchema(s.string().brand<'UserId'>())).toEqual({ ...HDR, type: 'string' })
  })

  it('describe → description; default → default; static catch → default', () => {
    expect(toJsonSchema(s.string().describe('A name'))).toEqual({ ...HDR, type: 'string', description: 'A name' })
    expect(toJsonSchema(s.number().default(7))).toEqual({ ...HDR, type: 'number', default: 7 })
    expect(toJsonSchema(s.number().default(() => 9))).toEqual({ ...HDR, type: 'number', default: 9 })
    expect(toJsonSchema(s.number().catch(0))).toEqual({ ...HDR, type: 'number', default: 0 })
    // function-of-input catch has no JSON Schema equivalent — omitted
    expect(toJsonSchema(s.number().catch(() => 1))).toEqual({ ...HDR, type: 'number' })
  })

  it('unrepresentable kinds: throw by default, {} under `any` policy', () => {
    for (const schema of [
      s.date(),
      s.bigint(),
      s.undefined(),
      s.map(s.string(), s.number()),
      s.void(),
      s.nan(),
      s.symbol(),
      s.instanceof(Date),
    ]) {
      expect(() => toJsonSchema(schema as never)).toThrow(/\[Pyreon\] toJsonSchema/)
      expect(toJsonSchema(schema as never, { unrepresentable: 'any' })).toEqual({ ...HDR })
    }
    // nested: the policy applies at any depth
    expect(toJsonSchema(s.object({ when: s.date() }), { unrepresentable: 'any' })).toEqual({
      ...HDR,
      type: 'object',
      properties: { when: {} },
      required: ['when'],
    })
  })

  it('an unknown/future schema kind is unrepresentable (default arm)', () => {
    const bogus = { _kind: 'zzz-future', _ops: [] } as never
    expect(() => toJsonSchema(bogus)).toThrow(/\[Pyreon\] toJsonSchema/)
    expect(toJsonSchema(bogus, { unrepresentable: 'any' })).toEqual({ ...HDR })
  })

  it('nonoptional unwraps to its source shape', () => {
    expect(toJsonSchema(s.string().optional().nonoptional())).toEqual({ ...HDR, type: 'string' })
  })
})

describe('toJsonSchema — check → constraint mapping', () => {
  it('string: nonEmpty → minLength, includes → pattern', () => {
    expect(toJsonSchema(s.string().nonEmpty())).toEqual({ ...HDR, type: 'string', minLength: 1 })
    expect(toJsonSchema(s.string().includes('ab'))).toEqual({ ...HDR, type: 'string', pattern: 'ab' })
  })

  it('number: negative/nonPositive → exclusiveMaximum/maximum, finite → no-op', () => {
    expect(toJsonSchema(s.number().negative())).toEqual({ ...HDR, type: 'number', exclusiveMaximum: 0 })
    expect(toJsonSchema(s.number().nonPositive())).toEqual({ ...HDR, type: 'number', maximum: 0 })
    expect(toJsonSchema(s.number().finite())).toEqual({ ...HDR, type: 'number' })
  })

  it('array: length → min+maxItems, nonEmpty → minItems', () => {
    expect(toJsonSchema(s.array(s.string()).length(3))).toEqual({
      ...HDR,
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    })
    expect(toJsonSchema(s.array(s.string()).nonEmpty())).toEqual({
      ...HDR,
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    })
  })

  it('set (collection) → uniqueItems array with min/max/size → item bounds', () => {
    const base = { ...HDR, type: 'array' as const, uniqueItems: true, items: { type: 'string' } }
    expect(toJsonSchema(s.set(s.string()).min(2))).toEqual({ ...base, minItems: 2 })
    expect(toJsonSchema(s.set(s.string()).max(5))).toEqual({ ...base, maxItems: 5 })
    expect(toJsonSchema(s.set(s.string()).size(3))).toEqual({ ...base, minItems: 3, maxItems: 3 })
  })

  // `check:*:nonempty` and the mini-form `optional` op are members of the PUBLIC
  // op union (core/ops.ts) that the JIT + converter must handle, but no
  // chainable method emits them today (`.nonEmpty()` lowers to minLength/min;
  // `.optional()` sets the `_kind`). Lock the converter's forward-compat mapping
  // by constructing the op directly.
  it('forward-compat: nonempty ops map to length bounds', () => {
    const str = s.string()
    str._ops.push({ kind: 'check:string:nonempty' })
    expect(toJsonSchema(str)).toEqual({ ...HDR, type: 'string', minLength: 1 })

    const arr = s.array(s.string())
    arr._ops.push({ kind: 'check:array:nonempty' })
    expect(toJsonSchema(arr)).toEqual({ ...HDR, type: 'array', items: { type: 'string' }, minItems: 1 })
  })

  it('forward-compat: a mini-form optional op in a field marks it non-required', () => {
    const field = s.string()
    field._ops.push({ kind: 'optional' })
    // No `required` array — the field is optional via its op, not its `_kind`.
    expect(toJsonSchema(s.object({ x: field })).required).toBeUndefined()
  })
})
