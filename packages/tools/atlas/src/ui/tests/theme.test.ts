/**
 * Unit tests for the theme tokens.
 *
 * `tokens()` is the single source of every colour the workbench paints, and its
 * two branches (light/dark) plus the `contrast` special-case are pure — worth
 * pinning here rather than eyeballing in a browser.
 *
 * Imports ONLY `../theme` on purpose: `../kit` re-exports the `el`/`txt` bases,
 * so importing it would drag rocketstyle + the whole styling stack (and its
 * built `lib/` deps) into what should be a pure, fast unit test. The `dim`
 * adapter it also exports is a one-line pass-through whose contract is enforced
 * by the 8 `.states(dim(…))` call sites type-checking.
 */
import { describe, expect, it } from 'vitest'
import type { ThemeTokens } from '../theme'
import { hexToRgba, THEMES, tokens } from '../theme'

const byId = (id: string) => THEMES.find((t) => t.id === id)!

describe('hexToRgba', () => {
  it('expands 6-digit hex', () => {
    expect(hexToRgba('#ff6b3d', 0.5)).toBe('rgba(255,107,61,0.5)')
  })

  it('expands 3-digit shorthand to the same colour as its 6-digit form', () => {
    expect(hexToRgba('#f00', 1)).toBe('rgba(255,0,0,1)')
    expect(hexToRgba('#f00', 1)).toBe(hexToRgba('#ff0000', 1))
  })

  it('tolerates a missing leading #', () => {
    expect(hexToRgba('2f9e6f', 0.2)).toBe('rgba(47,158,111,0.2)')
  })
})

describe('tokens', () => {
  const keys: (keyof ThemeTokens)[] = [
    'bg', 'surface', 'surface2', 'chrome', 'text', 'muted', 'faint', 'border',
    'accent', 'accent2', 'accentSoft', 'accentText', 'ok', 'okSoft', 'warn',
    'danger', 'dotColor', 'codeBg', 'codeFg',
  ]

  it('returns EVERY token in both modes (a missing key renders `undefined` CSS)', () => {
    for (const dark of [true, false]) {
      const t = tokens(byId('ember'), dark)
      for (const k of keys) {
        expect(t[k], `${k} @ dark=${dark}`).toBeTruthy()
      }
    }
  })

  it('light and dark differ on the surfaces they are meant to invert', () => {
    const d = tokens(byId('ember'), true)
    const l = tokens(byId('ember'), false)
    expect(d.bg).not.toBe(l.bg)
    expect(d.text).not.toBe(l.text)
    // brand accent is mode-independent for a normal brand
    expect(d.accent).toBe(l.accent)
  })

  it('derives accent2/accentSoft from the brand accent', () => {
    const t = tokens(byId('aurora'), true)
    expect(t.accent).toBe(byId('aurora').accent)
    expect(t.accent2).toBe(hexToRgba(byId('aurora').accent, 0.7))
    expect(t.accentSoft).toBe(hexToRgba(byId('aurora').accent, 0.18))
  })

  it('INVERTS the monochrome `contrast` brand per mode so it stays visible', () => {
    const d = tokens(byId('contrast'), true)
    const l = tokens(byId('contrast'), false)
    // dark mode needs a light accent, light mode a dark one — otherwise the
    // accent would vanish into the background it sits on.
    expect(d.accent).not.toBe(l.accent)
    expect(d.accentText).toBe('#141824')
    expect(l.accentText).toBe('#fff')
  })

  it('uses white accent text for the coloured brands', () => {
    expect(tokens(byId('ember'), true).accentText).toBe('#fff')
    expect(tokens(byId('forest'), false).accentText).toBe('#fff')
  })
})
