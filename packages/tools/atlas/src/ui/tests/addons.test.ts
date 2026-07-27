/**
 * Unit tests for the canvas addons (viewport / backgrounds / pseudo-states /
 * outline).
 *
 * The addon surface is deliberately pure data + resolvers, so the parts that
 * would otherwise only be checkable by clicking — every preset having a
 * rocketstyle dimension key, the pseudo props matching what rocketstyle
 * actually reads — are pinned here. The e2e proves the wiring; these prove the
 * table.
 */
import { describe, expect, it } from 'vitest'
import {
  ADDON_TABS,
  BACKGROUND_VARIANT,
  BACKGROUNDS,
  backgroundCss,
  localeById,
  localeDir,
  LOCALES,
  OUTLINE_CSS,
  PSEUDO_STATES,
  pseudoProps,
  VIEWPORT_SIZE,
  VIEWPORTS,
  viewportById,
  viewportWidth,
} from '../addons'
import { THEMES, tokens } from '../theme'

const t = tokens(THEMES[0]!, true)

describe('viewport presets', () => {
  it('ships a fluid default plus the three breakpoint widths', () => {
    expect(VIEWPORTS.map((v) => v.id)).toEqual(['full', 'mobile', 'tablet', 'desktop'])
    expect(VIEWPORTS[0]!.width).toBeNull()
    expect(VIEWPORTS.slice(1).map((v) => v.width)).toEqual([375, 768, 1280])
  })

  it('resolves a width for every preset, with the fluid one as 100%', () => {
    expect(viewportWidth('full')).toBe('100%')
    expect(viewportWidth('mobile')).toBe('375px')
    expect(viewportWidth('desktop')).toBe('1280px')
  })

  it('falls back to the fluid preset for an unknown id', () => {
    expect(viewportById('nope' as never).id).toBe('full')
  })

  it('has a rocketstyle size key for EVERY preset', () => {
    // A missing key would silently render an unstyled canvas — the class the
    // dimension map exists to make impossible.
    for (const v of VIEWPORTS) {
      expect(VIEWPORT_SIZE[v.id], v.id).toBeTruthy()
    }
    expect(Object.keys(VIEWPORT_SIZE)).toHaveLength(VIEWPORTS.length)
  })
})

describe('background presets', () => {
  it('ships theme / light / dark / checker', () => {
    expect(BACKGROUNDS.map((b) => b.id)).toEqual(['theme', 'light', 'dark', 'checker'])
  })

  it('resolves `theme` against the ACTIVE tokens, not a hardcoded colour', () => {
    expect(backgroundCss('theme', t)).toBe(t.surface)
    const light = tokens(THEMES[0]!, false)
    expect(backgroundCss('theme', light)).toBe(light.surface)
    expect(backgroundCss('theme', light)).not.toBe(backgroundCss('theme', t))
  })

  it('forces fixed surfaces for light/dark regardless of the theme', () => {
    expect(backgroundCss('light', t)).toBe('#ffffff')
    expect(backgroundCss('dark', tokens(THEMES[0]!, false))).toBe('#0f0f14')
  })

  it('renders the checker as a gradient (no asset dependency)', () => {
    expect(backgroundCss('checker', t)).toContain('repeating-conic-gradient')
  })

  it('has a rocketstyle variant key for EVERY preset', () => {
    for (const b of BACKGROUNDS) expect(BACKGROUND_VARIANT[b.id], b.id).toBeTruthy()
    expect(Object.keys(BACKGROUND_VARIANT)).toHaveLength(BACKGROUNDS.length)
  })
})

describe('pseudo states', () => {
  it('ships the four states a component can be forced into', () => {
    expect(PSEUDO_STATES.map((p) => p.id)).toEqual(['hover', 'focus', 'active', 'disabled'])
  })

  it('emits the prop rocketstyle reads for each state', () => {
    // `hover`/`active`/`focus` are rocketstyle PSEUDO_KEYS; `disabled` is a
    // real prop the bases branch on. Either way the addon just sets a flag —
    // no stylesheet rewriting, which is what makes this cheap here.
    expect(pseudoProps('hover')).toEqual({ hover: true })
    expect(pseudoProps('focus')).toEqual({ focus: true })
    expect(pseudoProps('active')).toEqual({ active: true })
    expect(pseudoProps('disabled')).toEqual({ disabled: true })
  })

  it('forces exactly ONE state at a time', () => {
    for (const p of PSEUDO_STATES) {
      expect(Object.keys(pseudoProps(p.id))).toHaveLength(1)
    }
  })

  it('is {} when nothing is forced, so a catalog can spread unconditionally', () => {
    expect(pseudoProps(null)).toEqual({})
    // spreading the empty result must not inject any key
    expect({ ...pseudoProps(null) }).toEqual({})
  })
})

describe('outline', () => {
  it('scopes the outline to the preview subtree, not the whole document', () => {
    // A bare `* { outline }` would outline the workbench chrome too.
    expect(OUTLINE_CSS.startsWith('& *')).toBe(true)
    expect(OUTLINE_CSS).toContain('outline:')
  })
})

describe('addon tabs', () => {
  it('ships the four panel tabs in order', () => {
    expect(ADDON_TABS.map((a) => a.id)).toEqual(['controls', 'actions', 'a11y', 'canvas'])
  })

  it('gives every tab a title and a hint (the panel renders both)', () => {
    for (const a of ADDON_TABS) {
      expect(a.title, a.id).toBeTruthy()
      expect(a.hint, a.id).toBeTruthy()
    }
  })

  it('has unique ids (a duplicate would make two tabs active at once)', () => {
    expect(new Set(ADDON_TABS.map((a) => a.id)).size).toBe(ADDON_TABS.length)
  })
})

describe('locale presets', () => {
  it('ships an LTR default plus an RTL locale (direction is the real test)', () => {
    expect(LOCALES[0]!.id).toBe('en')
    expect(LOCALES.some((l) => l.dir === 'rtl')).toBe(true)
  })

  it('resolves direction per locale', () => {
    expect(localeDir('en')).toBe('ltr')
    expect(localeDir('ar')).toBe('rtl')
  })

  it('falls back to the default (never an undefined dir) for an unknown locale', () => {
    // a host may supply its own ids — `dir` must still be renderable
    expect(localeById('zz-ZZ').id).toBe('en')
    expect(localeDir('zz-ZZ')).toBe('ltr')
  })

  it('gives every locale a label and a valid direction', () => {
    for (const l of LOCALES) {
      expect(l.label, l.id).toBeTruthy()
      expect(['ltr', 'rtl']).toContain(l.dir)
    }
  })
})
