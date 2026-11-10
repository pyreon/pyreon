/**
 * Parse-FAST differential — the ctx-free `'fast'` emission must agree with the
 * INTERPRETER on every input: where the interpreter accepts, fast returns a
 * value deep-equal to the interpreter's (same keys, same key ORDER, fresh
 * objects — never the input aliased); where the interpreter reports any
 * issue, fast returns `JIT_FAIL`.
 *
 * Why the interpreter and not the parse JIT: the installed `parse` seam runs
 * fast FIRST and trusts an accepting answer without consulting the full
 * validator. A spurious FAIL only costs a re-run, but a spurious ACCEPT (or a
 * differently-built value) would be a wrong `parse()` result — so this suite
 * is the only thing standing between a mis-emitted condition and a silent
 * validation hole. Comparing against the interpreter keeps it independent of
 * the parse emitter, which shares most of its codegen with fast.
 *
 * COVERAGE IS ASSERTED: fast is refused (null) for shapes with a fallback or
 * a closure-only check, and a refused schema would make every comparison
 * here vacuous. Each block counts how many schemas fast served.
 */
import { describe, expect, it } from 'vitest'
import { JIT_FAIL, tryCompileJitFast } from '../core/jit'
import type { ParseCtx } from '../core/ops'
import { compileSchema, type Schema } from '../core/schema'
import { s } from '../v1'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function safe(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x))?.slice(0, 120) ?? String(v)
  } catch {
    return Object.prototype.toString.call(v)
  }
}

/** Key order is observable on an output object — compare it, recursively. */
function keyOrder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(keyOrder)
  if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v)) o[k] = keyOrder((v as Record<string, unknown>)[k])
    return Object.keys(o)
  }
  return null
}

/**
 * The whole contract for one schema and one input. Returns whether fast
 * served the schema, so callers can assert coverage.
 */
function agree(sc: Schema<unknown>, input: unknown, label: string): boolean {
  const fast = tryCompileJitFast(sc)
  if (fast === null) return false
  const ctx: ParseCtx = { issues: [], path: [] }
  const interp = compileSchema(sc)(input, ctx)
  const got = fast(input)
  const where = `${label} :: input=${safe(input)}`
  if (ctx.issues.length > 0) {
    expect(got, `${where} :: interpreter rejects, fast must FAIL`).toBe(JIT_FAIL)
  } else {
    expect(got, `${where} :: interpreter accepts, fast must not FAIL`).not.toBe(JIT_FAIL)
    expect(got, where).toEqual(interp)
    expect(keyOrder(got), `${where} :: key order`).toEqual(keyOrder(interp))
    if (typeof input === 'object' && input !== null && !(input instanceof Date)) {
      expect(got === input, `${where} :: a composite output is a fresh clone`).toBe(false)
    }
  }
  // And through the public seam that installs fast: the Result matches the
  // interpreter's verdict + value, issues included on failure.
  const r = sc.parse(input)
  expect(r.ok, `${where} :: parse().ok`).toBe(ctx.issues.length === 0)
  if (r.ok) expect(r.value, where).toEqual(interp)
  else expect(r.issues.length, `${where} :: issues`).toBe(ctx.issues.length)
  return true
}

const BADS: unknown[] = [undefined, null, 42, 'str', true, NaN, {}, [], { a: 1 }, [1, 2], 0, '', -1, 1.5]

describe('parse-fast JIT — primitive roots and fields', () => {
  const schemas: Array<[string, Schema<unknown>]> = [
    ['string', s.string()],
    ['string.min2.max5', s.string().min(2).max(5)],
    ['string.email', s.string().email()],
    ['string.regex', s.string().regex(/^[a-z]+$/)],
    ['string.url', s.string().url()],
    ['string.startsWith', s.string().startsWith('ab')],
    ['number', s.number()],
    ['number.int.min0.max150', s.number().int().min(0).max(150)],
    ['number.between', s.number().between(0, 150)],
    ['number.multipleOf3', s.number().multipleOf(3)],
    ['boolean', s.boolean()],
    ['literal42', s.literal(42)],
    ['bigint', s.bigint()],
    ['date', s.date()],
    ['null', s.null()],
    ['undefined', s.undefined()],
  ]
  const inputs: unknown[] = [
    'hello', '', 'a', 'abcdef', 'ada@example.com', 'a..b@x.co', 'not-an-email', 'https://example.com/x', 'abz',
    0, 1, -1, 42, 150, 151, 1.5, NaN, Infinity, -0, 3, 2 ** 53, true, false, 42n, new Date('2026-06-22'),
    new Date('invalid'), ...BADS,
  ]
  // A scalar root is deliberately NOT served (see `tryCompileJitFast`): its
  // invalid path would pay its checks twice for no measurable valid gain.
  for (const [name, sc] of schemas) {
    it(name, () => {
      {
        expect(tryCompileJitFast(sc)).toBeNull()
        for (const input of inputs) {
          const ctx: ParseCtx = { issues: [], path: [] }
          const interp = compileSchema(sc)(input, ctx)
          const r = sc.parse(input)
          expect(r.ok, `${name} :: input=${safe(input)}`).toBe(ctx.issues.length === 0)
          if (r.ok) expect(r.value).toEqual(interp)
        }
      }
    })
  }
  // ...but the same scalars as FIELDS are served, inside an object root.
  it('every scalar is served as an object field', () => {
    for (const [name, sc] of schemas) {
      const wrapped = s.object({ f: sc }) as unknown as Schema<unknown>
      expect(tryCompileJitFast(wrapped), name).not.toBeNull()
      for (const input of inputs) agree(wrapped, { f: input }, `{f:${name}}`)
    }
  })
})

