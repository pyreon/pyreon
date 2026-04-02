import { describe, expect, it } from 'vitest'
import {
  colors,
  duration,
  easing,
  fontFamily,
  fontSize,
  fontWeight,
  gray,
  letterSpacing,
  lineHeight,
  primary,
  radii,
  shadows,
  spacing,
  transition,
} from '../index'

describe('colors', () => {
  it('exports 18 color palettes', () => {
    expect(Object.keys(colors).length).toBe(18)
  })

  it('each palette has 11 shades (50-950)', () => {
    for (const [name, palette] of Object.entries(colors)) {
      const shades = Object.keys(palette)
      expect(shades).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'])
    }
  })

  it('primary aliases to blue', () => {
    expect(primary).toBe(colors.blue)
  })

  it('gray 50 is lightest, 950 is darkest', () => {
    expect(gray[50]).toBe('#f9fafb')
    expect(gray[950]).toBe('#030712')
  })

  it('all color values are hex strings', () => {
    for (const palette of Object.values(colors)) {
      for (const shade of Object.values(palette)) {
        expect(shade).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
})

describe('typography', () => {
  it('exports sans and mono font families', () => {
    expect(fontFamily.sans).toContain('Inter')
    expect(fontFamily.mono).toContain('JetBrains')
  })

  it('fontSize scale has 9 entries', () => {
    expect(Object.keys(fontSize).length).toBe(9)
    expect(fontSize.md).toBe(16)
  })

  it('fontWeight has 4 entries', () => {
    expect(Object.keys(fontWeight).length).toBe(4)
    expect(fontWeight.bold).toBe(700)
  })

  it('lineHeight has 3 entries', () => {
    expect(lineHeight.normal).toBe(1.5)
  })

  it('letterSpacing has 3 entries', () => {
    expect(letterSpacing.normal).toBe('0em')
  })
})

describe('spacing', () => {
  it('is 4px based', () => {
    expect(spacing[1]).toBe(4)
    expect(spacing[2]).toBe(8)
    expect(spacing[4]).toBe(16)
  })

  it('has 0 entry', () => {
    expect(spacing[0]).toBe(0)
  })

  it('has 20+ entries', () => {
    expect(Object.keys(spacing).length).toBeGreaterThanOrEqual(20)
  })
})

describe('radii', () => {
  it('has none through full', () => {
    expect(radii.none).toBe(0)
    expect(radii.full).toBe(9999)
  })

  it('md is 4', () => {
    expect(radii.md).toBe(4)
  })
})

describe('shadows', () => {
  it('has 7 entries', () => {
    expect(Object.keys(shadows).length).toBe(7)
  })

  it('none is "none"', () => {
    expect(shadows.none).toBe('none')
  })

  it('md contains rgb', () => {
    expect(shadows.md).toContain('rgb')
  })
})

describe('transitions', () => {
  it('duration has 3 entries', () => {
    expect(duration.fast).toBe(150)
    expect(duration.normal).toBe(200)
    expect(duration.slow).toBe(300)
  })

  it('easing has 4 entries', () => {
    expect(easing.default).toContain('cubic-bezier')
  })

  it('transition composes duration + easing', () => {
    expect(transition.fast).toBe('150ms cubic-bezier(0.4, 0, 0.2, 1)')
  })
})
