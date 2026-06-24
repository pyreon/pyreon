/**
 * Parity lock for `@pyreon/validate/mini`: every standalone check action must
 * produce a BYTE-IDENTICAL result (verdict + issues + transformed value) to its
 * chainable `s.` counterpart — so the tree-shakeable function-comp API and the
 * ergonomic chainable API are interchangeable, and `formatErrors` / i18n / the
 * compiler treat them the same.
 *
 * Bisect-verify: change any action's op `kind` / message / key → the matching
 * pair's spec fails with the diff.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../index'
import type { Schema } from '../core/schema'
import * as m from '../mini'

/** Serialize a parse result to a stable, comparable shape. */
function snap(schema: Schema<unknown>, input: unknown): unknown {
  const r = schema.parse(input) as {
    ok: boolean
    value?: unknown
    issues?: ReadonlyArray<{ code: string; key?: string; message: string; path: ReadonlyArray<unknown>; params?: unknown }>
  }
  return {
    ok: r.ok,
    value: r.ok ? r.value : undefined,
    issues: (r.issues ?? [])
      .map((i) => ({ code: i.code, key: i.key, message: i.message, path: i.path, params: i.params }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}

/** A parity pair: a mini schema, the chainable equivalent, and inputs to probe. */
interface Pair {
  name: string
  mini: Schema<unknown>
  chain: Schema<unknown>
  inputs: unknown[]
}

const RE = /^a.c$/

const pairs: Pair[] = [
  // ── string length ──
  { name: 'minLength', mini: m.string().check(m.minLength(3)), chain: s.string().min(3), inputs: ['ab', 'abc', 'abcd', 1] },
  { name: 'maxLength', mini: m.string().check(m.maxLength(3)), chain: s.string().max(3), inputs: ['ab', 'abc', 'abcd'] },
  { name: 'length', mini: m.string().check(m.length(3)), chain: s.string().length(3), inputs: ['ab', 'abc', 'abcd'] },
  { name: 'nonEmpty', mini: m.string().check(m.nonEmpty()), chain: s.string().nonEmpty(), inputs: ['', 'x'] },
  // ── string format ──
  { name: 'regex', mini: m.string().check(m.regex(RE)), chain: s.string().regex(RE), inputs: ['abc', 'axc', 'xyz'] },
  { name: 'email', mini: m.string().check(m.email()), chain: s.string().email(), inputs: ['a@b.co', 'nope', 'x@y'] },
  { name: 'url', mini: m.string().check(m.url()), chain: s.string().url(), inputs: ['https://x.io', 'ftp://x', 'nope'] },
  { name: 'uuid', mini: m.string().check(m.uuid()), chain: s.string().uuid(), inputs: ['00000000-0000-1000-8000-000000000000', 'nope'] },
  // ── string position ──
  { name: 'startsWith', mini: m.string().check(m.startsWith('foo')), chain: s.string().startsWith('foo'), inputs: ['foobar', 'barfoo'] },
  { name: 'endsWith', mini: m.string().check(m.endsWith('bar')), chain: s.string().endsWith('bar'), inputs: ['foobar', 'barfoo'] },
  { name: 'includes', mini: m.string().check(m.includes('mid')), chain: s.string().includes('mid'), inputs: ['amidb', 'nope'] },
  // ── string transforms ──
  { name: 'trim', mini: m.string().check(m.trim()), chain: s.string().trim(), inputs: ['  hi  ', 'x'] },
  { name: 'toLowerCase', mini: m.string().check(m.toLowerCase()), chain: s.string().toLowerCase(), inputs: ['HeLLo'] },
  { name: 'toUpperCase', mini: m.string().check(m.toUpperCase()), chain: s.string().toUpperCase(), inputs: ['HeLLo'] },
  // ── number bounds ──
  { name: 'minValue', mini: m.number().check(m.minValue(0)), chain: s.number().min(0), inputs: [-1, 0, 1] },
  { name: 'gte (alias)', mini: m.number().check(m.gte(0)), chain: s.number().min(0), inputs: [-1, 0, 1] },
  { name: 'maxValue', mini: m.number().check(m.maxValue(10)), chain: s.number().max(10), inputs: [9, 10, 11] },
  { name: 'gt', mini: m.number().check(m.gt(0)), chain: s.number().gt(0), inputs: [-1, 0, 1] },
  { name: 'lt', mini: m.number().check(m.lt(0)), chain: s.number().lt(0), inputs: [-1, 0, 1] },
  { name: 'between', mini: m.number().check(m.between(0, 10)), chain: s.number().between(0, 10), inputs: [-1, 5, 11] },
  // ── number nature ──
  { name: 'integer', mini: m.number().check(m.integer()), chain: s.number().int(), inputs: [1, 1.5] },
  { name: 'finite', mini: m.number().check(m.finite()), chain: s.number().finite(), inputs: [1, Number.POSITIVE_INFINITY, Number.NaN] },
  { name: 'positive', mini: m.number().check(m.positive()), chain: s.number().positive(), inputs: [-1, 0, 1] },
  { name: 'negative', mini: m.number().check(m.negative()), chain: s.number().negative(), inputs: [-1, 0, 1] },
  { name: 'nonNegative', mini: m.number().check(m.nonNegative()), chain: s.number().nonNegative(), inputs: [-1, 0, 1] },
  { name: 'nonPositive', mini: m.number().check(m.nonPositive()), chain: s.number().nonPositive(), inputs: [-1, 0, 1] },
  { name: 'multipleOf', mini: m.number().check(m.multipleOf(3)), chain: s.number().multipleOf(3), inputs: [3, 4, 6] },
]

describe('mini action parity with chainable methods', () => {
  for (const p of pairs) {
    it(`${p.name}: mini ≡ chainable`, () => {
      for (const input of p.inputs) {
        expect(snap(p.mini, input), `input=${JSON.stringify(input)}`).toEqual(snap(p.chain, input))
      }
    })
  }

  it('composes multiple actions in one .check() identically to a chained method run', () => {
    const mini = m.string().check(m.minLength(2), m.maxLength(5), m.includes('x'))
    const chain = s.string().min(2).max(5).includes('x')
    for (const input of ['x', 'axb', 'toolongx', 'noinc']) {
      expect(snap(mini, input)).toEqual(snap(chain, input))
    }
  })

  it('pipe() applies actions identically to .check()', () => {
    const a = m.pipe(m.string(), m.minLength(2), m.email())
    const b = m.string().check(m.minLength(2), m.email())
    for (const input of ['a@b.co', 'x', 'nope']) expect(snap(a, input)).toEqual(snap(b, input))
  })

  it('nested object schema: mini ≡ chainable', () => {
    const Mini = m.object({
      name: m.string().check(m.minLength(2)),
      email: m.string().check(m.email()),
      age: m.number().check(m.integer(), m.minValue(0), m.maxValue(150)),
    })
    const Chain = s.object({
      name: s.string().min(2),
      email: s.string().email(),
      age: s.number().int().min(0).max(150),
    })
    const inputs = [
      { name: 'Al', email: 'a@b.co', age: 30 },
      { name: 'A', email: 'nope', age: -1 },
      { name: 'Bob', email: 'b@c.com', age: 1.5 },
    ]
    for (const input of inputs) expect(snap(Mini, input)).toEqual(snap(Chain, input))
  })
})

describe('mini base is LEAN (the tree-shaking guarantee)', () => {
  it('mini string()/number() carry NO format/range methods (the lean-base contract)', () => {
    const str = m.string() as unknown as Record<string, unknown>
    const num = m.number() as unknown as Record<string, unknown>
    // If these methods existed, the prototype would drag every format/range
    // validator — defeating tree-shaking. They must live ONLY on the chainable
    // classes (main entry).
    for (const k of ['email', 'url', 'uuid', 'min', 'max', 'regex', 'startsWith']) {
      expect(str[k], `mini string should NOT have .${k}`).toBeUndefined()
    }
    for (const k of ['min', 'max', 'int', 'positive', 'multipleOf', 'between']) {
      expect(num[k], `mini number should NOT have .${k}`).toBeUndefined()
    }
    // …but the GENERIC, validator-free composition surface IS present.
    for (const method of ['check', 'optional', 'nullable', 'transform', 'refine', 'parse']) {
      expect(typeof str[method], `mini string should have .${method}`).toBe('function')
    }
  })

  it('mini schemas are Standard Schema-native (DX helpers work on them)', () => {
    const schema = m.string().check(m.email()) as unknown as Record<string, unknown>
    expect(typeof (schema['~standard'] as { validate?: unknown })?.validate).toBe('function')
  })

  it('.check() returns the schema so it keeps chaining (.optional() etc.)', () => {
    const opt = m.string().check(m.minLength(2)).optional()
    expect(opt.parse(undefined).ok).toBe(true)
    expect(opt.parse('hi').ok).toBe(true)
    expect(opt.parse('x').ok).toBe(false)
  })
})