describe('parse-fast JIT — objects, arrays, discriminated unions, strict', () => {
  const flat = s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150), active: s.boolean() })
  const user = s.object({
    name: s.string().min(2),
    age: s.number().int().min(0).max(150),
    email: s.string().email(),
    tags: s.array(s.string()),
  })
  const nested = s.object({
    id: s.number().int(),
    user: s.object({ name: s.string().min(2), addr: s.object({ city: s.string().min(1), zip: s.string().length(5) }) }),
  })
  const arrObj = s.array(s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150) }))
  const arrBounded = s.array(s.string().min(1)).min(2).max(4)
  const du = s.discriminatedUnion('kind', [
    s.object({ kind: s.literal('circle'), radius: s.number() }),
    s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
    s.object({ kind: s.literal('label'), text: s.string(), size: s.number() }),
  ])
  const nestedDu = s.object({ shape: du, id: s.number().int() })
  const strictFlat = s.object({ name: s.string().min(2), age: s.number().int(), active: s.boolean() }).strict()
  const strictNested = s.object({ id: s.number().int(), user: strictFlat }).strict()
  const strictDu = s.discriminatedUnion('kind', [
    s.object({ kind: s.literal('text'), text: s.string(), size: s.number() }).strict(),
    s.object({ kind: s.literal('label'), label: s.string() }).strict(),
  ])
  // An object whose field is `undefined`-valued when valid, so the ASSIGN
  // emission (strip guard) is exercised rather than the one-literal one.
  const undefField = s.object({ a: s.undefined(), b: s.string() })
  const protoKey = s.object({ ['__proto__']: s.string(), b: s.number() } as Record<string, Schema<unknown>>)

  function* inputs(): Generator<unknown> {
    yield { name: 'Ada', age: 36, active: true }
    yield { name: 'Ada', age: 36, active: true, extra: 1 }
    yield Object.create({ name: 'Ada', age: 36, active: true })
    yield { nmae: 'Ada', age: 36, active: true }
    yield { name: 'A', age: 999, active: 'no' }
    yield { name: 'Ada', age: 36, email: 'ada@example.com', tags: ['a', 'b'] }
    yield { name: 'Ada', age: 36, email: 'ada@example', tags: ['a'] }
    yield { name: 'Ada', age: 36, email: 'ada@example.com', tags: ['a', 42] }
    yield { id: 1, user: { name: 'Ada', addr: { city: 'Paris', zip: '75001' } } }
    yield { id: 1, user: { name: 'Ada', addr: { city: 'Paris', zip: '7500' } } }
    yield { id: 1, user: { name: 'Ada', age: 36, active: true } }
    yield { id: 1, user: { name: 'Ada', age: 36, active: true, zzz: 1 } }
    yield [{ name: 'Ada', age: 1 }, { name: 'Bob', age: 2 }]
    yield [{ name: 'Ada', age: 1 }, { name: 'B', age: 2 }]
    yield [{ name: 'Ada', age: 1, extra: true }]
    yield ['a', 'b']
    yield ['a']
    yield ['a', 'b', 'c', 'd', 'e']
    yield ['a', '']
    yield { kind: 'circle', radius: 1.5 }
    yield { kind: 'rect', w: 3, h: 4, extra: 1 }
    yield { kind: 'label', text: 'hi', size: 12 }
    yield { kind: 'circle', radius: 'x' }
    yield { kind: 'nope' }
    yield { kind: 'text', text: 'hi', size: 2 }
    yield { kind: 'text', text: 'hi', size: 2, zz: 0 }
    yield { kind: 'label', label: 'x' }
    yield { shape: { kind: 'rect', w: 1, h: 2 }, id: 3 }
    yield { shape: { kind: 'rect', w: 'x', h: 2 }, id: 3 }
    yield { a: undefined, b: 'x' }
    yield { b: 'x' }
    yield { a: 1, b: 'x' }
    yield JSON.parse('{"__proto__": "p", "b": 1}')
    yield { __proto__: { polluted: true }, name: 'Ada', age: 1, active: true }
    yield* BADS
  }

  const cases: Array<[string, Schema<unknown>]> = [
    ['flat', flat], ['user', user], ['nested', nested], ['arrObj', arrObj], ['arrBounded', arrBounded],
    ['du', du], ['nestedDu', nestedDu], ['strictFlat', strictFlat], ['strictNested', strictNested],
    ['strictDu', strictDu], ['undefField', undefField], ['protoKey', protoKey],
  ]
  for (const [name, sc] of cases) {
    it(name, () => {
      for (const input of inputs()) agree(sc, input, name)
    })
  }
  it('fast served every object/array root, and refused the discriminated-union roots', () => {
    const refused = new Set(['du', 'strictDu'])
    for (const [name, sc] of cases) expect(tryCompileJitFast(sc) === null, name).toBe(refused.has(name))
  })

  it('a __proto__ key lands as an OWN property, never the prototype', () => {
    const fast = tryCompileJitFast(protoKey)!
    const out = fast(JSON.parse('{"__proto__": "p", "b": 1}')) as Record<string, unknown>
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.hasOwn(out, '__proto__')).toBe(true)
  })
})

