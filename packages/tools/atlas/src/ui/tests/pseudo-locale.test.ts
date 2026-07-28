/**
 * Pseudo-localization — the transform that finds truncation without a translator.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPANSION,
  isPseudoLocalized,
  pseudoLocalize,
  pseudoLocalizeValues,
} from '../pseudo-locale'

describe('the transform', () => {
  it('accents Latin letters so an untransformed string stands out', () => {
    // The point is not decoration: anything left un-accented never went through
    // i18n, and it is visible precisely because its neighbours changed.
    const out = pseudoLocalize('Save', { brackets: false, expansion: 0 })
    expect(out).not.toContain('Save')
    expect(out).toMatch(/[áéíóúŚ]/)
  })

  it('expands length so a layout that clips in German clips here', () => {
    const input = 'Get started'
    const out = pseudoLocalize(input)
    // 40% is the long tail of German/Finnish growth, not the average — the
    // average would let real overflows through.
    expect(DEFAULT_EXPANSION).toBe(0.4)
    expect(out.length).toBeGreaterThan(input.length * 1.4)
  })

  it('brackets the string so its boundaries are unambiguous', () => {
    expect(pseudoLocalize('Hi')).toMatch(/^\[.*\]$/)
    expect(pseudoLocalize('Hi', { brackets: false })).not.toMatch(/^\[/)
  })

  it('leaves interpolation placeholders intact', () => {
    // Accenting the inside of a placeholder breaks substitution and turns a
    // layout check into a crash — the fastest way to get a tool switched off.
    for (const token of ['{{name}}', '{count}', '%s']) {
      const out = pseudoLocalize(`Hello ${token} today`)
      expect(out, token).toContain(token)
    }
  })

  it('handles an empty string without inventing padding', () => {
    expect(pseudoLocalize('')).toBe('')
  })

  it('passes non-Latin characters through rather than mangling them', () => {
    const out = pseudoLocalize('日本語', { brackets: false, expansion: 0 })
    expect(out).toBe('日本語')
  })
})

describe('applying to control values', () => {
  it('transforms strings and leaves other types alone', () => {
    // A boolean control is not a translatable string; coercing one would change
    // the component's BEHAVIOUR rather than its text.
    const out = pseudoLocalizeValues({ label: 'Save', disabled: true, count: 3 })
    expect(out.disabled).toBe(true)
    expect(out.count).toBe(3)
    expect(String(out.label)).not.toBe('Save')
  })

  it('is detectable, so a second pass cannot compound', () => {
    const once = pseudoLocalize('Save')
    expect(isPseudoLocalized(once)).toBe(true)
    expect(isPseudoLocalized('Save')).toBe(false)
  })
})
