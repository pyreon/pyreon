import type { ThemeModeCallback } from '@pyreon/rocketstyle'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import { toneKeys, toneVariant } from '../bases/fragments'
import { fieldKeys, fieldStatus, fieldSurface, fieldVariant, neutralToneKeys, tones } from '../bases/tones'

/**
 * The tone keys a state sets and the variants that read them back (#4425).
 *
 * `state` and `variant` are separate rocketstyle dimensions; a variant cannot
 * see which state is active. The state spreads `toneKeys` / `neutralToneKeys`
 * (or `fieldKeys` / `fieldStatus` for a text field) into the theme, and the
 * variant, a transform, reads them through `toneVariant` / `fieldVariant`.
 * These assertions lock each half of that contract on plain objects; the
 * rendered result is locked by `variant-follows-state.test.ts` (emitted CSS)
 * and `variant-follows-state.browser.test.tsx` (real Chromium).
 */

type Mode = 'light' | 'dark'

/**
 * A `mode(light, dark)` that answers for one mode directly. Rocketstyle's
 * real helper returns a callback it resolves later; resolving eagerly here
 * leaves the theme a plain object, as a variant transform receives it.
 */
const modeFor = (mode: Mode): ThemeModeCallback =>
  ((light: unknown, dark: unknown) => (mode === 'light' ? light : dark)) as unknown as ThemeModeCallback

const MODES: readonly Mode[] = ['light', 'dark']
const sys = theme.color.system

describe('toneKeys', () => {
  for (const mode of MODES) {
    it(`error (${mode}): the error fill, contrast, tints and the mode's text shade`, () => {
      expect(toneKeys(theme, modeFor(mode), 'error')).toEqual({
        toneFill: sys.error.base,
        toneContrast: sys.error.contrast,
        toneText: mode === 'light' ? sys.error.text : sys.error.textDark,
        toneTint50: sys.error[50],
        toneTint100: sys.error[100],
        toneTint200: sys.error[200],
      })
    })
  }

  it('each tone yields its own fill, so two states never share a variant colour', () => {
    const m = modeFor('light')
    const fills = (['primary', 'success', 'info', 'error', 'warning'] as const).map((tone) => toneKeys(theme, m, tone).toneFill)
    expect(new Set(fills).size).toBe(fills.length)
  })
})

describe('neutralToneKeys', () => {
  for (const mode of MODES) {
    it(`(${mode}): the control border as the outline, the mode's primary text, the neutral tints`, () => {
      const m = modeFor(mode)
      expect(neutralToneKeys(theme, m)).toEqual({
        toneFill: tones(theme, m).border,
        toneContrast: tones(theme, m).text,
        toneText: tones(theme, m).text,
        toneTint50: sys.base[50],
        toneTint100: sys.base[100],
        toneTint200: sys.base[200],
      })
    })
  }

  it('the outline is the mode-aware border, not a fixed light-mode token', () => {
    expect(neutralToneKeys(theme, modeFor('light')).toneFill).toBe(sys.dark[500])
    expect(neutralToneKeys(theme, modeFor('dark')).toneFill).toBe(sys.light[400])
  })
})

describe('toneVariant', () => {
  const outline = toneVariant((tone) => ({ borderColor: tone.toneFill, color: tone.toneText, hover: { backgroundColor: tone.toneTint50 } }))

  it("reads the active state's tone back: danger outline is the error tone, not primary", () => {
    const resolved = { padding: '4px', ...toneKeys(theme, modeFor('light'), 'error') }
    expect(outline(resolved)).toEqual({
      borderColor: sys.error.base,
      color: sys.error.text,
      hover: { backgroundColor: sys.error[50] },
    })
    expect(outline(resolved).borderColor).not.toBe(sys.primary.base)
  })

  it('follows whichever tone the theme carries (a later state slice overrides the base tone)', () => {
    const m = modeFor('dark')
    const resolved = { ...toneKeys(theme, m, 'primary'), ...toneKeys(theme, m, 'success') }
    expect(outline(resolved).borderColor).toBe(sys.success.base)
    expect(outline(resolved).color).toBe(sys.success.textDark)
  })

  it('reads every key the state sets', () => {
    const all = toneVariant((tone) => tone)
    const keys = toneKeys(theme, modeFor('light'), 'warning')
    expect(all(keys)).toEqual(keys)
  })

  it("reads a key nobody set, or a non-string one, as '' (which unistyle drops)", () => {
    expect(outline({})).toEqual({ borderColor: '', color: '', hover: { backgroundColor: '' } })
    expect(outline({ toneFill: 3, toneText: null }).borderColor).toBe('')
  })
})