describe('parse-fast JIT — shapes it must REFUSE', () => {
  const refused: Array<[string, Schema<unknown>]> = [
    ['optional field', s.object({ a: s.string().optional() })],
    ['default field', s.object({ a: s.string().default('x') })],
    ['refine', s.object({ a: s.string() }).refine((v) => (v as { a: string }).a !== 'no', { message: 'nope' })],
    ['transform', s.object({ a: s.string().transform((x) => x.length) })],
    ['passthrough', s.object({ a: s.string() }).passthrough()],
    ['record root', s.record(s.string(), s.number())],
  ]
  for (const [name, sc] of refused) {
    it(`${name} is refused and parse still answers`, () => {
      expect(tryCompileJitFast(sc), `${name} must be refused`).toBeNull()
      // `{ a: 'x' }` is valid for every case but the number-valued record.
      expect(sc.parse({ a: 'x' }).ok).toBe(name !== 'record root')
    })
  }
})

describe('parse-fast JIT — randomized fuzz (seeded)', () => {
  it('1500 random schema × input pairs agree with the interpreter', () => {
    const r = rng(0xfa57c0de)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
    type Gen = { sc: Schema<unknown>; valid: unknown }
    const leaf = (): Gen =>
      pick([
        { sc: s.string(), valid: 'x' },
        { sc: s.string().min(2), valid: 'xx' },
        { sc: s.string().max(8), valid: 'xxxx' },
        { sc: s.string().email(), valid: 'ada@example.com' },
        { sc: s.number(), valid: 1 },
        { sc: s.number().int().min(0).max(150), valid: 3 },
        { sc: s.number().multipleOf(3), valid: 42 },
        { sc: s.boolean(), valid: true },
        { sc: s.literal('on'), valid: 'on' },
        { sc: s.bigint(), valid: 42n },
        { sc: s.date(), valid: new Date('2026-01-01') },
      ] as Gen[])
    const build = (depth: number): Gen => {
      const k = pick(depth >= 2 ? ['leaf'] : ['leaf', 'obj', 'obj', 'arr'])
      if (k === 'leaf') return leaf()
      if (k === 'arr') {
        const inner = build(depth + 1)
        return { sc: s.array(inner.sc) as unknown as Schema<unknown>, valid: [inner.valid, inner.valid] }
      }
      const n = 1 + Math.floor(r() * 3)
      const shape: Record<string, Schema<unknown>> = {}
      const valid: Record<string, unknown> = {}
      for (let i = 0; i < n; i++) {
        const child = build(depth + 1)
        shape[`f${i}`] = child.sc
        valid[`f${i}`] = child.valid
      }
      const obj = s.object(shape)
      return { sc: (r() < 0.3 ? obj.strict() : obj) as unknown as Schema<unknown>, valid }
    }
    // Mutate one leaf of a valid value so most mutants are invalid somewhere
    // deep — the inputs that reach every failure site, not just the root guard.
    const mutate = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.length === 0 ? [1] : [...v.slice(0, -1), mutate(v[v.length - 1])]
      if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
        const keys = Object.keys(v)
        const o = { ...(v as Record<string, unknown>) }
        if (keys.length === 0 || r() < 0.15) o.zzz = 1
        else o[pick(keys)] = mutate(o[pick(keys)])
        return o
      }
      return pick<unknown>(['', 'x', -1, 1.5, 999, null, undefined, NaN, {}, [], 'a@b', true])
    }
    let served = 0
    for (let n = 0; n < 1500; n++) {
      let g = build(0)
      // Scalar roots are refused by design — wrap one so every pair is served.
      if (tryCompileJitFast(g.sc) === null) g = { sc: s.object({ v: g.sc }) as unknown as Schema<unknown>, valid: { v: g.valid } }
      for (const input of [g.valid, mutate(g.valid), mutate(g.valid)]) {
        if (agree(g.sc, input, `fuzz#${n}`)) served++
      }
    }
    expect(served).toBe(4500)
  })
})
