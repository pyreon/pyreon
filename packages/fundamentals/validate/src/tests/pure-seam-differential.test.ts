// Pure-seam differential fuzz — the semantics lock for the reused-ctx fast
// seam (`Schema._pureCtx`, perf/validate-scalar-alloc).
//
// OLD vs NEW through the PUBLIC API: the "old" side is the general seam
// (per-parse `makeCtx()` + Promise/pending branches — byte-identical to the
// pre-change `parse()` body), reached by clearing the schema's `_pureCtx`
// after compile; the "new" side is the untouched schema, whose fully-inline
// JIT tree routes through the reused-ctx fast seam. Both sides run the SAME
// compiled validator, so any divergence is the SEAM's fault — exactly the
// surface this change touches.
//
// Beyond single-parse equivalence, the load-bearing hazard of a REUSED ctx is
// STATE LEAKING BETWEEN PARSES (a failure's issues/path bleeding into the
// next parse). So every case runs a SEQUENCE of inputs (valid + invalid
// interleaved) through the same schema instance, interleaving `parse` /
// `is` / `~standard.validate`, and compares each step's full observable
// result: verdict, every issue field, value identity/immutability.
import { describe, expect, it } from 'vitest'
import type { ParseCtx } from '../core/ops'
import { EMPTY_PATH } from '../core/ops'
import type { Result, Schema } from '../core/schema'
import { s } from '../v1'

// ─── deterministic RNG (mulberry32 — same as the sibling fuzz suites) ──────
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

/** Typed reach-in for the private seam state (test-only). */
interface SeamInternals {
  _pureCtx?: ParseCtx | undefined
  _getCompiled?: () => unknown
}

/**
 * Force a schema onto the GENERAL (pre-change) seam: compile (so `_pureCtx`
 * is populated exactly as production would), then clear it — `parse()` /
 * `~standard.validate` / `is()` all fall through to the old body.
 */
function forceGeneralSeam<T>(schema: Schema<T>): Schema<T> {
  schema.parse(undefined) // triggers _getCompiled
  ;(schema as unknown as SeamInternals)._pureCtx = undefined
  return schema
}

/** Was the fast seam actually ACTIVE on this schema? (guards the fuzz's power) */
function seamActive(schema: Schema<unknown>): boolean {
  schema.parse(undefined)
  return (schema as unknown as SeamInternals)._pureCtx !== undefined
}

/** Full observable surface of a Result — every issue field, JSON-safe. */
function surface(r: Result<unknown>): unknown {
  if (r.ok) return { ok: true, value: r.value, pending: r.pending ?? null }
  return {
    ok: false,
    issues: r.issues.map((i) => ({
      message: i.message,
      path: (i.path ?? []).map((p) =>
        typeof p === 'object' && p !== null && 'key' in p ? String((p as { key: PropertyKey }).key) : String(p),
      ),
      code: (i as { code?: string }).code ?? null,
      key: (i as { key?: string }).key ?? null,
      params: (i as { params?: unknown }).params ?? null,
      fallback: (i as { fallback?: string }).fallback ?? null,
    })),
  }
}

function safe(v: unknown): string {
  try {
    return JSON.stringify(v)?.slice(0, 140) ?? String(v)
  } catch {
    return Object.prototype.toString.call(v)
  }
}

// ─── schema grammar (fast-seam-eligible shapes: scalar / object / array / DU) ─
type Gen = () => Schema<unknown>