describe('fieldKeys', () => {
  for (const mode of MODES) {
    it(`(${mode}): the resting surface and border, primary focus, no status`, () => {
      const m = modeFor(mode)
      expect(fieldKeys(theme, m)).toEqual({
        fieldSurface: tones(theme, m).surface,
        fieldBorder: tones(theme, m).border,
        fieldFocus: sys.primary.base,
        fieldStatus: '',
      })
    })
  }
})

describe('fieldStatus', () => {
  for (const tone of ['error', 'success'] as const) {
    it(`${tone}: border, focus border and status all the ${tone} colour, with a ${tone} focus ring`, () => {
      expect(fieldStatus(theme, tone)).toEqual({
        fieldBorder: sys[tone].base,
        fieldFocus: sys[tone].base,
        fieldStatus: sys[tone].base,
        borderColor: sys[tone].base,
        focus: { boxShadow: `0 0 0 3px ${sys[tone][200]}`, borderColor: sys[tone].base },
      })
    })
  }
})

describe('fieldVariant', () => {
  const filled = fieldVariant((field) => ({
    borderColor: field.fieldStatus || 'transparent',
    focus: { backgroundColor: field.fieldSurface, borderColor: field.fieldFocus },
  }))
  const underline = fieldVariant((field) => ({
    borderColorBottom: field.fieldBorder,
    focus: { borderColorBottom: field.fieldFocus },
  }))

  it('an error field keeps its error border in `filled`, and focusing it does not turn it primary', () => {
    const resolved = { ...fieldKeys(theme, modeFor('light')), ...fieldStatus(theme, 'error') }
    expect(filled(resolved)).toEqual({
      borderColor: sys.error.base,
      focus: { backgroundColor: sys.light.base, borderColor: sys.error.base },
    })
    expect(filled(resolved).focus.borderColor).not.toBe(sys.primary.base)
  })

  it('an error field keeps its error border in `underline`, focused or not', () => {
    const resolved = { ...fieldKeys(theme, modeFor('dark')), ...fieldStatus(theme, 'error') }
    expect(underline(resolved)).toEqual({
      borderColorBottom: sys.error.base,
      focus: { borderColorBottom: sys.error.base },
    })
  })

  it('a field with no status: no border in `filled`, the resting border in `underline`, primary on focus', () => {
    const m = modeFor('dark')
    const resolved = fieldKeys(theme, m)
    expect(filled(resolved)).toEqual({
      borderColor: 'transparent',
      focus: { backgroundColor: tones(theme, m).surface, borderColor: sys.primary.base },
    })
    expect(underline(resolved)).toEqual({
      borderColorBottom: tones(theme, m).border,
      focus: { borderColorBottom: sys.primary.base },
    })
  })

  it("reads a key nobody set, or a non-string one, as ''", () => {
    expect(underline({ fieldFocus: 1 })).toEqual({ borderColorBottom: '', focus: { borderColorBottom: '' } })
  })
})

describe('fieldSurface', () => {
  for (const mode of MODES) {
    it(`(${mode}): the field's surface, text and resting border from the mode-aware tones`, () => {
      const m = modeFor(mode)
      const tone = tones(theme, m)
      expect(fieldSurface(theme, m)).toEqual({ backgroundColor: tone.surface, color: tone.text, borderColor: tone.border })
    })
  }
})
