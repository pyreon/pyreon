// Security regression: the JIT constructs its validator via `new Function`, so
// every value that reaches the generated source is a code-construction sink.
// Runtime values (regex/refine/serverCheck fns, literal values) are closure-
// captured into `H[]`; string literals go through `JSON.stringify`; numeric
// check bounds go through `numLit` (`String(Number(n))`) so the interpolated
// token is ALWAYS a numeric literal. This proves a rogue non-numeric bound —
// what a raw-JS caller could sneak past the `.min(n: number)` types — cannot
// inject code, and that a normal numeric bound behaves exactly as before.
//
// Bisect: revert `numLit(op.n)` → `${op.n}` in inlineCheckCond and the
// "cannot inject" spec fails (the payload's `globalThis` write executes at
// compile time, flipping __PWNED__ to true).
import { describe, expect, it } from 'vitest'
import { tryCompileJit } from '../core/jit'
import type { ParseCtx } from '../core/ops'
import type { Schema } from '../core/schema'
import { s } from '../v1'

const run = (schema: Schema<unknown>, input: unknown) => {
  const compiled = tryCompileJit(schema)
  if (!compiled) throw new Error('schema did not JIT-compile — test needs a JIT-eligible shape')
  const ctx: ParseCtx = { issues: [], path: [] }
  const value = compiled(input, ctx)
  return { value, issues: ctx.issues }
}

// Reach into a schema's ops and overwrite a numeric bound with an arbitrary
// value — simulating a raw-JS caller that bypassed the `number` types.
const pokeBound = (schema: Schema<unknown>, key: 'n' | 'lo' | 'hi', payload: unknown): Schema<unknown> => {
  const ops = (schema as unknown as { _ops: Array<Record<string, unknown>> })._ops
  const target = ops.find((o) => String(o.kind).startsWith('check:') && key in o)
  if (!target) throw new Error(`no check op with a '${key}' bound on this schema`)
  target[key] = payload
  return schema
}

describe('JIT codegen safety — numeric bounds cannot inject code', () => {
  it('a rogue string bound does NOT execute injected code (min/length)', () => {
    ;(globalThis as Record<string, unknown>).__PWNED__ = undefined
    // If `${op.n}` were interpolated raw, the generated source would be
    // `v.length < 0); globalThis.__PWNED__ = true; (0` — the assignment runs
    // the moment `new Function` compiles the body.
    const payload = '0); globalThis.__PWNED__ = true; (0'
    const schema = pokeBound(s.string().min(3), 'n', payload)
    expect(() => run(schema, 'abcd')).not.toThrow() // still valid JS source
    expect((globalThis as Record<string, unknown>).__PWNED__).toBeUndefined()
    delete (globalThis as Record<string, unknown>).__PWNED__
  })

  it('a rogue bound coerces to NaN → the check simply never passes/fails on it', () => {
    // `v.length < NaN` is always false; the point is only that nothing injected.
    const schema = pokeBound(s.string().min(3), 'n', 'not-a-number')
    const { issues } = run(schema, 'x')
    expect(Array.isArray(issues)).toBe(true) // ran to completion, no throw
  })

  it('a rogue between bound (lo/hi) cannot inject', () => {
    ;(globalThis as Record<string, unknown>).__PWNED2__ = undefined
    const schema = pokeBound(s.number().between(0, 10), 'hi', '10); globalThis.__PWNED2__ = true; (10')
    expect(() => run(schema, 5)).not.toThrow()
    expect((globalThis as Record<string, unknown>).__PWNED2__).toBeUndefined()
    delete (globalThis as Record<string, unknown>).__PWNED2__
  })

  it('normal numeric bounds are unaffected (min/max still reject + accept)', () => {
    const schema = s.string().min(2).max(4)
    expect(run(schema, 'abc').issues.length).toBe(0) // in range
    expect(run(schema, 'a').issues.length).toBeGreaterThan(0) // too short
    expect(run(schema, 'abcde').issues.length).toBeGreaterThan(0) // too long
  })

  it('Infinity bound stays a valid token (String(Number(Infinity)) === "Infinity")', () => {
    const schema = pokeBound(s.number().max(1), 'n', Infinity)
    expect(run(schema, 1e300).issues.length).toBe(0) // nothing exceeds Infinity
  })
})
