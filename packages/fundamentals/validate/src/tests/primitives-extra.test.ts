// Phase 2 primitives: date / bigint / null / undefined / void / nan /
// symbol / any / unknown — behavior + strict-type inference.
import { describe, expect, it } from 'vitest'
import { s, type Infer } from '../v1'

describe('date', () => {
  it('accepts a valid Date, rejects Invalid Date / non-Date', () => {
    expect(s.date().parse(new Date('2020-01-01')).ok).toBe(true)
    expect(s.date().parse(new Date('not-a-date')).ok).toBe(false)
    expect(s.date().parse('2020-01-01').ok).toBe(false)
    expect(s.date().parse(1234567890).ok).toBe(false)
  })
  it('min/max bound the instant (inclusive)', () => {
    const sch = s.date().min(new Date('2020-01-01')).max(new Date('2020-12-31'))
    expect(sch.parse(new Date('2020-06-01')).ok).toBe(true)
    expect(sch.parse(new Date('2019-12-31')).ok).toBe(false)
    expect(sch.parse(new Date('2021-01-01')).ok).toBe(false)
  })
  it('infers Date', () => {
    const _d: Date = {} as Infer<ReturnType<typeof s.date>>
    expect(_d).toBeDefined
  })
})

describe('bigint', () => {
  it('accepts bigint, rejects number/string', () => {
    expect(s.bigint().parse(5n).ok).toBe(true)
    expect(s.bigint().parse(5).ok).toBe(false)
    expect(s.bigint().parse('5').ok).toBe(false)
  })
  it('min/max/positive/negative/multipleOf', () => {
    expect(s.bigint().min(0n).parse(-1n).ok).toBe(false)
    expect(s.bigint().max(10n).parse(11n).ok).toBe(false)
    expect(s.bigint().positive().parse(0n).ok).toBe(false)
    expect(s.bigint().positive().parse(3n).ok).toBe(true)
    expect(s.bigint().negative().parse(-3n).ok).toBe(true)
    expect(s.bigint().multipleOf(3n).parse(9n).ok).toBe(true)
    expect(s.bigint().multipleOf(3n).parse(7n).ok).toBe(false)
  })
  it('infers bigint', () => {
    const _b: bigint = {} as Infer<ReturnType<typeof s.bigint>>
    expect(_b).toBeDefined
  })
})

describe('null / undefined / void', () => {
  it('null accepts only null', () => {
    expect(s.null().parse(null).ok).toBe(true)
    expect(s.null().parse(undefined).ok).toBe(false)
    expect(s.null().parse(0).ok).toBe(false)
  })
  it('undefined accepts only undefined', () => {
    expect(s.undefined().parse(undefined).ok).toBe(true)
    expect(s.undefined().parse(null).ok).toBe(false)
  })
  it('void accepts undefined', () => {
    expect(s.void().parse(undefined).ok).toBe(true)
    expect(s.void().parse(null).ok).toBe(false)
  })
  it('infers null / undefined', () => {
    const _n: null = {} as Infer<ReturnType<typeof s.null>>
    const _u: undefined = {} as Infer<ReturnType<typeof s.undefined>>
    expect([_n, _u]).toBeDefined
  })
})

describe('nan', () => {
  it('accepts NaN, rejects real numbers + non-numbers', () => {
    expect(s.nan().parse(NaN).ok).toBe(true)
    expect(s.nan().parse(Number('x')).ok).toBe(true)
    expect(s.nan().parse(5).ok).toBe(false)
    expect(s.nan().parse('NaN').ok).toBe(false)
  })
})

describe('symbol', () => {
  it('accepts symbols only', () => {
    expect(s.symbol().parse(Symbol('x')).ok).toBe(true)
    expect(s.symbol().parse('x').ok).toBe(false)
  })
})

describe('any / unknown', () => {
  it('accept any input', () => {
    for (const v of [1, 'x', null, undefined, {}, [], Symbol()]) {
      expect(s.any().parse(v).ok).toBe(true)
      expect(s.unknown().parse(v).ok).toBe(true)
    }
  })
  it('any infers any, unknown infers unknown', () => {
    const _a = {} as Infer<ReturnType<typeof s.any>>
    const _u: unknown = {} as Infer<ReturnType<typeof s.unknown>>
    expect([_a, _u]).toBeDefined
  })
})
