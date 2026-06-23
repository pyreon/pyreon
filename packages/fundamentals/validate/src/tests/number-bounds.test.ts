// Number comparison methods: gt / gte / lt / lte (exclusive + inclusive bounds)
// + step (multipleOf alias) + safe (safe-integer range). The exclusive gt/lt
// are NEW capability — min/max are inclusive-only.
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

const ok = (schema: { parse: (v: unknown) => { ok: boolean } }, v: number) => schema.parse(v).ok

describe('gt — strictly greater (exclusive)', () => {
  const schema = s.number().gt(5)
  it('accepts values > 5', () => expect(ok(schema, 6)).toBe(true))
  it('rejects the boundary itself (exclusive)', () => expect(ok(schema, 5)).toBe(false))
  it('rejects below', () => expect(ok(schema, 4)).toBe(false))
})

describe('lt — strictly less (exclusive)', () => {
  const schema = s.number().lt(5)
  it('accepts values < 5', () => expect(ok(schema, 4)).toBe(true))
  it('rejects the boundary itself (exclusive)', () => expect(ok(schema, 5)).toBe(false))
  it('rejects above', () => expect(ok(schema, 6)).toBe(false))
})

describe('gte / lte — inclusive (min/max aliases)', () => {
  it('gte accepts the boundary', () => {
    expect(ok(s.number().gte(5), 5)).toBe(true)
    expect(ok(s.number().gte(5), 4)).toBe(false)
  })
  it('lte accepts the boundary', () => {
    expect(ok(s.number().lte(5), 5)).toBe(true)
    expect(ok(s.number().lte(5), 6)).toBe(false)
  })
})

describe('exclusive vs inclusive — the new capability', () => {
  it('gt(5) rejects 5 where gte(5) accepts it', () => {
    expect(ok(s.number().gt(5), 5)).toBe(false)
    expect(ok(s.number().gte(5), 5)).toBe(true)
  })
})

describe('step — multipleOf alias', () => {
  const schema = s.number().step(5)
  it('accepts multiples', () => expect(ok(schema, 10)).toBe(true))
  it('rejects non-multiples', () => expect(ok(schema, 7)).toBe(false))
})

describe('safe — safe-integer RANGE (bounds, not integer-ness)', () => {
  const schema = s.number().safe()
  it('accepts MAX_SAFE_INTEGER', () => expect(ok(schema, Number.MAX_SAFE_INTEGER)).toBe(true))
  it('rejects above MAX_SAFE_INTEGER', () => expect(ok(schema, Number.MAX_SAFE_INTEGER + 1)).toBe(false))
  it('rejects below MIN_SAFE_INTEGER', () => expect(ok(schema, Number.MIN_SAFE_INTEGER - 1)).toBe(false))
  it('accepts a fractional value within range (bounds-only, matches Zod)', () => {
    expect(ok(schema, 1.5)).toBe(true)
  })
})

describe('composition + error message', () => {
  it('gt(0).lt(10) bounds an open interval', () => {
    const schema = s.number().gt(0).lt(10)
    expect(ok(schema, 5)).toBe(true)
    expect(ok(schema, 0)).toBe(false)
    expect(ok(schema, 10)).toBe(false)
  })

  it('gt failure carries an actionable message', () => {
    const r = s.number().gt(5).parse(3)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toBe('Must be greater than 5')
  })

  it('JIT-warm gt stays correct (inline check path)', () => {
    const schema = s.number().gt(5)
    for (let i = 6; i < 2110; i++) schema.parse(i)
    expect(ok(schema, 6)).toBe(true)
    expect(ok(schema, 5)).toBe(false)
  })

  it('field-level bound carries the path under an object', () => {
    const schema = s.object({ age: s.number().gte(0).lt(150) })
    const r = schema.parse({ age: 200 })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.path).toEqual(['age'])
  })
})
