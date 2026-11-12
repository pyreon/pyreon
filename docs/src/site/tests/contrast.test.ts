import { describe, expect, it } from 'vitest'
import { PAPER_PAIRS } from '../kit/cards'
import { color, diff, paper, syntax, verdict, type ColorKey } from '../theme'

/** WCAG 2.x relative luminance / contrast for #RRGGBB. */
function lum(hex: string): number {
  const v = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

const TEXT: ColorKey[] = ['text', 'strong', 'mist', 'fog', 'accent', 'accentText', 'warmText', 'ok', 'warn', 'err', 'link', 'prompt']
const SURFACES: ColorKey[] = ['bg', 'card', 'raised', 'well']

describe('theme contrast (WCAG AA 4.5:1 for text)', () => {
  for (const mode of ['dark', 'light'] as const) {
    for (const fg of TEXT) {
      for (const bg of SURFACES) {
        it(`${mode}: ${fg} on ${bg}`, () => {
          expect(contrast(color[fg][mode], color[bg][mode])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
    it(`${mode}: solid pill text`, () => {
      expect(contrast(color.solidText[mode], color.solidBg[mode])).toBeGreaterThanOrEqual(4.5)
    })
    it(`${mode}: verdict outline chips on the bench well`, () => {
      for (const k of ['tie', 'split', 'loss', 'info', 'experimental'] as const) {
        expect(contrast(verdict[k][mode], color.well[mode]), k).toBeGreaterThanOrEqual(4.5)
      }
    })
    it(`${mode}: diff text on its fill over the code well`, () => {
      // The fills are translucent over the code background; check text vs that background.
      const base = syntax[mode].bg
      expect(contrast(diff.delText[mode], base)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(diff.insText[mode], base)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${mode}: syntax colours on the code background`, () => {
      const s = syntax[mode]
      for (const k of ['fg', 'kw', 'str', 'num', 'fn', 'type', 'com', 'punct'] as const) {
        expect(contrast(s[k], s.bg), k).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  it('win chip: ink on every ember stop', () => {
    for (const stop of ['#FF1F8C', '#FF5E1A', '#FFC83D']) expect(contrast(verdict.winText, stop)).toBeGreaterThanOrEqual(4.5)
  })

  it('paper demo surface pairs', () => {
    for (const [name, fg, bg] of PAPER_PAIRS) expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(4.5)
    expect(contrast(paper.text, paper.field)).toBeGreaterThanOrEqual(4.5)
  })
})
