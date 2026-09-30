import { describe, expect, it } from 'vitest'
import { groupThousands, plain } from './format'
import { formatTickStep, makeTicks } from './scale'

describe('plain — small / huge magnitudes', () => {
  it('keeps small values distinguishable instead of collapsing them to 0', () => {
    expect(plain(0.00012)).toBe('0.00012')
    expect(plain(0.0034)).toBe('0.0034')
    expect(plain(0.0005)).toBe('0.0005')
    expect(plain(0.3 + 0.0000000000000001)).toBe('0.3')
    expect(plain(1234.5678)).toBe('1234.568')
  })

  it('uses exponent notation outside 1e-4..1e15 and treats float noise as 0', () => {
    expect(plain(0.000015)).toBe('1.5e-5')
    expect(plain(-2.5e-9)).toBe('-2.5e-9')
    expect(plain(2e21)).toBe('2e21')
    expect(plain(0.1 + 0.2 - 0.3)).toBe('0')
    expect(plain(Number.POSITIVE_INFINITY)).toBe('Infinity')
    expect(plain(Number.NEGATIVE_INFINITY)).toBe('-Infinity')
    expect(plain(Number.NaN)).toBe('NaN')
    expect(plain(9.9996e-5)).toBe('1e-4')
  })

  it('groupThousands leaves exponent notation alone', () => {
    expect(groupThousands(1e21)).toBe('1e21')
    expect(groupThousands(1234567.5)).toBe('1,234,567.5')
    expect(groupThousands(Number.NaN)).toBe('NaN')
  })
})

describe('tick labels follow the step precision', () => {
  it('a sub-0.001 step labels each tick distinctly', () => {
    const labels = makeTicks({ min: 0, max: 0.001 }, 0, 100, 5).map((t) => t.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toContain('0.0002')
  })

  it('formatTickStep snaps float noise and keeps ordinary steps unchanged', () => {
    expect(formatTickStep(0.30000000000000004, 0.1)).toBe('0.3')
    expect(formatTickStep(0.00060000000000001, 0.0002)).toBe('0.0006')
    expect(formatTickStep(1e-20, 0.0002)).toBe('0')
    expect(formatTickStep(0.00002, 0.00001)).toBe('2e-5')
  })
})