function schemaGrammar(r: () => number): { make: Gen; label: string } {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
  const prim = (): (() => Schema<unknown>) =>
    pick<() => Schema<unknown>>([
      () => s.string(),
      () => s.string().min(2),
      () => s.string().max(6),
      () => s.string().length(4),
      () => s.string().nonEmpty(),
      () => s.string().email(),
      () => s.string().regex(/^[a-z]+$/),
      () => s.string().startsWith('ab'),
      () => s.string().endsWith('yz'),
      () => s.string().includes('mid'),
      () => s.number(),
      () => s.number().int(),
      () => s.number().int().min(0).max(150),
      () => s.number().between(1, 9),
      () => s.number().positive(),
      () => s.number().multipleOf(3),
      () => s.boolean(),
      () => s.literal(42),
      () => s.literal('on'),
      () => s.bigint(),
      () => s.date(),
      () => s.null(),
      () => s.undefined(),
    ])
  const kind = pick(['prim', 'prim', 'obj', 'obj', 'arr', 'nested', 'du'])
  if (kind === 'prim') {
    const p = prim()
    return { make: p, label: 'prim' }
  }
  if (kind === 'arr') {
    const el = prim()
    const bound = pick([0, 1, 2])
    return {
      make: () => {
        const base = s.array(el())
        return bound === 1 ? base.min(1) : bound === 2 ? base.max(3) : base
      },
      label: 'arr',
    }
  }
  if (kind === 'du') {
    return {
      make: () =>
        s.discriminatedUnion('t', [
          s.object({ t: s.literal('a'), x: s.number().int() }),
          s.object({ t: s.literal('b'), y: s.string().min(1) }),
        ]),
      label: 'du',
    }
  }
  if (kind === 'nested') {
    const leaf = prim()
    return {
      make: () => s.object({ id: s.number().int(), inner: s.object({ v: leaf(), flag: s.boolean() }) }),
      label: 'nested',
    }
  }
  // flat object, 1-4 fields incl. possible __proto__ key
  const keys = ['a', 'b', 'c', '__proto__'].slice(0, 1 + Math.floor(r() * 4))
  const fieldGens = keys.map(() => prim())
  return {
    make: () => {
      const shape: Record<string, Schema<unknown>> = {}
      keys.forEach((k, i) => (shape[k] = fieldGens[i]!()))
      return s.object(shape)
    },
    label: 'obj',
  }
}

// input pool: valid-ish + every failure mode + hostile shapes
const INPUTS: unknown[] = [
  'hello', 'ab', 'abmidyz', 'abcd', 'ada@example.com', 'not-an-email', '', 'on', 'zzzz',
  0, 1, -1, 3, 6, 42, 150, 151, 1.5, NaN, Infinity, -0,
  true, false, null, undefined, 42n, new Date('2026-01-01'), new Date('bad'),
  {}, [], { a: 1 }, { a: 'ab', b: 42, c: true }, { t: 'a', x: 1 }, { t: 'b', y: 'q' }, { t: 'nope' },
  { id: 1, inner: { v: 'ab', flag: true } }, { id: 1.5, inner: { v: -1, flag: 'x' } }, { id: 1, inner: null },
  [1, 2, 3], ['ab', 'cd'], ['ab', ''], [1, 'x', true], ['a', 'b', 'c', 'd', 'e'],
  // An object carrying an OWN data property literally named "__proto__" (the
  // prototype-pollution-shaped hostile input). NOTE: the literal shorthand
  // `{ __proto__: 'ab' }` would NOT create this — object-literal `__proto__`
  // triggers prototype-SETTING semantics and a primitive value is silently
  // DROPPED, yielding a plain `{}` (CodeQL js/invalid-prototype-value caught
  // that the intended hostile shape never existed). defineProperty creates
  // the real own-key shape.
  Object.defineProperty({}, '__proto__', {
    value: 'ab',
    enumerable: true,
    writable: true,
    configurable: true,
  }),
  Object.create(null), Symbol.for('x'),
]

