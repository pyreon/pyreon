/**
 * Island prop codec — server-side encode + client-side decode roundtrip.
 *
 * Locks the contract that every value the codec claims to support comes
 * out of the JSON wire with the SAME identity-class as it went in. The
 * naïve `JSON.stringify` path silently collapses Date → string,
 * Map/Set → `{}`, throws on BigInt; this test set is the regression
 * gate against re-introducing any of those.
 */

import { describe, expect, it } from 'vitest'
import { decodeIslandProps, encodeIslandProps, IslandPropEncodeError } from '../island-codec'

/** Round-trip helper: encode → JSON.stringify → JSON.parse → decode. */
function roundtrip<T>(value: T, islandName = 'TestIsland'): unknown {
  const encoded = encodeIslandProps(value, islandName)
  const json = JSON.stringify(encoded)
  const parsed = JSON.parse(json)
  return decodeIslandProps(parsed)
}

describe('encodeIslandProps + decodeIslandProps — JSON-native passthrough', () => {
  it('roundtrips primitives identically', () => {
    expect(roundtrip({ s: 'hi', n: 42, b: true, nu: null })).toEqual({
      s: 'hi',
      n: 42,
      b: true,
      nu: null,
    })
  })

  it('roundtrips nested plain objects + arrays', () => {
    const v = { user: { name: 'A', tags: ['x', 'y'], stats: { a: 1, b: 2 } } }
    expect(roundtrip(v)).toEqual(v)
  })

  it('drops functions / symbols / undefined silently on plain object props', () => {
    const fn = () => 1
    const sym = Symbol('s')
    const out = roundtrip({ keep: 1, fn, sym, undef: undefined }) as Record<string, unknown>
    expect(out).toEqual({ keep: 1 })
    expect('fn' in out).toBe(false)
    expect('sym' in out).toBe(false)
    expect('undef' in out).toBe(false)
  })

  it('replaces functions / symbols / undefined inside arrays with null (matches JSON.stringify)', () => {
    const fn = () => 1
    const sym = Symbol('s')
    const out = roundtrip({ arr: [1, fn, sym, undefined, 'x'] }) as { arr: unknown[] }
    expect(out.arr).toEqual([1, null, null, null, 'x'])
  })
})

describe('encodeIslandProps + decodeIslandProps — non-JSON-native roundtrip', () => {
  it('Date → real Date on the client (was: ISO string)', () => {
    const d = new Date('2026-05-20T10:00:00.000Z')
    const out = roundtrip({ when: d }) as { when: Date }
    expect(out.when).toBeInstanceOf(Date)
    expect(out.when.toISOString()).toBe(d.toISOString())
  })

  it('Map → real Map on the client (was: lost as {})', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
    ])
    const out = roundtrip({ m }) as { m: Map<string, number> }
    expect(out.m).toBeInstanceOf(Map)
    expect(out.m.size).toBe(2)
    expect(out.m.get('a')).toBe(1)
    expect(out.m.get('b')).toBe(2)
  })

  it('Set → real Set on the client (was: lost as {})', () => {
    const s = new Set<number>([1, 2, 3])
    const out = roundtrip({ s }) as { s: Set<number> }
    expect(out.s).toBeInstanceOf(Set)
    expect([...out.s].sort()).toEqual([1, 2, 3])
  })

  it('RegExp → real RegExp on the client (was: lost as {})', () => {
    const r = /abc/gi
    const out = roundtrip({ r }) as { r: RegExp }
    expect(out.r).toBeInstanceOf(RegExp)
    expect(out.r.source).toBe('abc')
    expect(out.r.flags).toBe('gi')
    expect(out.r.test('ABC')).toBe(true)
  })

  it('BigInt → real BigInt on the client (was: threw → empty props)', () => {
    const big = 12_345_678_901_234_567_890n
    const out = roundtrip({ big }) as { big: bigint }
    expect(typeof out.big).toBe('bigint')
    expect(out.big).toBe(big)
  })

  it('nested types compose (Date inside Map inside object)', () => {
    const d = new Date('2026-01-01T00:00:00.000Z')
    const m = new Map<string, Date>([['birthday', d]])
    const out = roundtrip({ user: { name: 'A', m } }) as {
      user: { name: string; m: Map<string, Date> }
    }
    expect(out.user.name).toBe('A')
    expect(out.user.m).toBeInstanceOf(Map)
    const got = out.user.m.get('birthday')!
    expect(got).toBeInstanceOf(Date)
    expect(got.toISOString()).toBe(d.toISOString())
  })

  it('Set of Dates roundtrips', () => {
    const a = new Date('2026-01-01T00:00:00.000Z')
    const b = new Date('2026-06-15T12:00:00.000Z')
    const out = roundtrip({ s: new Set([a, b]) }) as { s: Set<Date> }
    expect(out.s).toBeInstanceOf(Set)
    const arr = [...out.s].sort((x, y) => x.getTime() - y.getTime())
    expect(arr.every((x) => x instanceof Date)).toBe(true)
    expect(arr[0]!.toISOString()).toBe(a.toISOString())
    expect(arr[1]!.toISOString()).toBe(b.toISOString())
  })
})

