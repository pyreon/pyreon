import { describe, expect, it } from 'vitest'
import { brandTheme } from '../brand'
import theme, { type Theme } from '../theme'
import { contrast } from './contrast'

/**
 * Every colour pair the theme defines for text passes WCAG AA (4.5:1), in both
 * themes and both modes. The page the mode implies is `light.base` in light
 * mode and `dark.base` in dark mode; tints and opacity steps are composited
 * over it before measuring, as the browser paints them.
 */

const AA = 4.5
const TONES = ['primary', 'success', 'info', 'error', 'warning'] as const
const MODES = ['light', 'dark'] as const
const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

interface Pair {
  name: string
  text: string
  surface: string
  page: string
}

const pairsOf = (t: Theme, mode: (typeof MODES)[number]): Pair[] => {
  const c = t.color.system
  const page = mode === 'light' ? c.light.base : c.dark.base
  const pairs: Pair[] = []
  for (const tone of TONES) {
    const role = c[tone]
    // Text ON the fill (Button, ActionIcon, Pagination, Tabs pills, Stepper…).
    pairs.push({ name: `${tone}.contrast on ${tone}.base`, text: role.contrast, surface: role.base, page })
    pairs.push({ name: `${tone}.contrast on ${tone}.hover`, text: role.contrast, surface: role.hover, page })
    // Text IN the tone, on the page and on the tone's tints (Badge, Alert, NavLink, outline/subtle/ghost/link).
    const text = mode === 'light' ? role.text : role.textDark
    const textKey = mode === 'light' ? 'text' : 'textDark'
    pairs.push({ name: `${tone}.${textKey} on the page`, text, surface: page, page })
    for (const step of [50, 100, 200] as const) {
      pairs.push({ name: `${tone}.${textKey} on ${tone}[${step}]`, text, surface: role[step], page })
    }
  }
  // Tooltip: text on the dark fill.
  pairs.push({ name: 'dark.contrast on dark[800]', text: c.dark.contrast, surface: c.dark[800], page })
  // Body text on the page.
  pairs.push({
    name: 'body text on the page',
    text: mode === 'light' ? c.dark.base : c.light.base,
    surface: page,
    page,
  })
  return pairs
}

describe('theme colour contrast (WCAG AA, 4.5:1)', () => {
  for (const [label, t] of THEMES) {
    for (const mode of MODES) {
      describe(`${label}, ${mode} mode`, () => {
        for (const pair of pairsOf(t, mode)) {
          it(pair.name, () => {
            const ratio = contrast(pair.text, pair.surface, pair.page)
            expect(ratio, `${pair.text} on ${pair.surface} (page ${pair.page}) is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
          })
        }
      })
    }
  }
})

describe('contrast()', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    // The design's figures: ink on ember and white on ember.
    expect(contrast('#0A0A0E', '#FF5E1A', '#ffffff')).toBeCloseTo(6.46, 2)
    expect(contrast('#ffffff', '#FF5E1A', '#ffffff')).toBeCloseTo(3.06, 2)
  })

  it('composites a translucent surface over the page before measuring', () => {
    // White text on blue-500 at 80% is lighter on a white page and darker on a dark one.
    const onLight = contrast('#ffffff', 'rgba(59, 130, 246, 0.8)', '#ffffff')
    const onDark = contrast('#ffffff', 'rgba(59, 130, 246, 0.8)', 'rgba(15, 23, 42, 1)')
    expect(onLight).toBeLessThan(3)
    expect(onDark).toBeGreaterThan(5)
  })
})

describe('the fill roles', () => {
  it('are present for every tone in both themes', () => {
    for (const [, t] of THEMES) {
      for (const tone of TONES) {
        const role = t.color.system[tone]
        for (const key of ['base', 'contrast', 'hover', 'text', 'textDark'] as const) {
          expect(role[key], `${tone}.${key}`).toMatch(/^(#|rgba?\()/)
        }
      }
    }
  })

  it('the brand theme has ink text on ember, as the design specifies', () => {
    expect(brandTheme.color.system.primary.base).toBe('rgba(255, 94, 26, 1)')
    expect(brandTheme.color.system.primary.contrast).toBe('#0A0A0E')
    expect(brandTheme.color.system.primary.textDark).toBe('#FF8A4C')
  })

  it('the brand theme leaves the default theme untouched', () => {
    expect(theme.color.system.primary.base).toBe('rgba(59, 130, 246, 1)')
    expect(theme.fontFamily.base.startsWith('Inter')).toBe(true)
    expect(theme.borderRadius.base).toBe(4)
    expect(brandTheme.borderRadius.pill).toBe(theme.borderRadius.pill)
    expect(brandTheme.spacing).toBe(theme.spacing)
  })
})
