/**
 * The observatory's token sets — pure functions with, until now, no coverage
 * at all despite `vitest.config.ts` declaring `ui/theme.ts` as measured.
 *
 * Two things are worth pinning. `hexToRgba` expands 3-char hex, which is the
 * kind of branch that silently produces `rgba(NaN,NaN,NaN,a)` when it breaks —
 * a colour that renders as nothing rather than as an error. And the two token
 * sets must stay STRUCTURALLY identical: a key present in dark and missing in
 * light is `undefined` at the use site, which CSS drops, so the component
 * loses that one declaration in exactly one mode.
 */
import { describe, expect, it } from 'vitest'
import { ACCENT, hexToRgba, tokens, type LoomTokens } from '../ui/theme'

describe('hexToRgba', () => {
  it('converts a 6-char hex', () => {
    expect(hexToRgba('#ff6b3d', 0.5)).toBe('rgba(255,107,61,0.5)')
  })

  it('expands a 3-char hex rather than producing NaN', () => {
    // `#abc` means `#aabbcc`. Without the expansion each slice reads a partial
    // pair and yields NaN, which renders as no colour at all.
    expect(hexToRgba('#abc', 1)).toBe('rgba(170,187,204,1)')
  })

  it('accepts a hex with no leading #', () => {
    expect(hexToRgba('ff6b3d', 0.25)).toBe('rgba(255,107,61,0.25)')
  })

  it('carries the alpha through verbatim, including 0', () => {
    expect(hexToRgba('#000000', 0)).toBe('rgba(0,0,0,0)')
  })
})

describe('tokens', () => {
  it('returns a distinct set per mode', () => {
    expect(tokens(true).bg).not.toBe(tokens(false).bg)
  })

  it('dark and light expose EXACTLY the same keys', () => {
    // A key in one mode only is `undefined` at the use site; CSS silently
    // drops the declaration, so the component loses one property in one mode
    // and nothing fails.
    const dark = Object.keys(tokens(true)).sort()
    const light = Object.keys(tokens(false)).sort()
    expect(light).toEqual(dark)
  })

  it('every token is a non-empty string in both modes', () => {
    for (const dark of [true, false]) {
      for (const [key, value] of Object.entries(tokens(dark))) {
        expect(typeof value, `${dark ? 'dark' : 'light'}.${key}`).toBe('string')
        expect(value.length, `${dark ? 'dark' : 'light'}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('uses the shared ACCENT in both modes', () => {
    expect(tokens(true).accent).toBe(ACCENT)
    expect(tokens(false).accent).toBe(ACCENT)
  })

  it('derives the soft accent from ACCENT rather than hardcoding it', () => {
    // If someone changes ACCENT, accentSoft must follow — a hardcoded rgba
    // would leave the two out of step with nothing to catch it.
    expect(tokens(true).accentSoft).toContain('255,107,61')
    expect(tokens(false).accentSoft).toContain('255,107,61')
  })

  it('satisfies the LoomTokens contract', () => {
    const t: LoomTokens = tokens(true)
    expect(t.danger).toBeTruthy()
    expect(t.ok).toBeTruthy()
    expect(t.warn).toBeTruthy()
  })
})
