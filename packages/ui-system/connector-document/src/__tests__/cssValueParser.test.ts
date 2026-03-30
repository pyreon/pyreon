import { describe, expect, it } from 'vitest'
import {
  parseBoxModel,
  parseCssDimension,
  parseFontWeight,
  parseLineHeight,
} from '../cssValueParser'

describe('parseCssDimension', () => {
  it('passes through numbers', () => {
    expect(parseCssDimension(14)).toBe(14)
    expect(parseCssDimension(0)).toBe(0)
    expect(parseCssDimension(-5)).toBe(-5)
    expect(parseCssDimension(1.5)).toBe(1.5)
  })

  it('parses px values', () => {
    expect(parseCssDimension('14px')).toBe(14)
    expect(parseCssDimension('0px')).toBe(0)
    expect(parseCssDimension('-5px')).toBe(-5)
    expect(parseCssDimension('1.5px')).toBe(1.5)
  })

  it('parses rem values', () => {
    expect(parseCssDimension('1rem')).toBe(16)
    expect(parseCssDimension('1.5rem')).toBe(24)
    expect(parseCssDimension('0.5rem')).toBe(8)
    expect(parseCssDimension('2rem', 20)).toBe(40)
  })

  it('parses em values', () => {
    expect(parseCssDimension('1em')).toBe(16)
    expect(parseCssDimension('2em')).toBe(32)
  })

  it('parses pt values', () => {
    expect(parseCssDimension('12pt')).toBeCloseTo(16)
    expect(parseCssDimension('9pt')).toBeCloseTo(12)
  })

  it('parses bare number strings', () => {
    expect(parseCssDimension('14')).toBe(14)
    expect(parseCssDimension('0')).toBe(0)
    expect(parseCssDimension('-5')).toBe(-5)
  })

  it('returns undefined for unresolvable values', () => {
    expect(parseCssDimension('auto')).toBeUndefined()
    expect(parseCssDimension('100%')).toBeUndefined()
    expect(parseCssDimension('calc(100% - 20px)')).toBeUndefined()
    expect(parseCssDimension('var(--spacing)')).toBeUndefined()
  })

  it('trims whitespace', () => {
    expect(parseCssDimension(' 14px ')).toBe(14)
    expect(parseCssDimension('  1rem  ')).toBe(16)
  })
})

describe('parseBoxModel', () => {
  it('returns undefined for null/undefined', () => {
    expect(parseBoxModel(undefined)).toBeUndefined()
    expect(parseBoxModel(null as any)).toBeUndefined()
  })

  it('passes through numbers', () => {
    expect(parseBoxModel(8)).toBe(8)
    expect(parseBoxModel(0)).toBe(0)
  })

  it('parses single value', () => {
    expect(parseBoxModel('8px')).toBe(8)
    expect(parseBoxModel('1rem')).toBe(16)
  })

  it('parses two values (vertical horizontal)', () => {
    expect(parseBoxModel('8px 16px')).toEqual([8, 16])
  })

  it('parses three values (top horizontal bottom)', () => {
    expect(parseBoxModel('8px 16px 12px')).toEqual([8, 16, 12, 16])
  })

  it('parses four values', () => {
    expect(parseBoxModel('8px 16px 12px 4px')).toEqual([8, 16, 12, 4])
  })

  it('returns undefined when any part is unresolvable', () => {
    expect(parseBoxModel('8px auto')).toBeUndefined()
    expect(parseBoxModel('8px 16px auto 4px')).toBeUndefined()
  })
})

describe('parseFontWeight', () => {
  it('passes through numbers', () => {
    expect(parseFontWeight(400)).toBe(400)
    expect(parseFontWeight(700)).toBe(700)
  })

  it('handles string keywords', () => {
    expect(parseFontWeight('normal')).toBe('normal')
    expect(parseFontWeight('bold')).toBe('bold')
  })

  it('parses numeric strings', () => {
    expect(parseFontWeight('400')).toBe(400)
    expect(parseFontWeight('700')).toBe(700)
  })

  it('returns undefined for null/undefined', () => {
    expect(parseFontWeight(undefined)).toBeUndefined()
  })

  it('returns undefined for unrecognized values', () => {
    expect(parseFontWeight('lighter')).toBeUndefined()
  })
})

describe('parseLineHeight', () => {
  it('passes through numbers (unitless)', () => {
    expect(parseLineHeight(1.5)).toBe(1.5)
    expect(parseLineHeight(2)).toBe(2)
  })

  it('parses px values', () => {
    expect(parseLineHeight('24px')).toBe(24)
  })

  it("returns undefined for 'normal'", () => {
    expect(parseLineHeight('normal')).toBeUndefined()
  })

  it('returns undefined for null/undefined', () => {
    expect(parseLineHeight(undefined)).toBeUndefined()
  })
})
