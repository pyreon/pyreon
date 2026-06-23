// bigint comparison bounds: gt / gte / lt / lte (exclusive + inclusive) + step
// (multipleOf alias) + between — numeric parity with s.number().
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

const ok = (schema: { parse: (v: unknown) => { ok: boolean } }, v: bigint) => schema.parse(v).ok

describe('gt / lt — exclusive', () => {
  it('gt excludes the boundary', () => {
    expect(ok(s.bigint().gt(5n), 6n)).toBe(true)
    expect(ok(s.bigint().gt(5n), 5n)).toBe(false)
    expect(ok(s.bigint().gt(5n), 4n)).toBe(false)
  })
  it('lt excludes the boundary', () => {
    expect(ok(s.bigint().lt(5n), 4n)).toBe(true)
    expect(ok(s.bigint().lt(5n), 5n)).toBe(false)
  })
})

describe('gte / lte — inclusive (min/max aliases)', () => {
  it('gte includes the boundary', () => {
    expect(ok(s.bigint().gte(5n), 5n)).toBe(true)
    expect(ok(s.bigint().gte(5n), 4n)).toBe(false)
  })
  it('lte includes the boundary', () => {
    expect(ok(s.bigint().lte(5n), 5n)).toBe(true)
    expect(ok(s.bigint().lte(5n), 6n)).toBe(false)
  })
})

describe('exclusive vs inclusive', () => {
  it('gt(5n) rejects 5n where gte(5n) accepts it', () => {
    expect(ok(s.bigint().gt(5n), 5n)).toBe(false)
    expect(ok(s.bigint().gte(5n), 5n)).toBe(true)
  })
})

describe('step + between', () => {
  it('step accepts multiples', () => {
    expect(ok(s.bigint().step(5n), 10n)).toBe(true)
    expect(ok(s.bigint().step(5n), 7n)).toBe(false)
  })
  it('between is an inclusive range', () => {
    const sc = s.bigint().between(0n, 10n)
    expect(ok(sc, 0n)).toBe(true)
    expect(ok(sc, 10n)).toBe(true)
    expect(ok(sc, 11n)).toBe(false)
    expect(ok(sc, -1n)).toBe(false)
  })
})

describe('composition + bigint-scale values', () => {
  it('handles values beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = 9007199254740993n // MAX_SAFE_INTEGER + 2
    expect(ok(s.bigint().gt(9007199254740992n), huge)).toBe(true)
    expect(ok(s.bigint().lt(huge), huge)).toBe(false)
  })
  it('gt(0n).lt(100n) bounds an open interval', () => {
    const sc = s.bigint().gt(0n).lt(100n)
    expect(ok(sc, 50n)).toBe(true)
    expect(ok(sc, 0n)).toBe(false)
    expect(ok(sc, 100n)).toBe(false)
  })
  it('gt failure carries an actionable message', () => {
    const r = s.bigint().gt(5n).parse(3n)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toBe('Must be > 5')
  })
  it('field-level bound carries the path under an object', () => {
    const schema = s.object({ qty: s.bigint().gte(1n) })
    const r = schema.parse({ qty: 0n })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.path).toEqual(['qty'])
  })
})
