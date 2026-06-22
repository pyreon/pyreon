// Differential fuzz harness — the JIT MUST produce byte-identical results to
// the interpreter for every shape it accepts. This builds BOTH validators for
// a schema (`tryCompileJit` and the forced `compileSchema`), runs the SAME
// input through each with a fresh ctx, and asserts identical { value, issues }.
//
// This is the correctness gate for every JIT optimization: any divergence
// (a wrong issue path, a dropped check, a mis-assigned field, a prototype
// leak) fails here. Deterministic (seeded RNG) so failures reproduce.
import { describe, expect, it } from 'vitest'
import { compileSchema } from '../core/schema'
import { tryCompileJit } from '../core/jit'
import type { ParseCtx } from '../core/ops'
import type { Schema } from '../core/schema'
import { s } from '../v1'

// ─── deterministic RNG (mulberry32) ────────────────────────────────────
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

// Run a compiled validator with a fresh ctx → a comparable {value|undefined, issues}.
function run(compiled: (i: unknown, c: ParseCtx) => unknown, input: unknown) {
  const ctx: ParseCtx = { issues: [], path: [] }
  let value: unknown
  let threw: string | undefined
  try {
    value = compiled(input, ctx)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }
  const isPromise = value instanceof Promise
  const ok = !threw && !isPromise && ctx.issues.length === 0
  return {
    threw,
    isPromise,
    ok,
    // On a FAILED parse `value` is discarded (parse returns issues, not value),
    // and the JIT vs interpreter legitimately build different partial values
    // (e.g. skip vs keep a failed element/field) — unobservable. Only compare
    // the output value when the parse succeeded.
    value: ok ? value : '<failed>',
    // issues normalized to the observable surface: path + message + code.
    issues: ctx.issues
      .map((i) => ({
        path: (i.path ?? []).map((p) => (typeof p === 'object' && p && 'key' in p ? String((p as { key: PropertyKey }).key) : String(p))).join('.'),
        message: i.message,
        code: (i as { code?: string }).code,
      }))
      .sort((a, b) => (a.path + a.message).localeCompare(b.path + b.message)),
  }
}

// Compare JIT vs interpreter for one schema + one input. Skips when the
// schema isn't JIT-able (no divergence possible — same validator both sides).
function diff(schema: Schema<unknown>, input: unknown, label: string) {
  const jit = tryCompileJit(schema)
  if (!jit) return // not a JIT shape → interpreter both sides → nothing to compare
  const interp = compileSchema(schema)
  const a = run(jit, input)
  const b = run(interp, input)
  expect(a, `${label} :: input=${safe(input)}`).toEqual(b)
}

function safe(v: unknown): string {
  try {
    return JSON.stringify(v)?.slice(0, 120) ?? String(v)
  } catch {
    return String(v)
  }
}

// ─── input generators (cover valid + every failure mode) ────────────────
const BADS: unknown[] = [undefined, null, 42, 'str', true, NaN, {}, [], { a: 1 }, [1, 2], Symbol.for('x'), 0, '', -1, 1.5]

function* primInputs(): Generator<unknown> {
  yield* ['hello', '', 'a', 'abcdef', 'ada@example.com', 'not-an-email', '12345']
  yield* ['https://example.com/x', 'ftp://no', '550e8400-e29b-41d4-a716-446655440000', 'not-a-uuid', '2026-06-22', '2026-13-99', '2026-06-22T10:00:00Z']
  yield* [0, 1, -1, 42, 999, 1.5, 150, 151, NaN, Infinity, -0]
  yield* [true, false]
  yield* BADS
}

describe('JIT differential — primitive roots', () => {
  const schemas: Array<[string, Schema<unknown>]> = [
    ['string', s.string()],
    ['string.min2.max5', s.string().min(2).max(5)],
    ['string.length3', s.string().length(3)],
    ['string.email', s.string().email()],
    ['string.regex', s.string().regex(/^[a-z]+$/)],
    ['string.url', s.string().url()],
    ['string.uuid', s.string().uuid()],
    ['string.iso.date', s.string().iso.date()],
    ['string.iso.datetime', s.string().iso.dateTime()],
    ['number', s.number()],
    ['number.int', s.number().int()],
    ['number.int.min0.max150', s.number().int().min(0).max(150)],
    ['number.between', s.number().between(0, 150)],
    ['number.positive', s.number().positive()],
    ['boolean', s.boolean()],
    ['literal42', s.literal(42)],
  ]
  for (const [name, sc] of schemas) {
    it(name, () => {
      for (const input of primInputs()) diff(sc, input, name)
    })
  }
})

