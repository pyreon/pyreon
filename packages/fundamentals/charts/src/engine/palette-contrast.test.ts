// The default palettes' two measured properties. A palette is data anyone can
// edit by eye; these hold it to what a reader actually needs.
import { describe, expect, it } from 'vitest'
import { DARK_PALETTE, DEFAULT_PALETTE } from './palette'
import { chartThemes } from './theme'

const rgb = (h: string): [number, number, number] => [0, 2, 4].map((i) => Number.parseInt(h.slice(1 + i, 3 + i), 16) / 255) as [number, number, number]
const lin = (x: number): number => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
const luminance = (h: string): number => {
  const [r, g, b] = rgb(h).map(lin) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// Machado et al. 2009, severity 1.
const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]
const PROTAN = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]
const lab = (c: number[]): number[] => {
  const [r, g, b] = c as [number, number, number]
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
const seen = (h: string, m: number[][] | null): number[] => {
  const c = rgb(h).map(lin)
  return m === null ? c : m.map((row) => Math.min(1, Math.max(0, row[0]! * c[0]! + row[1]! * c[1]! + row[2]! * c[2]!)))
}
const deltaE = (a: string, b: string): number =>
  Math.min(...[null, DEUTAN, PROTAN].map((m) => {
    const [x, y] = [lab(seen(a, m)), lab(seen(b, m))]
    return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!)
  }))
const worstPair = (p: readonly string[], k: number): number => {
  let w = Infinity
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) w = Math.min(w, deltaE(p[i]!, p[j]!))
  return w
}

describe('the default palettes', () => {
  it('every light-palette colour clears 3:1 against white (WCAG 1.4.11)', () => {
    for (const c of DEFAULT_PALETTE) expect(contrast(c, '#ffffff'), c).toBeGreaterThanOrEqual(3)
  })

  it('every dark-palette colour clears 3:1 against the dark ground', () => {
    for (const c of DARK_PALETTE) expect(contrast(c, chartThemes.dark.background), c).toBeGreaterThanOrEqual(3)
  })

  it('the first four series stay distinct for normal, deutan and protan vision, in both modes', () => {
    // ΔE ≥ 20 reads as clearly different colours. The previous order fell to
    // 4.4 (light) and 1.0 (dark) at four series: blue and violet collapsed.
    expect(worstPair(DEFAULT_PALETTE, 4)).toBeGreaterThanOrEqual(20)
    expect(worstPair(DARK_PALETTE, 4)).toBeGreaterThanOrEqual(20)
  })

  it('light and dark keep one hue per series', () => {
    expect(DARK_PALETTE).toHaveLength(DEFAULT_PALETTE.length)
    for (let i = 0; i < DEFAULT_PALETTE.length; i++) expect(deltaE(DEFAULT_PALETTE[i]!, DARK_PALETTE[i]!), String(i)).toBeLessThan(35)
  })
})
