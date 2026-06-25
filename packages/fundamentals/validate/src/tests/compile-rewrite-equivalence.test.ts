/**
 * Compiler rewrite equivalence — the correctness lock for the "function chaining
 * in, tree-shakeable output" pipeline.
 *
 * `@pyreon/vite-plugin` (opt-in) rewrites a chainable `const X = s.<chain>`
 * schema into the lean `@pyreon/validate/mini` form so the bundle prunes unused
 * checks — WITHOUT the user ever touching a second API. This test drives the
 * two pure compiler halves end to end:
 *
 *   analyzeValidate(`const X = s.<chain>`) → IR → emitSchemaSource(IR) → lean source
 *
 * then evaluates BOTH the original `s.<chain>` and the rewritten lean schema and
 * asserts they validate **byte-identically** (verdict + every issue field) over
 * a corpus of inputs. If they ever diverge, the rewrite is unsafe — so this is
 * the gate that lets the rewrite touch user schema source at all.
 *
 * Bisect-verify: change any action mapping in `emitSchemaSource` (e.g. string
 * `min` → `maxLength`) → the matching case fails with the diff.
 */
import { analyzeValidate, emitSchemaSource } from '@pyreon/compiler'
import { describe, expect, it } from 'vitest'
import { s } from '../index'
import * as mini from '../mini'

/** Build the runtime schema by evaluating the chainable `s.<expr>` source. */
function runtime(expr: string): { parse(i: unknown): unknown } {
  return new Function('s', `return (${expr})`)(s) as { parse(i: unknown): unknown }
}

/** analyzeValidate → emitSchemaSource → eval the rewritten lean schema. */
function rewritten(expr: string): { parse(i: unknown): unknown } {
  const info = analyzeValidate(`const X = ${expr}`)[0]
  if (!info || !info.emittable) throw new Error(`not emittable: ${expr}`)
  const { code, imports } = emitSchemaSource(info.node)
  const names = [...imports]
  const fn = new Function(...names, `return (${code})`)
  return fn(...names.map((n) => (mini as unknown as Record<string, unknown>)[n])) as {
    parse(i: unknown): unknown
  }
}

function snap(schema: { parse(i: unknown): unknown }, input: unknown): unknown {
  const r = schema.parse(input) as {
    ok: boolean
    value?: unknown
    issues?: ReadonlyArray<{ code: string; key?: string; message: string; path: ReadonlyArray<unknown> }>
  }
  return {
    ok: r.ok,
    value: r.ok ? r.value : undefined,
    issues: (r.issues ?? [])
      .map((i) => [i.code, i.key, (i.path ?? []).join('.'), i.message])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}

const corpus: ReadonlyArray<{ expr: string; inputs: unknown[] }> = [
  { expr: 's.string()', inputs: ['x', 1, null] },
  { expr: 's.string().email()', inputs: ['a@b.co', 'nope', 'x@y'] },
  { expr: 's.string().min(2).max(5)', inputs: ['a', 'abc', 'toolong'] },
  { expr: 's.string().email().min(3)', inputs: ['a@b.co', 'a@b', 'x'] },
  { expr: 's.string().url()', inputs: ['https://x.io', 'ftp://x', 'nope'] },
  { expr: 's.string().uuid()', inputs: ['00000000-0000-1000-8000-000000000000', 'nope'] },
  { expr: 's.string().length(3)', inputs: ['ab', 'abc', 'abcd'] },
  { expr: 's.string().nonEmpty()', inputs: ['', 'x'] },
  { expr: 's.string().regex(/^a.c$/)', inputs: ['abc', 'axc', 'xyz'] },
  { expr: 's.number()', inputs: [1, 'x', Number.NaN] },
  { expr: 's.number().int().min(0).max(150)', inputs: [30, -1, 200, 1.5] },
  { expr: 's.number().gt(0).lt(10)', inputs: [5, 0, 10, -1] },
  { expr: 's.number().gte(0).lte(100)', inputs: [0, 100, -1, 101] },
  { expr: 's.number().positive()', inputs: [1, 0, -1] },
  { expr: 's.number().negative()', inputs: [-1, 0, 1] },
  { expr: 's.boolean()', inputs: [true, false, 1] },
  { expr: 's.literal("hi")', inputs: ['hi', 'bye'] },
  { expr: 's.literal(42)', inputs: [42, 43] },
  {
    expr: 's.object({ name: s.string().min(2), email: s.string().email(), age: s.number().int().min(0) })',
    inputs: [
      { name: 'Al', email: 'a@b.co', age: 5 },
      { name: 'A', email: 'nope', age: -1 },
      { name: 'Bob', email: 'b@c.com', age: 1.5 },
      'not-an-object',
    ],
  },
  { expr: 's.array(s.string().email())', inputs: [['a@b.co'], ['a@b.co', 'nope'], 'x'] },
  { expr: 's.string().email().optional()', inputs: [undefined, 'a@b.co', 'x'] },
  {
    expr: 's.object({ tags: s.array(s.string().min(1)), count: s.number().int().optional() })',
    inputs: [
      { tags: ['a', 'b'], count: 3 },
      { tags: ['', 'b'] },
      { tags: ['a'], count: 1.5 },
    ],
  },
]

describe('compiler rewrite: emitSchemaSource(s.<chain>) ≡ runtime s.<chain>', () => {
  for (const { expr, inputs } of corpus) {
    it(`rewrite ≡ runtime — ${expr}`, () => {
      const rt = runtime(expr)
      const rw = rewritten(expr)
      for (const input of inputs) {
        expect(snap(rw, input), `input=${JSON.stringify(input)}`).toEqual(snap(rt, input))
      }
    })
  }

  it('emits only the constructors + actions actually used (tree-shake surface)', () => {
    const info = analyzeValidate('const X = s.string().email().min(2)')[0]!
    const { code, imports } = emitSchemaSource(info.node)
    expect(code).toBe('string().check(email(), minLength(2))')
    expect([...imports].sort()).toEqual(['email', 'minLength', 'string'])
  })

  it('alias prefix makes the rewrite collision-proof', () => {
    const info = analyzeValidate('const X = s.object({ a: s.string().email() })')[0]!
    const { code, imports } = emitSchemaSource(info.node, '_pv_')
    expect(code).toBe('_pv_object({ a: _pv_string().check(_pv_email()) })')
    // the import set stays the ORIGINAL names (for `import { name as _pv_name }`)
    expect([...imports].sort()).toEqual(['email', 'object', 'string'])
  })

  it('throws on a non-emittable IR (the conservative bail boundary)', () => {
    const info = analyzeValidate('const X = s.string().cuid2()')[0]!
    expect(info.emittable).toBe(false)
    expect(() => emitSchemaSource(info.node)).toThrow(/not emittable/)
  })
})
