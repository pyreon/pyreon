/**
 * `s.union` accepts BOTH call forms + guards non-schema members.
 *
 * Regression: `s.union([a, b])` — the array form every other library uses
 * (Zod / Valibot / ArkType) and the form consistent with `s.tuple([...])` /
 * `s.enum([...])` — used to CRASH at parse time with a cryptic
 * `member['~standard'] is undefined` deep in `UnionSchema._compileType`,
 * because the factory was rest-args-only (`s.union(a, b)`) and the array was
 * stored as a single "member". Now both forms work; a genuinely bad member
 * (non-schema, or fewer than two) throws a clear `[Pyreon]` error at
 * construction instead of a cryptic parse-time crash.
 *
 * Fuzz-found (JIT↔interp partial-inline differential campaign, 2026-07).
 */
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('s.union — call forms', () => {
  it('array form s.union([a, b]) parses like the rest form (Zod-compatible)', () => {
    const u = s.union([s.string().min(1), s.number().int()])
    expect(u.parse('x')).toEqual({ ok: true, value: 'x' })
    expect(u.parse(42)).toEqual({ ok: true, value: 42 })
    expect(u.parse(true).ok).toBe(false)
  })

  it('rest form s.union(a, b) still works', () => {
    const u = s.union(s.string().min(1), s.number().int())
    expect(u.parse('x')).toEqual({ ok: true, value: 'x' })
    expect(u.parse(true).ok).toBe(false)
  })

  it('both forms produce identical verdicts + values across inputs', () => {
    const arr = s.union([s.string().min(2), s.number().int(), s.boolean()])
    const rest = s.union(s.string().min(2), s.number().int(), s.boolean())
    for (const input of ['ab', 'a', 7, 1.5, true, null, {}, []]) {
      expect(arr.parse(input)).toEqual(rest.parse(input))
    }
  })

  it('.or() (2-arg factory path) is unaffected', () => {
    expect(s.string().or(s.number()).parse(7)).toEqual({ ok: true, value: 7 })
  })

  it('three-plus members work in both forms', () => {
    const u = s.union([s.literal('a'), s.literal('b'), s.literal('c')])
    expect(u.parse('b')).toEqual({ ok: true, value: 'b' })
    expect(u.parse('z').ok).toBe(false)
  })

  it('a non-schema member throws a clear [Pyreon] error, not a cryptic parse crash', () => {
    // @ts-expect-error — deliberately bad member
    expect(() => s.union(s.string(), undefined)).toThrow(/\[Pyreon\] s\.union/)
    // @ts-expect-error — deliberately bad member
    expect(() => s.union([s.string(), 42])).toThrow(/\[Pyreon\] s\.union/)
  })

  it('fewer than two members throws a clear [Pyreon] error', () => {
    // @ts-expect-error — deliberately too few
    expect(() => s.union([s.string()])).toThrow(/at least two/)
    // @ts-expect-error — deliberately too few
    expect(() => s.union(s.string())).toThrow(/at least two/)
  })
})
