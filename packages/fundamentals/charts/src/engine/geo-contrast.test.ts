// A map must stay readable at both ends of its value range on either ground: the default ramps keep their contrast
// against the page, rise with the value, and a region with no value is distinguishable from the lowest one.
import { describe, expect, it } from 'vitest'
import { GEO_RAMP_DARK, GEO_RAMP_LIGHT } from './geo'
import { chartThemes } from './theme'

const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number): number => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)

  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [Math.max(lum(a), lum(b)), Math.min(lum(a), lum(b))]

  return (hi + 0.05) / (lo + 0.05)
}

describe('default map ramps against their ground', () => {
  const grounds = { light: '#ffffff', dark: chartThemes.dark.background === '' ? '#ffffff' : chartThemes.dark.background }
  it('dark: every stop is at least 3:1 against the dark page, and contrast rises with the value', () => {
    const c = GEO_RAMP_DARK.map((s) => contrast(s, grounds.dark))
    for (const v of c) expect(v).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!)
  })
  it('light: the lightest stop is at least 1.4:1 against white, the rest at least 2.4:1, and contrast rises with the value', () => {
    const c = GEO_RAMP_LIGHT.map((s) => contrast(s, grounds.light))
    expect(c[0]!).toBeGreaterThanOrEqual(1.4)
    for (const v of c.slice(1)) expect(v).toBeGreaterThanOrEqual(2.4)
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!)
  })
  it('the theme ramp the map used to take FAILED on dark (its lowest stop was the page), which is why the map has its own', () => {
    expect(contrast(chartThemes.dark.ramp[0]!, grounds.dark)).toBeLessThan(1.3)
  })
  it('the lowest region fill is not the no-data fill on either theme (the hatch separates them as well)', () => {
    expect(GEO_RAMP_DARK[0]).not.toBe(chartThemes.dark.muted)
    expect(GEO_RAMP_LIGHT[0]).not.toBe(chartThemes.light.muted)
    expect(contrast(GEO_RAMP_DARK[0]!, chartThemes.dark.muted)).toBeGreaterThan(1.5)
  })
})
