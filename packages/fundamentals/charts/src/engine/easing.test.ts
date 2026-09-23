import { describe, expect, it } from 'vitest'
import { EASING_NAMES, ease, isEasingName } from './easing'

describe('ECharts easing table', () => {
  it('covers the 31 zrender curves ECharts accepts', () => {
    expect(EASING_NAMES.length).toBe(31)
    expect(new Set(EASING_NAMES).size).toBe(31)
  })
  it('every curve starts at 0 and ends at 1', () => {
    for (const n of EASING_NAMES) {
      expect(ease(n, 0), n).toBeCloseTo(0, 9)
      expect(ease(n, 1), n).toBeCloseTo(1, 9)
    }
  })
  it('clamps t outside 0..1', () => {
    expect(ease('cubicOut', -2)).toBe(0)
    expect(ease('cubicOut', 3)).toBe(1)
  })
  it('matches known zrender values at the midpoint', () => {
    expect(ease('linear', 0.5)).toBe(0.5)
    expect(ease('quadraticIn', 0.5)).toBe(0.25)
    expect(ease('quadraticOut', 0.5)).toBe(0.75)
    expect(ease('cubicIn', 0.5)).toBe(0.125)
    expect(ease('cubicOut', 0.5)).toBe(0.875)
    expect(ease('cubicInOut', 0.5)).toBe(0.5)
    expect(ease('sinusoidalInOut', 0.5)).toBeCloseTo(0.5, 9)
    expect(ease('bounceOut', 1 / 2.75)).toBeCloseTo(1, 9)
  })
  it('ease-in curves are slow at the start, ease-out curves fast', () => {
    for (const family of ['quadratic', 'cubic', 'quartic', 'quintic', 'sinusoidal', 'exponential', 'circular']) {
      expect(ease(`${family}In`, 0.25), family).toBeLessThan(0.25)
      expect(ease(`${family}Out`, 0.25), family).toBeGreaterThan(0.25)
    }
  })
  it('back and elastic curves overshoot, as ECharts shows them', () => {
    expect(Math.min(...[0.1, 0.2, 0.3].map((t) => ease('backIn', t)))).toBeLessThan(0)
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((t) => ease('backOut', t)))).toBeGreaterThan(1)
    expect(Math.max(...Array.from({ length: 20 }, (_, i) => ease('elasticOut', i / 20)))).toBeGreaterThan(1)
  })
  it('every curve is finite across the timeline, and each InOut is symmetric about the middle', () => {
    for (const n of EASING_NAMES) {
      for (let i = 0; i <= 20; i++) expect(Number.isFinite(ease(n, i / 20)), `${n} at ${i / 20}`).toBe(true)
    }
    for (const n of EASING_NAMES.filter((x) => x.endsWith('InOut'))) {
      for (const t of [0.1, 0.3, 0.45]) expect(ease(n, t) + ease(n, 1 - t), `${n} at ${t}`).toBeCloseTo(1, 6)
    }
  })
  it('an unknown name is linear, and is reported as unknown', () => {
    expect(ease('nope', 0.3)).toBe(0.3)
    expect(isEasingName('nope')).toBe(false)
    expect(isEasingName('elasticInOut')).toBe(true)
  })
})