describe('pure-seam differential — fast seam ≡ general seam (public API)', () => {
  it('10,000 cases: random schema × input SEQUENCES, parse/is/~standard interleaved', () => {
    const r = rng(0x5eab5eed)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
    let seamCovered = 0

    for (let n = 0; n < 10_000; n++) {
      const { make, label } = schemaGrammar(r)
      const fast = make()
      const ref = forceGeneralSeam(make())
      if (seamActive(fast)) seamCovered++

      // a SEQUENCE through the same instances — the ctx-reuse hazard surface
      const steps = 2 + Math.floor(r() * 4)
      for (let step = 0; step < steps; step++) {
        const input = pick(INPUTS)
        const tag = `#${n} ${label} step${step} :: ${safe(input)}`
        const mode = pick(['parse', 'parse', 'parse', 'is', 'std'])
        if (mode === 'is') {
          expect(fast.is(input), tag).toBe(ref.is(input))
        } else if (mode === 'std') {
          const a = fast['~standard'].validate(input)
          const b = ref['~standard'].validate(input)
          expect(a instanceof Promise, tag).toBe(false)
          expect(b instanceof Promise, tag).toBe(false)
          expect(a, tag).toEqual(b)
        } else {
          const a = fast.parse(input)
          const b = ref.parse(input)
          expect(surface(a), tag).toEqual(surface(b))
          if (a.ok && b.ok) {
            // immutable-stripped-clone contract: an object/array output is a
            // FRESH value, never the input aliased (identity must agree with
            // the general seam on both sides).
            if (typeof input === 'object' && input !== null) {
              expect(a.value === input, tag).toBe(b.value === input)
            }
          } else if (!a.ok && !b.ok) {
            // escaped-issues independence: mutating the returned issues array
            // must not corrupt the NEXT parse through the reused ctx.
            ;(a.issues as unknown[]).length = 0
          }
        }
      }
    }
    // The fuzz is only load-bearing if the fast seam is actually exercised —
    // the grammar is built from fast-eligible shapes, so expect a high floor.
    expect(seamCovered).toBeGreaterThan(9_000)
    // The shared sentinel survived 10k cases un-mutated (frozen would have
    // thrown loudly on a write; this locks the read-only contract end-to-end).
    expect(EMPTY_PATH.length).toBe(0)
  })

  it('reused ctx does not leak state across fail→success→fail sequences', () => {
    const P = s.object({ name: s.string().min(2), age: s.number().int() })
    const bad1 = P.parse({ name: 'A', age: 1.5 })
    expect(bad1.ok).toBe(false)
    if (!bad1.ok) expect(bad1.issues).toHaveLength(2)
    const good = P.parse({ name: 'Ada', age: 36 })
    expect(good).toEqual({ ok: true, value: { name: 'Ada', age: 36 } })
    const bad2 = P.parse({ name: 'B', age: 2 })
    expect(bad2.ok).toBe(false)
    // bad1's escaped issues array is untouched by the later parses
    if (!bad1.ok && !bad2.ok) {
      expect(bad1.issues).toHaveLength(2)
      expect(bad2.issues).toHaveLength(1)
      expect(bad1.issues).not.toBe(bad2.issues)
      expect(bad1.issues[0]!.path).toEqual(['name'])
      expect(bad2.issues[0]!.path).toEqual(['name'])
    }
  })

  it('a schema used BOTH as a nested field (_runInto) and at its own seam stays independent', () => {
    // Inner has its own checks → the outer object's JIT falls back to
    // Inner._runInto (outer ctx), while Inner.parse() uses its own seam.
    const Inner = s.object({ v: s.number().int() }).strict()
    const Outer = s.object({ id: s.number().int(), inner: Inner })
    expect(Outer.parse({ id: 1, inner: { v: 2 } })).toEqual({ ok: true, value: { id: 1, inner: { v: 2 } } })
    expect(Inner.parse({ v: 3 })).toEqual({ ok: true, value: { v: 3 } })
    const bothBad = Outer.parse({ id: 1.5, inner: { v: 'x' } })
    expect(bothBad.ok).toBe(false)
    if (!bothBad.ok) expect(bothBad.issues.map((i) => i.path)).toEqual([['id'], ['inner', 'v']])
    expect(Inner.parse({ v: 4 })).toEqual({ ok: true, value: { v: 4 } })
  })

  it('chaining after first parse invalidates the pure seam (recompile is correct)', () => {
    const P = s.number().int()
    expect(P.parse(4)).toEqual({ ok: true, value: 4 })
    expect(seamActive(P)).toBe(true)
    P.refine((v) => (v as number) % 2 === 0, { message: 'even' })
    expect(seamActive(P)).toBe(false) // refine → fallback tree → impure
    expect(P.parse(4)).toEqual({ ok: true, value: 4 })
    const odd = P.parse(3)
    expect(odd.ok).toBe(false)
    if (!odd.ok) expect(odd.issues[0]!.message).toBe('even')
  })

  it('bisect canary: the fast seam is ACTIVE for the flagship shapes', () => {
    // If a future change silently stops branding `_jitPure`, the perf win is
    // gone with zero test failures — this canary makes the regression loud.
    expect(seamActive(s.number().int().min(0).max(150))).toBe(true)
    expect(seamActive(s.string().min(1))).toBe(true)
    expect(seamActive(s.string().email())).toBe(true)
    expect(seamActive(s.object({ name: s.string().min(2), tags: s.array(s.string()) }))).toBe(true)
    // and NOT active where user code / async / pending can run
    expect(seamActive(s.number().refine((v) => (v as number) > 0, { message: 'x' }))).toBe(false)
    expect(seamActive(s.string().serverCheck('k'))).toBe(false)
    // an optional field routes through its `_runInto` fallback → the tree can
    // legitimately yield undefined/user paths → general seam
    expect(seamActive(s.object({ x: s.string().optional() }))).toBe(false)
    expect(seamActive(s.discriminatedUnion('t', [
      s.object({ t: s.literal('a'), x: s.number().int() }),
      s.object({ t: s.literal('b'), y: s.string().min(1) }),
    ]))).toBe(true)
  })
})