describe('JIT differential — objects (flat, nested, with arrays)', () => {
  const flat = s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150), active: s.boolean() })
  const nested = s.object({ id: s.number().int(), user: s.object({ name: s.string().min(2), addr: s.object({ city: s.string().min(1), zip: s.string().length(5) }) }) })
  const withArr = s.object({ page: s.number().int().min(0), tags: s.array(s.string().min(1)), items: s.array(s.object({ id: s.number().int(), title: s.string().min(1) })) })
  const withEmail = s.object({ email: s.string().email(), nick: s.string().min(2) })

  function* objInputs(): Generator<unknown> {
    yield { name: 'Ada', age: 36, active: true }
    yield { name: 'A', age: 999, active: 'no' } // multi-fail
    yield { name: 'Ada', age: 36 } // missing
    yield { id: 1, user: { name: 'Ada', addr: { city: 'Paris', zip: '75001' } } }
    yield { id: 1.5, user: { name: 'A', addr: { city: '', zip: '7' } } } // deep fail
    yield { id: 1, user: { name: 'Ada', addr: null } } // nested non-object
    yield { page: 0, tags: ['a', 'b'], items: [{ id: 1, title: 'x' }] }
    yield { page: 0, tags: ['a', ''], items: [{ id: 1, title: '' }, { id: 'no', title: 'y' }] } // element fails
    yield { page: -1, tags: 'notarray', items: 5 }
    yield { email: 'ada@example.com', nick: 'ad' }
    yield { email: 'nope', nick: 'a' }
    yield* BADS
  }

  for (const [name, sc] of [['flat', flat], ['nested', nested], ['withArr', withArr], ['withEmail', withEmail]] as Array<[string, Schema<unknown>]>) {
    it(name, () => {
      for (const input of objInputs()) diff(sc, input, name)
    })
  }
})

describe('JIT differential — array roots', () => {
  const arrPrim = s.array(s.number().int())
  const arrObj = s.array(s.object({ id: s.number().int(), name: s.string().min(2) }))
  const arrBounded = s.array(s.string().min(1)).min(2).max(4)
  function* arrInputs(): Generator<unknown> {
    yield [1, 2, 3]
    yield [1, 2.5, 'x']
    yield [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bob' }]
    yield [{ id: 1, name: 'A' }, { id: 'x', name: 'Bob' }]
    yield ['a', 'b', 'c']
    yield ['a'] // too short
    yield ['a', '', 'c']
    yield* BADS
  }
  for (const [name, sc] of [['arrPrim', arrPrim], ['arrObj', arrObj], ['arrBounded', arrBounded]] as Array<[string, Schema<unknown>]>) {
    it(name, () => {
      for (const input of arrInputs()) diff(sc, input, name)
    })
  }
})

describe('JIT differential — randomized fuzz (seeded)', () => {
  it('1000 random object schemas × inputs agree JIT vs interpreter', () => {
    const r = rng(0x9e3779b9)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
    const fieldSchemas = (): Schema<unknown> => {
      const k = pick(['s', 's', 'n', 'n', 'b', 'o', 'a'])
      if (k === 's') return pick([s.string(), s.string().min(2), s.string().max(8), s.string().length(4), s.string().regex(/^x/)])
      if (k === 'n') return pick([s.number(), s.number().int(), s.number().min(0), s.number().max(100), s.number().between(1, 9), s.number().positive()])
      if (k === 'b') return s.boolean()
      if (k === 'o') return s.object({ inner: pick<Schema<unknown>>([s.string().min(1), s.number().int()]), flag: s.boolean() })
      return s.array(pick<Schema<unknown>>([s.string().min(1), s.number().int(), s.object({ v: s.number().int() })]))
    }
    const randValue = (): unknown => pick([42, -1, 1.5, 'a', 'abcd', 'xyz', '', true, false, null, undefined, NaN, {}, [], { inner: 'q', flag: true }, [1, 2], ['a'], [{ v: 1 }], [{ v: 'no' }], { v: 1 }])

    for (let n = 0; n < 1000; n++) {
      const keys = ['a', 'b', 'c', '__proto__'].slice(0, 1 + Math.floor(r() * 4))
      const shape: Record<string, Schema<unknown>> = {}
      for (const key of keys) shape[key] = fieldSchemas()
      const schema = s.object(shape)
      const input: Record<string, unknown> = {}
      for (const key of keys) if (r() > 0.2) input[key] = randValue()
      if (r() > 0.7) (input as Record<string, unknown>).extra = randValue() // unknown key (strip)
      diff(schema, r() > 0.1 ? input : pick(BADS), `fuzz#${n}`)
    }
  })

  it('300 random array-root schemas × inputs agree', () => {
    const r = rng(0x1234abcd)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
    for (let n = 0; n < 300; n++) {
      const el = pick<Schema<unknown>>([s.string().min(1), s.number().int().min(0), s.boolean(), s.object({ id: s.number().int(), name: s.string().min(1) })])
      const schema: Schema<unknown> = pick([s.array(el), s.array(el).min(1), s.array(el).max(3)])
      const len = Math.floor(r() * 5)
      const arr: unknown[] = []
      for (let i = 0; i < len; i++) arr.push(pick([1, -1, 'x', '', true, null, { id: 1, name: 'a' }, { id: 'x', name: '' }]))
      diff(schema, r() > 0.15 ? arr : pick(BADS), `arrfuzz#${n}`)
    }
  })
})
