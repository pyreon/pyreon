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
