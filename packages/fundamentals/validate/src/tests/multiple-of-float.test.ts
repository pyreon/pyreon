// `multipleOf` with a FRACTIONAL step, checked against an EXACT decimal
// reference on all three execution paths: the interpreter (`compileSchema`),
// the JIT (`tryCompileJit`) and the JIT verdict mode behind `.is()`
// (`tryCompileJitCheck`) -- for both the chainable method and the `/mini`
// action.
//
// The check was `value % step === 0`. `0.01` has no binary representation,
// so `19.99 % 0.01` is `0.009999999999998` and `.multipleOf(0.01)` rejected
// every valid price; the JIT inlined the same `%`. An integer step was always
// exact (fmod is exact) and is still expected to behave byte-identically.
//
// The reference reads each number's SHORTEST decimal spelling -- the value a
// person typed -- and decides divisibility exactly in BigInt arithmetic.
import { describe, expect, it } from 'vitest'
import { multipleOf as multipleOfAction } from '../actions/number'
import { tryCompileJit, tryCompileJitCheck } from '../core/jit'
import type { ParseCtx } from '../core/ops'
import { compileSchema, type Schema } from '../core/schema'
import { number } from '../primitives/number'
import { s } from '../v1'

/** `d` as an exact (mantissa, decimal places) pair from its shortest spelling. */
function decimal(d: number): { m: bigint; e: number } {
  const [coef, expPart] = String(d).toLowerCase().split('e')
  const exp = Number(expPart ?? 0)
  const [int, frac = ''] = (coef as string).split('.')
  const places = frac.length - exp
  const digits = BigInt(`${int}${frac}`)
  return places >= 0 ? { m: digits, e: places } : { m: digits * 10n ** BigInt(-places), e: 0 }
}

/** Exact decimal divisibility: is `v` an integer multiple of `n`? */
function reference(v: number, n: number): boolean {
  const a = decimal(v)
  const b = decimal(n)
  const e = Math.max(a.e, b.e)
  const va = a.m * 10n ** BigInt(e - a.e)
  const nb = b.m * 10n ** BigInt(e - b.e)
  return va % nb === 0n
}

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const passes = (compiled: (i: unknown, c: ParseCtx) => unknown, v: number): boolean => {
  const ctx: ParseCtx = { issues: [], path: [] }
  compiled(v, ctx)
  return ctx.issues.length === 0
}

function paths(schema: Schema<unknown>): Array<[string, (v: number) => boolean]> {
  const jit = tryCompileJit(schema)
  const check = tryCompileJitCheck(schema)
  const interp = compileSchema(schema)
  if (!jit || !check) throw new Error('expected a JIT-able schema')
  return [
    ['interpreter', (v) => passes(interp, v)],
    ['jit', (v) => passes(jit, v)],
    ['jit-verdict', (v) => check(v)],
  ]
}

const STEPS = [0.01, 0.1, 0.05, 0.25, 0.001, 1.5, 0.3, 2.5e-7, 3, 7, 1]

describe('multipleOf agrees with exact decimal arithmetic', () => {
  for (const step of STEPS) {
    const schemas: Array<[string, Schema<unknown>]> = [
      ['method', s.number().multipleOf(step) as Schema<unknown>],
      ['action', multipleOfAction(step)(number()) as Schema<unknown>],
    ]
    it(`step ${step}`, () => {
      const r = rng(Math.round(step * 1e9) + 7)
      const values: number[] = []
      for (let i = 0; i < 400; i++) {
        const k = Math.floor(r() * 100_000) - 50_000
        // An exact multiple (spelled as the product rounds to), and a near
        // miss one smaller decimal place away.
        values.push(Number((k * step).toPrecision(12)))
        values.push(Number((k * step + step / 10).toPrecision(12)))
      }
      values.push(19.99, 19.995, 0.3, 0, -0.07, 1e21)
      for (const [label, schema] of schemas) {
        for (const [path, run] of paths(schema)) {
          for (const v of values) {
            expect(run(v), `${label}/${path}: ${v} multipleOf ${step}`).toBe(reference(v, step))
          }
        }
      }
    })
  }

  it('the case that shipped broken: 19.99 is a multiple of 0.01', () => {
    expect(s.number().multipleOf(0.01).parse(19.99).ok).toBe(true)
    expect(s.number().multipleOf(0.01).is(19.99)).toBe(true)
    expect(s.number().multipleOf(0.01).parse(19.995).ok).toBe(false)
  })
})
