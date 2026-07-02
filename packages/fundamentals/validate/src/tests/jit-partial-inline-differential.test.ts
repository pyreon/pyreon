/**
 * JIT ↔ interpreter differential for the PARTIAL-INLINE seam — the blind spot
 * of `jit-differential.test.ts`, whose random schemas only use
 * string/number/boolean/object/array fields (all FULLY inlined by the JIT).
 *
 * Here every generated object/array wraps FALLBACK-triggering field types
 * (optional / nullable / nullish / default / catch / union /
 * discriminatedUnion / record / tuple / map / set / coerce / transform /
 * refine / intersection / lazy / enum / strict-nested). The JIT inlines the
 * outer container and emits `_runInto` calls for those subtrees against the
 * SHARED ctx — the exact seam where a path / issue / value / async-diagnostic
 * divergence would hide. Both backends must produce identical
 * { threw, isPromise, ok, value?, issues } for every (schema, input).
 *
 * Seeded (mulberry32) → deterministic; a failure prints its seed.
 */
import { describe, expect, it } from 'vitest'
import { compileSchema } from '../core/schema'
import { tryCompileJit } from '../core/jit'
import type { ParseCtx } from '../core/ops'
import type { Schema } from '../core/schema'
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

function run(fn: (i: unknown, c: ParseCtx) => unknown, input: unknown) {
  const ctx: ParseCtx = { issues: [], path: [] }
  let value: unknown
  let threw: string | undefined
  try {
    value = fn(input, ctx)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }
  const isPromise = value instanceof Promise
  const ok = !threw && !isPromise && ctx.issues.length === 0
  return {
    threw,
    isPromise,
    ok,
    value: ok ? value : undefined,
    issues: (ctx.issues as Array<{ message?: string; path?: unknown[] }>).map((i) => ({
      message: i.message,
      path: JSON.stringify(i.path ?? []),
    })),
  }
}

// Fallback-triggering subtree builders (NOT fully inlined by the JIT).
function fallbackField(r: () => number): Schema<unknown> {
  switch (Math.floor(r() * 18)) {
    case 0: return s.string().optional() as Schema<unknown>
    case 1: return s.number().int().nullable() as Schema<unknown>
    case 2: return s.string().min(2).nullish() as Schema<unknown>
    case 3: return s.number().default(7) as Schema<unknown>
    case 4: return s.string().catch('fallback') as Schema<unknown>
    case 5: return s.union([s.string().min(1), s.number().int()]) as Schema<unknown>
    case 6:
      return s.discriminatedUnion('t', [
        s.object({ t: s.literal('a'), v: s.string() }),
        s.object({ t: s.literal('b'), n: s.number() }),
      ]) as Schema<unknown>
    case 7: return s.record(s.string(), s.number().int()) as Schema<unknown>
    case 8: return s.tuple([s.string().min(1), s.number().int()]) as Schema<unknown>
    case 9: return s.map(s.string(), s.number()) as Schema<unknown>
    case 10: return s.set(s.number().int()) as Schema<unknown>
    case 11: return s.coerce.number() as Schema<unknown>
    case 12: return s.number().transform((n: number) => n * 2) as Schema<unknown>
    case 13: return s.string().refine((v: string) => v.length > 2, { message: 'too short' }) as Schema<unknown>
    case 14:
      return s.intersection(s.object({ a: s.string() }), s.object({ b: s.number() })) as Schema<unknown>
    case 15: return s.lazy(() => s.number().int()) as Schema<unknown>
    case 16: return s.enum(['red', 'green', 'blue']) as Schema<unknown>
    default: return s.object({ inner: s.string().min(1) }).strict() as Schema<unknown>
  }
}

function randValue(r: () => number): unknown {
  const xs: unknown[] = [
    'x', 'xy', 'xyz', '', 'red', 7, 0, -1, 1.5, NaN, true, false, null, undefined,
    {}, [], { a: 'q', b: 2 }, { t: 'a', v: 's' }, { t: 'b', n: 3 }, { t: 'c' },
    [1, 2], ['a', 'b'], ['a', 1], new Map([['k', 1]]), new Set([1, 2]),
    { inner: 'ok' }, { inner: '' }, { inner: 'ok', extra: 1 }, '7', 42n,
  ]
  return xs[Math.floor(r() * xs.length)]
}

describe('JIT differential — partial-inline seam (fallback fields in JIT-able containers)', () => {
  it('4000 seeded object/array-of-fallback schemas × inputs agree JIT ≡ interpreter', () => {
    const r = rng(0x51ede1)
    const failures: string[] = []
    const keyNames = ['a', 'b', 'c', '__proto__']

    for (let seed = 1; seed <= 4000; seed++) {
      const rootIsArray = r() < 0.35
      const schema = rootIsArray
        ? (s.array(fallbackField(r) as never) as Schema<unknown>)
        : (() => {
            const shape: Record<string, Schema<unknown>> = {}
            const n = 1 + Math.floor(r() * 3)
            for (let i = 0; i < n; i++) shape[keyNames[i]!] = fallbackField(r)
            return s.object(shape as never) as Schema<unknown>
          })()

      const jit = tryCompileJit(schema)
      if (!jit) continue // not a JIT root → same validator both sides → nothing to compare
      const interp = compileSchema(schema)

      let input: unknown
      const roll = r()
      if (roll < 0.15) input = randValue(r)
      else if (rootIsArray) {
        const len = Math.floor(r() * 4)
        const arr: unknown[] = []
        for (let i = 0; i < len; i++) arr.push(randValue(r))
        input = arr
      } else {
        const obj: Record<string, unknown> = {}
        // Re-derive the shape keys deterministically isn't needed — just spray.
        for (const k of keyNames) if (r() > 0.4) obj[k] = randValue(r)
        input = obj
      }

      const a = run(jit, input)
      const b = run(interp, input)
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        failures.push(
          `seed=${seed} :: JIT=${JSON.stringify(a).slice(0, 200)} INTERP=${JSON.stringify(b).slice(0, 200)}`,
        )
        if (failures.length >= 5) break
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})
