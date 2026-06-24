// Zod-parity composition gaps: record key-schema, tuple .rest(), set/map size checks.
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('record — key schema', () => {
  it('validates keys against the key schema', () => {
    const schema = s.record(s.string().regex(/^[a-z]+$/), s.number())
    const ok = schema.parse({ alpha: 1, beta: 2 })
    expect(ok.ok).toBe(true)
    expect(ok.ok && ok.value).toEqual({ alpha: 1, beta: 2 })
  })

  it('rejects a key that fails the key schema', () => {
    const schema = s.record(s.string().regex(/^[a-z]+$/), s.number())
    const bad = schema.parse({ Alpha: 1 })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues[0]?.path).toEqual(['Alpha'])
  })

  it('still validates values against the value schema', () => {
    const schema = s.record(s.string(), s.number())
    const bad = schema.parse({ a: 'not-a-number' })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues[0]?.path).toEqual(['a'])
  })

  it('single-arg form keeps Record<string, V> behavior', () => {
    const schema = s.record(s.number())
    const r = schema.parse({ x: 1, y: 2 })
    expect(r.ok && r.value).toEqual({ x: 1, y: 2 })
  })
})

describe('tuple — .rest()', () => {
  it('accepts a variadic tail validated against the rest schema', () => {
    const schema = s.tuple([s.string()]).rest(s.number())
    const r = schema.parse(['head', 1, 2, 3])
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toEqual(['head', 1, 2, 3])
  })

  it('allows length AT LEAST the fixed count with a rest schema', () => {
    const schema = s.tuple([s.string(), s.boolean()]).rest(s.number())
    const r = schema.parse(['head', true])
    expect(r.ok).toBe(true)
    const tooShort = schema.parse(['head'])
    expect(tooShort.ok).toBe(false)
  })

  it('rejects a tail element that fails the rest schema', () => {
    const schema = s.tuple([s.string()]).rest(s.number())
    const bad = schema.parse(['head', 1, 'nope'])
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues[0]?.path).toEqual([2])
  })

  it('without .rest() still rejects extra elements', () => {
    const schema = s.tuple([s.string()])
    const bad = schema.parse(['head', 'extra'])
    expect(bad.ok).toBe(false)
  })
})

describe('set — size checks', () => {
  it('.min rejects under-sized sets', () => {
    const schema = s.set(s.number()).min(2)
    expect(schema.parse(new Set([1, 2])).ok).toBe(true)
    expect(schema.parse(new Set([1])).ok).toBe(false)
  })

  it('.max rejects over-sized sets', () => {
    const schema = s.set(s.number()).max(2)
    expect(schema.parse(new Set([1, 2])).ok).toBe(true)
    expect(schema.parse(new Set([1, 2, 3])).ok).toBe(false)
  })

  it('.size requires exact membership count', () => {
    const schema = s.set(s.number()).size(2)
    expect(schema.parse(new Set([1, 2])).ok).toBe(true)
    expect(schema.parse(new Set([1])).ok).toBe(false)
    expect(schema.parse(new Set([1, 2, 3])).ok).toBe(false)
  })

  it('.nonEmpty rejects empty sets', () => {
    const schema = s.set(s.number()).nonEmpty()
    expect(schema.parse(new Set([1])).ok).toBe(true)
    expect(schema.parse(new Set()).ok).toBe(false)
  })
})

describe('map — size checks', () => {
  it('.min rejects under-sized maps', () => {
    const schema = s.map(s.string(), s.number()).min(2)
    expect(
      schema.parse(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ).ok,
    ).toBe(true)
    expect(schema.parse(new Map([['a', 1]])).ok).toBe(false)
  })

  it('.max rejects over-sized maps', () => {
    const schema = s.map(s.string(), s.number()).max(1)
    expect(schema.parse(new Map([['a', 1]])).ok).toBe(true)
    expect(
      schema.parse(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ).ok,
    ).toBe(false)
  })

  it('.size requires exact entry count', () => {
    const schema = s.map(s.string(), s.number()).size(1)
    expect(schema.parse(new Map([['a', 1]])).ok).toBe(true)
    expect(
      schema.parse(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ).ok,
    ).toBe(false)
  })
})
