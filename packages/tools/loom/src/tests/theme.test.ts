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
import { ACCENT, ACCENT_ON_PAPER, hexToRgba, tokens, type LoomTokens } from '../ui/theme'

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

  it('uses the ember accent on ink, and the text-safe ember on paper', () => {
    expect(tokens(true).accent).toBe(ACCENT)
    expect(tokens(false).accent).toBe(ACCENT_ON_PAPER)
  })

  it('derives the dark soft accent from ACCENT rather than hardcoding it', () => {
    // If someone changes ACCENT, accentSoft must follow — a hardcoded rgba
    // would leave the two out of step with nothing to catch it.
    expect(tokens(true).accentSoft).toBe(hexToRgba(ACCENT, 0.12))
  })

  it('satisfies the LoomTokens contract', () => {
    const t: LoomTokens = tokens(true)
    expect(t.danger).toBeTruthy()
    expect(t.ok).toBeTruthy()
    expect(t.warn).toBeTruthy()
  })
})

// ── WCAG AA, computed ─────────────────────────────────────────────────────

type Rgba = [number, number, number, number]
function parse(c: string): Rgba {
  if (c.startsWith('#')) {
    const h = c.slice(1)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
  }
  const p = /rgba?\(([^)]+)\)/.exec(c)![1]!.split(',').map(Number)
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
}
const over = (top: Rgba, bottom: Rgba): Rgba => [
  top[0] * top[3] + bottom[0] * (1 - top[3]),
  top[1] * top[3] + bottom[1] * (1 - top[3]),
  top[2] * top[3] + bottom[2] * (1 - top[3]),
  1,
]
const lum = (c: Rgba) => {
  const f = (x: number) => {
    const v = x / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (fg: Rgba, bg: Rgba) => {
  const [a, b] = [lum(fg), lum(bg)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('both themes pass 4.5:1 for text', () => {
  const TEXT = ['text', 'muted', 'faint', 'accent', 'ext', 'ok', 'warn', 'danger'] as const
  for (const dark of [true, false]) {
    const t = tokens(dark)
    const grounds: [string, Rgba][] = []
    for (const s of ['bg', 'surface', 'surface2'] as const) {
      const base = parse(t[s])
      grounds.push([s, base], [`accentSoft on ${s}`, over(parse(t.accentSoft), base)])
    }
    for (const role of TEXT) {
      it(`${dark ? 'dark' : 'light'}: ${role} on every ground`, () => {
        for (const [name, bg] of grounds) {
          const r = ratio(parse(t[role]), bg)
          expect(r, `${role} on ${name} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
    it(`${dark ? 'dark' : 'light'}: each status colour on its own tinted badge`, () => {
      for (const k of ['ok', 'warn', 'danger'] as const) {
        const soft = t[`${k}Soft` as const]
        for (const s of ['bg', 'surface', 'surface2'] as const) {
          const r = ratio(parse(t[k]), over(parse(soft), parse(t[s])))
          expect(r, `${k} on ${k}Soft over ${s} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
  }

  it('text on an accent fill passes in both modes', () => {
    for (const dark of [true, false]) {
      const t = tokens(dark)
      expect(ratio(parse(t.accentText), parse(t.accent))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the check is not vacuous: the dark ember on paper fails', () => {
    expect(ratio(parse(ACCENT), parse(tokens(false).bg))).toBeLessThan(4.5)
  })
})
