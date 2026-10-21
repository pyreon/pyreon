// The y-domain scan skips gaps (NaN) and infinities the same way wherever they
// sit — first, last, or between the series that continue one span. Its hot
// loop is split in two phases (seed, then a bare min/max), so the oracle is a
// series with the non-finite values removed: both must resolve one domain.
import { describe, expect, it } from 'vitest'
import { defaultTheme, resolveYDomain } from './render'
import type { ChartSpec, Series } from './render'

const line = (values: number[]): Series => ({ kind: 'line', values, color: '#000', width: 2, radius: 3, label: 's' }) as Series
const spec = (series: Series[]): ChartSpec => ({ width: 400.0, height: 200.0, series, categories: [], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true })
const finite = (vs: number[]): number[] => vs.filter((v) => Number.isFinite(v))

describe('y-domain extent scan', () => {
  const cases: number[][][] = [
    [[Number.NaN, Number.POSITIVE_INFINITY, 5, 3, 9, Number.NEGATIVE_INFINITY, 1]],
    [[Number.NaN, Number.NaN], [Number.NaN, 40, -12, Number.NaN]],
    [[7, 7, 7], [Number.POSITIVE_INFINITY, 2], [50]],
    [[10, 9, 8, 7, 6, 5]],
    [[1, 2, 3, 4, 5, 6]],
    [[Number.NaN, -3, Number.NaN, 4]],
  ]
  for (const series of cases) {
    it(`matches the gap-free series: ${JSON.stringify(series)}`, () => {
      const withGaps = resolveYDomain(spec(series.map(line)))
      const clean = resolveYDomain(spec(series.map((vs) => line(finite(vs))).filter((s) => s.values.length > 0)))
      expect(withGaps).toEqual(clean)
    })
  }

  it('a series of nothing but gaps falls back to the unit domain', () => {
    expect(resolveYDomain(spec([line([Number.NaN, Number.POSITIVE_INFINITY])]))).toEqual(resolveYDomain(spec([line([])])))
  })
})
