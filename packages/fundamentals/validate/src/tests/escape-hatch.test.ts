// Escape-hatch primitives (Zod parity): s.never() / s.custom() / s.instanceof().
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('s.never()', () => {
  const schema = s.never()
  it('rejects every value', () => {
    expect(schema.parse(1).ok).toBe(false)
    expect(schema.parse('x').ok).toBe(false)
    expect(schema.parse(null).ok).toBe(false)
    expect(schema.parse(undefined).ok).toBe(false)
    expect(schema.parse({}).ok).toBe(false)
  })
  it('carries the forbidden issue', () => {
    const r = schema.parse(1)
    expect(!r.ok && r.issues[0]?.message).toBe('No value is allowed here')
  })
  it('as a plain field the key is required-and-unsatisfiable (Zod parity)', () => {
    // A bare never field rejects even when absent — `never` accepts no value,
    // including `undefined`.
    const schema2 = s.object({ a: s.string(), legacy: s.never() })
    expect(schema2.parse({ a: 'ok' }).ok).toBe(false)
  })
  it('forbids a key only when present via .never().optional()', () => {
    const schema2 = s.object({ a: s.string() }).extend({ legacy: s.never().optional() })
    expect(schema2.parse({ a: 'ok', legacy: 1 }).ok).toBe(false)
    expect(schema2.parse({ a: 'ok' }).ok).toBe(true)
  })
})

describe('s.custom()', () => {
  it('with no predicate accepts everything', () => {
    const schema = s.custom<`${number}px`>()
    const r = schema.parse('12px')
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe('12px')
  })
  it('with a predicate rejects when it returns false', () => {
    const schema = s.custom<string>((v) => typeof v === 'string' && v.startsWith('px-'))
    expect(schema.parse('px-1').ok).toBe(true)
    expect(schema.parse('nope').ok).toBe(false)
  })
  it('uses the default message', () => {
    const r = s.custom((v) => v === 42).parse(1)
    expect(!r.ok && r.issues[0]?.message).toBe('Invalid value')
  })
  it('honors a custom message', () => {
    const r = s.custom((v) => v === 42, 'must be 42').parse(1)
    expect(!r.ok && r.issues[0]?.message).toBe('must be 42')
  })
  it('emits a custom-coded issue', () => {
    const r = s.custom(() => false).parse(1)
    expect(!r.ok && r.issues[0]?.code).toBe('custom')
  })
})

describe('s.instanceof()', () => {
  it('accepts an instance of the class', () => {
    const schema = s.instanceof(Date)
    const now = new Date()
    const r = schema.parse(now)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe(now)
  })
  it('rejects a non-instance', () => {
    const schema = s.instanceof(Date)
    expect(schema.parse('2020-01-01').ok).toBe(false)
    expect(schema.parse({}).ok).toBe(false)
  })
  it('names the class in the default message', () => {
    const r = s.instanceof(Date).parse('x')
    expect(!r.ok && r.issues[0]?.message).toBe('Expected an instance of Date')
  })
  it('honors a custom message', () => {
    const r = s.instanceof(Date, 'need a Date').parse('x')
    expect(!r.ok && r.issues[0]?.message).toBe('need a Date')
  })
  it('works with a user class', () => {
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
    }
    const schema = s.instanceof(Point)
    const p = new Point(1, 2)
    const r = schema.parse(p)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const back: Point = r.value
      expect(back.x).toBe(1)
    }
    expect(schema.parse({ x: 1, y: 2 }).ok).toBe(false)
  })
  it('composes as an object field carrying the path', () => {
    const schema = s.object({ at: s.instanceof(Date) })
    const r = schema.parse({ at: 'nope' })
    expect(!r.ok && r.issues[0]?.path).toEqual(['at'])
  })
})
