/**
 * `.strict()` must reject EVERY unknown key, including one whose name happens
 * to exist on `Object.prototype`.
 *
 * The unknown-key scan used `key in known`, and `in` walks the prototype chain
 * — so `known` (a plain object literal holding the shape) reported `toString`,
 * `constructor`, `hasOwnProperty`, `valueOf` and friends as KNOWN, and they
 * slipped through strict mode. That is the one thing `.strict()` exists to
 * prevent, and callers reach for it precisely when unknown keys matter.
 *
 * Own-key membership (`Object.hasOwn`) is the correct predicate: the shape's
 * OWN keys are exactly the declared fields.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../index'

// Every enumerable-or-not member a plain object inherits.
const PROTOTYPE_KEYS = [
  'toString',
  'valueOf',
  'hasOwnProperty',
  'constructor',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
] as const

describe('.strict() rejects prototype-named unknown keys', () => {
  const S = s.object({ a: s.number() }).strict()

  it('rejects an ordinary unknown key (control)', () => {
    expect(S.parse({ a: 1, zzz: 1 }).ok).toBe(false)
  })

  it('accepts a clean object (control — the fix must not over-reject)', () => {
    expect(S.parse({ a: 1 }).ok).toBe(true)
  })

  for (const key of PROTOTYPE_KEYS) {
    it(`rejects a key named "${key}"`, () => {
      expect(S.parse({ a: 1, [key]: 1 }).ok).toBe(false)
    })
  }

  it('reports the offending key, not a generic failure', () => {
    const r = S.parse({ a: 1, toString: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(JSON.stringify(r.issues)).toContain('toString')
    }
  })

  it('is() agrees with parse().ok on every prototype-named key', () => {
    for (const key of PROTOTYPE_KEYS) {
      const input = { a: 1, [key]: 1 }
      expect(S.is(input)).toBe(S.parse(input).ok)
    }
  })

  it('a declared field NAMED like a prototype member is still accepted', () => {
    // The predicate must key on the shape's own keys, so declaring one of
    // these names must keep working.
    const T = s.object({ toString: s.number() }).strict()
    expect(T.parse({ toString: 1 }).ok).toBe(true)
    expect(T.parse({ toString: 1, other: 2 }).ok).toBe(false)
  })

  it('nested strict objects reject prototype-named keys too', () => {
    const N = s.object({ deep: s.object({ foo: s.string() }).strict() }).strict()
    expect(N.parse({ deep: { foo: 'x' } }).ok).toBe(true)
    expect(N.parse({ deep: { foo: 'x', valueOf: 1 } }).ok).toBe(false)
  })

  it('catchall VALIDATES a prototype-named key instead of skipping it', () => {
    // Same `in`-vs-hasOwn bug in the catchall branch: the key was treated as
    // known and never validated against the catchall schema.
    const C = s.object({ a: s.number() }).catchall(s.string())
    expect(C.parse({ a: 1, toString: 'ok' }).ok).toBe(true)
    expect(C.parse({ a: 1, toString: 123 }).ok).toBe(false)
  })
})

/**
 * A COUNT IS NOT A MEMBERSHIP TEST (the #3183 fast-path regression).
 *
 * The verdict JIT reduced "no unknown keys" to `Object.keys(x).length === N`,
 * and the parse JIT GUARDED its unknown-key scan on the same count. Both
 * assumed the field checks had proven all N declared keys are OWN — but a
 * field check reads `x.name`, which walks the prototype chain. Two
 * divergences from the interpreter (which scans `Object.keys` + `hasOwn`):
 *
 * - a prototype-carried valid object: `is()` false, `parse().ok` true;
 * - a typo'd key in place of a real one keeps the own-key count at N, so
 *   `Unrecognized key "nmae"` was never reported.
 *
 * Bisect-verified: with the count fast path restored, the `is() ⇔ parse().ok`
 * specs fail with `expected false to be true` and the typo spec with
 * `expected [ 'wrong_type' ] to contain 'unrecognized_keys'`.
 */
describe('.strict() — own-key COUNT is not membership (JIT ⇔ interpreter)', () => {
  const S = s.object({ name: s.string(), age: s.number() }).strict()
  class WithGetters {
    get name() {
      return 'Ada'
    }
    get age() {
      return 36
    }
  }

  it('a prototype-carried object (Object.create) — is() agrees with parse()', () => {
    const input = Object.create({ name: 'Ada', age: 36 }) as object
    expect(S.parse(input).ok).toBe(true)
    expect(S.is(input)).toBe(true)
  })

  it('a class instance whose fields are prototype getters — is() agrees with parse()', () => {
    const input = new WithGetters()
    expect(S.parse(input).ok).toBe(true)
    expect(S.is(input)).toBe(true)
  })

  it('a prototype-carried object with an extra OWN key is still rejected on both paths', () => {
    const input = Object.assign(Object.create({ name: 'Ada', age: 36 }), { zzz: 1 })
    expect(S.parse(input).ok).toBe(false)
    expect(S.is(input)).toBe(false)
  })

  it('a typo\'d key in place of a real one is REPORTED, not just the missing field', () => {
    const r = S.parse({ nmae: 'Ada', age: 36 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const codes = r.issues.map((i) => i.code)
      expect(codes).toContain('wrong_type')
      expect(codes).toContain('unrecognized_keys')
      expect(JSON.stringify(r.issues)).toContain('nmae')
    }
    expect(S.is({ nmae: 'Ada', age: 36 })).toBe(false)
  })

  it('a typo\'d key nested one level down is reported with its path', () => {
    const N = s.object({ inner: S })
    const r = N.parse({ inner: { nmae: 'Ada', age: 36 } })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const bad = r.issues.find((i) => i.code === 'unrecognized_keys')
      expect(bad?.path).toEqual(['inner', 'nmae'])
    }
  })

  it('the exact declared own keys still short-circuit to valid (control)', () => {
    expect(S.is({ name: 'Ada', age: 36 })).toBe(true)
    expect(S.parse({ name: 'Ada', age: 36 }).ok).toBe(true)
  })
})
