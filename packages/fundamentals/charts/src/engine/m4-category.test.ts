// The value-level M4 must produce exactly what placing every point and then
// reducing produces — it exists only to skip the per-datum allocation.
import { describe, expect, it } from 'vitest'
import { m4CategoryPoints, m4Pixels } from './decimate-values'
import { layoutSeriesPoints } from './layout'
import type { Domain, Rect } from './types'

const plot: Rect = { x: 37.3, y: 8, w: 743.7, h: 271 }

function values(n: number, seed: number): number[] {
  let s = seed
  return Array.from({ length: n }, (_, i) => {
    s = (s * 16807) % 2147483647
    return Math.sin(i / 97) * 50 + (s / 2147483647) * 30
  })
}

describe('m4CategoryPoints', () => {
  for (const [n, seed] of [[20_000, 7], [123_457, 11], [1_000_000, 3], [7000, 5]] as const) {
    for (const inverse of [false, true]) {
      it(`n=${n} inverse=${inverse}: identical to m4Pixels over the placed points`, () => {
        const vs = values(n, seed)
        const dom: Domain = { min: -60, max: 90, inverse }
        const direct = m4CategoryPoints(vs, plot, dom)
        expect(direct!.length).toBeGreaterThan(0)
        expect(direct).toEqual(m4Pixels(layoutSeriesPoints(vs, plot, dom)))
      })
    }
  }

  it('ties and a flat line keep first-occurrence order like the placed path', () => {
    const vs = Array.from({ length: 50_000 }, (_, i) => (i % 3 === 0 ? 5 : 1))
    const dom: Domain = { min: 0, max: 10 }
    expect(m4CategoryPoints(vs, plot, dom)).toEqual(m4Pixels(layoutSeriesPoints(vs, plot, dom)))
    const flat = Array.from({ length: 50_000 }, () => 3)
    expect(m4CategoryPoints(flat, plot, { min: 3, max: 3 })).toEqual(m4Pixels(layoutSeriesPoints(flat, plot, { min: 3, max: 3 })))
  })

  it('declines sparse lines and lines with gaps with an empty list (the general path handles runs)', () => {
    expect(m4CategoryPoints(values(500, 1), plot, { min: 0, max: 1 })).toEqual([])
    const gappy = values(50_000, 2)
    gappy[100] = Number.NaN
    expect(m4CategoryPoints(gappy, plot, { min: 0, max: 1 })).toEqual([])
  })
})
