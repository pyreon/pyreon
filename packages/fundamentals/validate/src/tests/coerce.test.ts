// Phase 5 coercion: s.coerce.{string,number,boolean,date,bigint} — coerces
// the input before validation, then runs the primitive's normal checks.
import { describe, expect, it } from 'vitest'
import { s, type Infer } from '../v1'

describe('coerce.number', () => {
  it('coerces numeric strings', () => {
    const r = s.coerce.number().parse('42')
    expect(r.ok && r.value).toBe(42)
  })
  it('still applies number checks to the coerced value', () => {
    expect(s.coerce.number().int().min(0).parse('5').ok).toBe(true)
    expect(s.coerce.number().int().parse('5.5').ok).toBe(false)
    expect(s.coerce.number().min(10).parse('3').ok).toBe(false)
  })
  it('coerced NaN is caught by .finite()', () => {
    expect(s.coerce.number().finite().parse('abc').ok).toBe(false)
  })
  it('infers number', () => {
    const _n: number = {} as Infer<ReturnType<typeof s.coerce.number>>
    expect(_n).toBeDefined()
  })
})

describe('coerce.string', () => {
  it('stringifies the input', () => {
    expect((s.coerce.string().parse(42) as { value: string }).value).toBe('42')
    expect((s.coerce.string().parse(true) as { value: string }).value).toBe('true')
  })
})

describe('coerce.boolean', () => {
  it('uses JS truthiness', () => {
    expect((s.coerce.boolean().parse(1) as { value: boolean }).value).toBe(true)
    expect((s.coerce.boolean().parse(0) as { value: boolean }).value).toBe(false)
    expect((s.coerce.boolean().parse('') as { value: boolean }).value).toBe(false)
  })
})

describe('coerce.date', () => {
  it('parses date strings / numbers', () => {
    expect(s.coerce.date().parse('2020-01-01').ok).toBe(true)
    expect(s.coerce.date().parse(1577836800000).ok).toBe(true)
  })
  it('rejects un-parseable input (Invalid Date)', () => {
    expect(s.coerce.date().parse('not-a-date').ok).toBe(false)
  })
  it('honors date checks', () => {
    expect(s.coerce.date().min(new Date('2020-01-01')).parse('2019-01-01').ok).toBe(false)
  })
})

describe('coerce.bigint', () => {
  it('coerces numeric strings / numbers', () => {
    expect((s.coerce.bigint().parse('5') as { value: bigint }).value).toBe(5n)
    expect((s.coerce.bigint().parse(7) as { value: bigint }).value).toBe(7n)
  })
  it('rejects un-coercible input', () => {
    expect(s.coerce.bigint().parse('x').ok).toBe(false)
    expect(s.coerce.bigint().parse(1.5).ok).toBe(false)
  })
  it('honors bigint checks', () => {
    expect(s.coerce.bigint().positive().parse('-3').ok).toBe(false)
  })
})
