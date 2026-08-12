// THE WEB ARM of a three-way parity contract.
//
// The same cases, in the same order, are asserted in:
//   - native/tests/PyreonSizedMapTests.swift   (@main, compiled + RUN by the gate)
//   - native/tests/PyreonSizedMapTest.kt       (smoke main(), compiled + RUN)
//   - this file                                (the web implementation)
//
// Why it exists: the native programs originally asserted what I BELIEVED the
// web did. Two implementations agreeing with each other is mirrored parity, not
// proven parity — if the belief were wrong, all three would agree on the wrong
// answer and every gate would stay green. This arm measures the web instead of
// assuming it, so the trio is provably identical rather than plausibly so.
//
// The three cannot share one literal table (two of them are Swift and Kotlin),
// so the contract is enforced by review + this comment. If you change a case
// here, change it in BOTH native files; if the web semantics change, these
// assertions fail FIRST and point at the mirrors to update.
//
// The eviction rules are subtle enough to be worth this: FIFO is the default
// (a read does NOT rescue an entry), LRU is opt-in, and `set` ALWAYS refreshes
// position in both modes.

import { describe, expect, it } from 'vitest'
import { SizedMap } from '../index'

describe('SizedMap — web arm of the native parity contract', () => {
  it('FIFO (default): a read does not rescue an entry from eviction', () => {
    const m = new SizedMap<string, number>({ maxEntries: 2 })
    m.set('a', 1)
    m.set('b', 2)
    expect(m.get('a')).toBe(1)
    m.set('c', 3) // "a" was just READ, but FIFO ignores reads
    expect(m.has('a')).toBe(false)
    expect(m.has('b')).toBe(true)
    expect(m.has('c')).toBe(true)
    expect(m.size).toBe(2)
  })

  it('LRU-on-read: the same sequence keeps "a" instead', () => {
    const m = new SizedMap<string, number>({ maxEntries: 2, lru: true })
    m.set('a', 1)
    m.set('b', 2)
    m.get('a')
    m.set('c', 3)
    expect(m.has('a')).toBe(true)
    expect(m.has('b')).toBe(false)
  })

  it('set() ALWAYS refreshes position, in BOTH modes', () => {
    const m = new SizedMap<string, number>({ maxEntries: 2 })
    m.set('a', 1)
    m.set('b', 2)
    m.set('a', 10)
    m.set('c', 3)
    expect(m.has('a')).toBe(true)
    expect(m.get('a')).toBe(10)
    expect(m.has('b')).toBe(false)
  })

  it('keys() is eviction order, oldest first', () => {
    const m = new SizedMap<string, number>({ maxEntries: 3 })
    m.set('x', 1)
    m.set('y', 2)
    m.set('z', 3)
    expect([...m.keys()]).toEqual(['x', 'y', 'z'])
    expect([...m.values()]).toEqual([1, 2, 3])
  })

  it('delete reports hit/miss and removes from the ORDER too', () => {
    const m = new SizedMap<string, number>({ maxEntries: 3 })
    m.set('x', 1)
    m.set('y', 2)
    m.set('z', 3)
    expect(m.delete('y')).toBe(true)
    expect(m.delete('nope')).toBe(false)
    expect([...m.keys()]).toEqual(['x', 'z'])
    m.clear()
    expect(m.size).toBe(0)
    expect([...m.keys()]).toEqual([])
  })

  it('floors a cap below 1 rather than evicting the entry it just wrote', () => {
    const m = new SizedMap<string, number>({ maxEntries: 0 })
    m.set('only', 1)
    expect(m.get('only')).toBe(1)
  })
})