describe('encodeIslandProps — escape for user objects with __pyreon_t own-key', () => {
  it('roundtrips a plain object whose key literally is __pyreon_t', () => {
    const v = { __pyreon_t: 'my-custom-string', other: 1 }
    const out = roundtrip({ wrapper: v }) as { wrapper: typeof v }
    expect(out.wrapper).toEqual(v)
  })

  it('roundtrips a nested object containing __pyreon_t', () => {
    const v = { x: { __pyreon_t: 'd', spoofed: true }, y: 2 }
    const out = roundtrip(v) as typeof v
    expect(out.x).toEqual({ __pyreon_t: 'd', spoofed: true })
    expect(out.y).toBe(2)
  })

  it('roundtrips when __pyreon_t value itself looks like a tag value', () => {
    // User's own object literally tries to look like a Date tag.
    const v = { wrapper: { __pyreon_t: 'd', v: '2026-01-01T00:00:00.000Z' } }
    const out = roundtrip(v) as typeof v
    expect(out.wrapper).toEqual({
      __pyreon_t: 'd',
      v: '2026-01-01T00:00:00.000Z',
    })
    // Crucially: NOT a Date, even though the shape mimics one.
    expect(out.wrapper).not.toBeInstanceOf(Date)
  })
})

describe('encodeIslandProps — fail-loud on unsupported types', () => {
  it('throws IslandPropEncodeError on a class instance', () => {
    class User {
      constructor(public name: string) {}
    }
    expect(() => encodeIslandProps({ u: new User('A') }, 'Island')).toThrow(IslandPropEncodeError)
    try {
      encodeIslandProps({ u: new User('A') }, 'Island')
    } catch (e) {
      expect(e).toBeInstanceOf(IslandPropEncodeError)
      const err = e as IslandPropEncodeError
      expect(err.propPath).toBe('$.u')
      expect(err.islandName).toBe('Island')
      expect(err.message).toContain('User')
    }
  })

  it('throws on a circular reference, naming the path', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    expect(() => encodeIslandProps(obj, 'Island')).toThrow(IslandPropEncodeError)
    try {
      encodeIslandProps(obj, 'Island')
    } catch (e) {
      expect((e as IslandPropEncodeError).message).toMatch(/Circular/i)
    }
  })

  it('throws on excessive nesting depth (defensive)', () => {
    let leaf: Record<string, unknown> = { value: 1 }
    for (let i = 0; i < 105; i++) leaf = { child: leaf }
    expect(() => encodeIslandProps(leaf, 'Island')).toThrow(IslandPropEncodeError)
  })
})

describe('decodeIslandProps — forward-compat + robustness', () => {
  it('leaves unknown tag values verbatim (forward-compat)', () => {
    expect(decodeIslandProps({ __pyreon_t: 'future-type', v: 42 })).toEqual({
      __pyreon_t: 'future-type',
      v: 42,
    })
  })

  it('returns primitives identically', () => {
    expect(decodeIslandProps('hi')).toBe('hi')
    expect(decodeIslandProps(42)).toBe(42)
    expect(decodeIslandProps(true)).toBe(true)
    expect(decodeIslandProps(null)).toBe(null)
  })

  it('does NOT crash on a malformed Date tag (bad value type)', () => {
    expect(decodeIslandProps({ __pyreon_t: 'd', v: 42 })).toEqual({
      __pyreon_t: 'd',
      v: 42,
    })
  })

  it('does NOT crash on a malformed RegExp tag', () => {
    expect(decodeIslandProps({ __pyreon_t: 'r', v: { source: '[bad' } })).toEqual({
      __pyreon_t: 'r',
      v: { source: '[bad' },
    })
  })
})
