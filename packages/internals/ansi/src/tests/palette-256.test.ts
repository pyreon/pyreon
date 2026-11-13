/**
 * The 256-colour level, recomputed from first principles: for every role
 * and both backgrounds, the shipped xterm-256 index must be the
 * CIEDE2000-nearest fixed entry (16–255) to the truecolor value among the
 * entries that keep the role's contrast on the design's background. If a
 * truecolor value changes, this test names the index to ship instead.
 */
import { describe, expect, it } from 'vitest'
import { BACKGROUND, CLI_PALETTE, EMBER, hexToRgb, type Role, xterm256Rgb } from '../index'

type Rgb = readonly [number, number, number]

const linear = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const lab = ([r8, g8, b8]: Rgb): Rgb => {
  const [r, g, b] = [linear(r8), linear(g8), linear(b8)]
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const rad = (d: number): number => (d * Math.PI) / 180
const deg = (r: number): number => ((r * 180) / Math.PI + 360) % 360

/** CIEDE2000 colour difference (Sharma, Wu, Dalal 2005). */
const deltaE2000 = (p: Rgb, q: Rgb): number => {
  const [L1, a1, b1] = lab(p)
  const [L2, a2, b2] = lab(q)
  const Cbar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = deg(Math.atan2(b1, a1p))
  const h2p = deg(Math.atan2(b2, a2p))
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dh = h2p - h1p
  if (C1p * C2p === 0) dh = 0
  else if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2))
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp: number
  if (C1p * C2p === 0) hbp = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2
  else hbp = (h1p + h2p - 360) / 2
  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63))
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2)
  const Sc = 1 + 0.045 * Cbp
  const Sh = 1 + 0.015 * Cbp * T
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

const FIXED = Array.from({ length: 240 }, (_, i) => i + 16)

/** The minimum contrast a role must keep: text roles 4.5:1, the gray track 3:1. */
const floorFor = (role: Role, truecolorContrast: number): number =>
  Math.min(role === 'gray' ? 3 : 4.5, truecolorContrast)

/** Fixed entries passing the floor, nearest first. */
const ranked = (target: Rgb, bg: Rgb, floor: number): number[] =>
  FIXED.filter((i) => contrast(xterm256Rgb(i), bg) >= floor).sort(
    (x, y) => deltaE2000(target, xterm256Rgb(x)) - deltaE2000(target, xterm256Rgb(y)),
  )

/**
 * Where the shipped index is deliberately not the nearest. Dark `gray`'s
 * nearest entry is 103, the same as dark `dim`; 244 is the next one and
 * keeps the two roles apart.
 */
const SECOND_NEAREST: ReadonlyArray<`${Role}.${'dark' | 'light'}`> = ['gray.dark']

describe('xterm256Rgb', () => {
  it('maps the colour cube and the gray ramp', () => {
    expect(xterm256Rgb(16)).toEqual([0, 0, 0])
    expect(xterm256Rgb(202)).toEqual([255, 95, 0])
    expect(xterm256Rgb(231)).toEqual([255, 255, 255])
    expect(xterm256Rgb(232)).toEqual([8, 8, 8])
    expect(xterm256Rgb(255)).toEqual([238, 238, 238])
  })
})

describe('256-colour palette', () => {
  for (const role of Object.keys(CLI_PALETTE) as Role[]) {
    for (const theme of ['dark', 'light'] as const) {
      const c = CLI_PALETTE[role]
      const index = c.x256[theme]
      it(`${role} on ${theme}: ${c[theme]} → ${index}`, () => {
        const target = hexToRgb(c[theme])
        const bg = hexToRgb(BACKGROUND[theme])
        const floor = floorFor(role, contrast(target, bg))
        expect(index).toBeGreaterThanOrEqual(16)
        expect(contrast(xterm256Rgb(index), bg)).toBeGreaterThanOrEqual(floor)
        const order = ranked(target, bg, floor)
        const position = SECOND_NEAREST.includes(`${role}.${theme}`) ? 1 : 0
        expect(order[position]).toBe(index)
      })
    }
  }

  it('text roles keep 4.5:1 on their background at 256 colours', () => {
    for (const role of Object.keys(CLI_PALETTE) as Role[]) {
      if (role === 'gray') continue
      for (const theme of ['dark', 'light'] as const) {
        const ratio = contrast(xterm256Rgb(CLI_PALETTE[role].x256[theme]), hexToRgb(BACKGROUND[theme]))
        expect(ratio, `${role} on ${theme}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('dim and gray stay distinct on both backgrounds, and gray stays the quieter one', () => {
    for (const theme of ['dark', 'light'] as const) {
      const bg = hexToRgb(BACKGROUND[theme])
      const dim = CLI_PALETTE.dim.x256[theme]
      const gray = CLI_PALETTE.gray.x256[theme]
      expect(dim).not.toBe(gray)
      expect(contrast(xterm256Rgb(gray), bg)).toBeLessThan(contrast(xterm256Rgb(dim), bg))
    }
  })

  it('the ember ramp maps to its nearest entries', () => {
    for (const tone of Object.values(EMBER)) {
      const target = hexToRgb(tone.hex)
      const nearest = [...FIXED].sort(
        (x, y) => deltaE2000(target, xterm256Rgb(x)) - deltaE2000(target, xterm256Rgb(y)),
      )[0]
      expect(tone.x256).toBe(nearest)
    }
  })
})
