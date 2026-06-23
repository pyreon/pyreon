// Composition shorthands: .array() / .or() / .and() — Zod-parity sugar over
// s.array() / s.union() / s.intersection(), late-bound via the factory registry
// (importing `s` registers them).
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('.array()', () => {
  const schema = s.string().array()
  it('accepts an array of the element type', () => {
    const r = schema.parse(['a', 'b'])
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toEqual(['a', 'b'])
  })
  it('rejects a non-array', () => expect(s.string().array().parse('x').ok).toBe(false))
  it('rejects when an element is the wrong type (path carries the index)', () => {
    const r = s.string().array().parse(['ok', 1])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.path).toEqual([1])
  })
  it('is equivalent to s.array(s.string())', () => {
    const viaMethod = s.string().array().parse(['a'])
    const viaFn = s.array(s.string()).parse(['a'])
    expect(viaMethod).toEqual(viaFn)
  })
  it('composes with element checks + array checks', () => {
    const sc = s.string().min(2).array().min(1)
    expect(sc.parse(['ab', 'cd']).ok).toBe(true)
    expect(sc.parse(['x']).ok).toBe(false) // element too short
    expect(sc.parse([]).ok).toBe(false) // array too short
  })
  it('nests', () => {
    const grid = s.number().array().array()
    expect(grid.parse([[1, 2], [3]]).ok).toBe(true)
    expect(grid.parse([1, 2]).ok).toBe(false)
  })
})

describe('.or()', () => {
  const schema = s.string().or(s.number())
  it('accepts either member', () => {
    expect(schema.parse('a').ok).toBe(true)
    expect(schema.parse(5).ok).toBe(true)
  })
  it('rejects neither', () => expect(schema.parse(true).ok).toBe(false))
  it('preserves the parsed value', () => {
    const r = schema.parse(42)
    expect(r.ok && r.value).toBe(42)
  })
  it('is equivalent to s.union(a, b)', () => {
    const viaMethod = s.string().or(s.number()).parse(7)
    const viaFn = s.union(s.string(), s.number()).parse(7)
    expect(viaMethod).toEqual(viaFn)
  })
})

describe('.and()', () => {
  const schema = s.object({ a: s.string() }).and(s.object({ b: s.number() }))
  it('requires both shapes', () => {
    const r = schema.parse({ a: 'x', b: 1 })
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toEqual({ a: 'x', b: 1 })
  })
  it('rejects when a half is missing', () => {
    expect(schema.parse({ a: 'x' }).ok).toBe(false)
    expect(schema.parse({ b: 1 }).ok).toBe(false)
  })
  it('is equivalent to s.intersection(a, b)', () => {
    const a = s.object({ a: s.string() })
    const b = s.object({ b: s.number() })
    const viaMethod = a.and(b).parse({ a: 'x', b: 1 })
    const viaFn = s.intersection(a, b).parse({ a: 'x', b: 1 })
    expect(viaMethod).toEqual(viaFn)
  })
})

describe('type-level output', () => {
  it('infers element / union / intersection types', () => {
    const arr = s.number().array().parse([1, 2])
    if (arr.ok) {
      const v: number[] = arr.value
      expect(v).toEqual([1, 2])
    }
    const u = s.string().or(s.number()).parse('hi')
    if (u.ok) {
      const v: string | number = u.value
      expect(v).toBe('hi')
    }
    const i = s.object({ a: s.string() }).and(s.object({ b: s.number() })).parse({ a: 'x', b: 1 })
    if (i.ok) {
      const v: { a: string } & { b: number } = i.value
      expect(v.a).toBe('x')
    }
  })
})
