/**
 * Two emitter levers for the deep parse cells (`object.array-of-objects`,
 * `array.20-objects`), each locked on the EMIT it produces and on the failure
 * PATHS it must still reconstruct:
 *
 *  1. PENDING PATH ACROSS PURE ARRAYS — an inline array whose element subtree
 *     is pure inline (no `_runInto` fallback anywhere) no longer materializes
 *     `ctx.path` (`P = mutablePath(ctx); P.push("items"); … P.pop()`) on every
 *     parse. Its loop index stays PENDING and every failure site under it
 *     receives the indices as trailing arguments. A fallback element still
 *     flushes (the interpreter it runs reads the real path).
 *  2. COMPOSITE FIELDS IN THE OBJECT LITERAL — a pure inline object/array
 *     field is captured into a hoisted temp and read by ONE object literal,
 *     instead of `{}` + per-key assignment.
 *
 * The JIT↔interpreter differential fuzz compares issue paths for the whole
 * grammar; these are the named shapes.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../index'
import { tryCompileJit } from '../core/jit'

const emit = (schema: unknown): string => tryCompileJit(schema as never)?.toString() ?? ''
const issues = (schema: { parse(v: unknown): unknown }, v: unknown) =>
  ((schema.parse(v) as { issues?: { code: string; path: unknown[] }[] }).issues ?? []).map((i) => [i.code, i.path])

describe('pending path across pure-inline arrays', () => {
  it('a pure element subtree emits NO ctx.path flush', () => {
    const S = s.object({ page: s.number(), items: s.array(s.object({ id: s.number().int(), title: s.string().min(1) })) })
    const src = emit(S)
    expect(src).not.toContain('P.push')
    expect(src).not.toContain('P.pop')
    expect(src).not.toMatch(/var P = /)
  })

  it('failure sites under nested pure arrays reconstruct the full path from trailing indices', () => {
    const S = s.object({ items: s.array(s.object({ tags: s.array(s.string().email()), n: s.number() }).strict()) })
    expect(emit(S)).not.toContain('P.push')
    expect(issues(S, { items: [{ tags: ['a@b.co'], n: 1 }, { tags: ['ok@x.io', 'bad'], n: 'z', extra: 1 }] })).toEqual([
      ['invalid_format', ['items', 1, 'tags', 1]],
      ['wrong_type', ['items', 1, 'n']],
      ['unrecognized_keys', ['items', 1, 'extra']],
    ])
    // array-level own check under a pending path
    const A = s.object({ rows: s.array(s.array(s.number()).min(2)) })
    expect(emit(A)).not.toContain('P.push')
    expect(issues(A, { rows: [[1, 2], [3]] })).toEqual([['too_small', ['rows', 1]]])
  })

  it('a FALLBACK element still flushes the real path (and reports correctly)', () => {
    const F = s.object({ items: s.array(s.object({ v: s.number().optional(), w: s.string() })) })
    expect(emit(F)).toContain('P.push("items")')
    expect(issues(F, { items: [{ v: 1, w: 'a' }, { v: 'no', w: 2 }] })).toEqual([
      ['wrong_type', ['items', 1, 'v']],
      ['wrong_type', ['items', 1, 'w']],
    ])
  })

  it('a discriminated-union element with pure members stays pending; one with a fallback member flushes', () => {
    const pure = s.object({
      evs: s.array(s.discriminatedUnion('k', [s.object({ k: s.literal('a'), x: s.number() }), s.object({ k: s.literal('b'), y: s.string() })])),
    })
    expect(emit(pure)).not.toContain('P.push')
    expect(issues(pure, { evs: [{ k: 'a', x: 1 }, { k: 'b', y: 2 }, { k: 'c' }] })).toEqual([
      ['wrong_type', ['evs', 1, 'y']],
      ['invalid_union_discriminator', ['evs', 2, 'k']],
    ])
    const withFallback = s.object({
      evs: s.array(s.discriminatedUnion('k', [s.object({ k: s.literal('a'), x: s.number().nullable() })])),
    })
    expect(emit(withFallback)).toContain('P.push("evs")')
    expect(issues(withFallback, { evs: [{ k: 'a', x: 'no' }] })).toEqual([['wrong_type', ['evs', 0, 'x']]])
  })
})

describe('composite fields in the object literal', () => {
  it('a pure object/array field is read by ONE root literal', () => {
    const S = s.object({ page: s.number(), meta: s.object({ a: s.string() }), items: s.array(s.number()) })
    const src = emit(S)
    expect(src).toMatch(/let t\d+ = \{ "page": t\d+, "meta": t\d+, "items": t\d+ \};/)
    expect(src).not.toMatch(/let t\d+ = \{\};/)
    const out = S.parse({ page: 1, meta: { a: 'x', junk: 1 }, items: [1, 2] }) as { value: unknown }
    expect(out.value).toEqual({ page: 1, meta: { a: 'x' }, items: [1, 2] })
  })

  it('a field that can defer or yield undefined keeps the assign form', () => {
    const S = s.object({ page: s.number(), opt: s.object({ a: s.string() }).optional() })
    expect(emit(S)).toMatch(/let t\d+ = \{\};/)
  })
})
