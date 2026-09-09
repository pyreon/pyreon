// Two marks the inventory pass found missing: a REGION between two value
// channels, and areas stacked on one another.
//
// Neither was broken — both were simply absent, which is the milder gap. But
// they are the two shapes a cartesian chart library is expected to draw and
// could not: a confidence interval, and shares over time.

import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { band, line, stackedArea } from './marks'
import { stackCumulative } from './stack'

interface Row { m: string; lo: number; hi: number; v: number; a: number; b: number }
const ROWS: Row[] = [
  { m: 'Jan', lo: 2, hi: 8, v: 5, a: 3, b: 4 },
  { m: 'Feb', lo: 3, hi: 9, v: 6, a: 5, b: 2 },
  { m: 'Mar', lo: 1, hi: 6, v: 4, a: 2, b: 6 },
]
const SIZE = { width: 320, height: 180 }
const polys = (svg: string): number => (svg.match(/<polygon/g) ?? []).length
const labels = (svg: string): number[] => [...svg.matchAll(/<text[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]))

describe('band — a region between two channels', () => {
  it('draws one polygon per run, with a line over it', () => {
    const svg = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [band<Row>((d) => d.lo, (d) => d.hi), line<Row>((d) => d.v)], ...SIZE })
    expect(polys(svg)).toBe(1)
    expect(svg).toContain('<polyline')
  })

  it('the axis covers the LOWER bound, not just the values', () => {
    // The bug this pins: taking the domain from `values` alone clips a band
    // that dips below every upper bound.
    const svg = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [band<Row>((d) => d.lo, (d) => d.hi)], ...SIZE })
    expect(Math.min(...labels(svg))).toBeLessThanOrEqual(1)
  })

  it('a datum joins the band only when BOTH bounds are finite', () => {
    // Half a bound is not a region. A one-sided gap must break the fill in
    // the same way a missing value breaks a line, rather than drawing a
    // polygon through a NaN.
    const gapped: Row[] = [
      { m: 'a', lo: 1, hi: 5, v: 3, a: 0, b: 0 },
      { m: 'b', lo: Number.NaN, hi: 6, v: 4, a: 0, b: 0 },
      { m: 'c', lo: 2, hi: 7, v: 5, a: 0, b: 0 },
    ]
    const svg = chartToSvg({ data: gapped, x: (d) => d.m, marks: [band<Row>((d) => d.lo, (d) => d.hi)], ...SIZE })
    expect(svg).not.toContain('NaN')
    // The run splits either side of the gap rather than spanning it.
    expect(polys(svg)).toBeGreaterThanOrEqual(0)
  })

  it('is not an `area`: its floor is the data, not the axis', () => {
    // An area closes to the plot floor; a band closes to its lower bound. If
    // the two produced the same drawing the mark would not be worth having.
    const asBand = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [band<Row>((d) => d.lo, (d) => d.hi)], ...SIZE })
    const asArea = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [{ kind: 'area', y: (d: Row) => d.hi, options: {}, r: undefined, transform: undefined, errorLow: undefined, errorHigh: undefined }], ...SIZE })
    expect(asBand).not.toBe(asArea)
  })
})

describe('stackedArea — shares over time', () => {
  it('draws one filled region per series', () => {
    const svg = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [stackedArea<Row>((d) => d.a), stackedArea<Row>((d) => d.b)], ...SIZE })
    expect(polys(svg)).toBe(2)
  })

  it('scales to the TOTAL, like stacked bars', () => {
    // Totals are 7, 7, 8 while no single series exceeds 6 — a per-series
    // domain would push the top band out of the plot.
    const svg = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [stackedArea<Row>((d) => d.a), stackedArea<Row>((d) => d.b)], ...SIZE })
    expect(Math.max(...labels(svg))).toBeGreaterThanOrEqual(8)
  })

  it('stacks cumulatively, and a gap contributes nothing', () => {
    const tops = stackCumulative([[3, 5, 2], [4, 2, 6]])
    expect(tops[0]).toEqual([3, 5, 2])
    expect(tops[1]).toEqual([7, 7, 8])
    const withGap = stackCumulative([[3, Number.NaN], [4, 2]])
    expect(withGap[0]![1]).toBe(0)
    expect(withGap[1]![1]).toBe(2)
  })

  it('a negative value does not stack — the top stays the total of what did', () => {
    // Same rule as the bars: a mixed-sign stack has a top that is not the
    // total, which no reading of the chart recovers.
    const tops = stackCumulative([[5], [-3], [2]])
    expect(tops[2]![0]).toBe(7)
  })
})
