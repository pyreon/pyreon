import { describe, expect, it } from 'vitest'
import { plotHitBars, plotHitIndex } from './plot-hit'
import { barsFor, defaultTheme, layoutChart } from './render'
import type { ChartSpec, Series } from './render'
import { measureApprox } from './svg'

const measure = measureApprox()

function series(kind: Series['kind'], values: number[]): Series {
  return { kind, values, color: '#0f766e', width: 2, radius: 3, label: kind }
}

function spec(s: Series[], categories: string[] = ['a', 'b', 'c']): ChartSpec {
  return {
    width: 300,
    height: 200,
    series: s,
    categories,
    theme: defaultTheme,
    showXAxis: true,
    showYAxis: true,
    showGrid: true,
  }
}

describe('plotHitBars', () => {
  it('reports the bar under the pointer for a plain bar series', () => {
    const sp = spec([series('bars', [3, 6, 9])])
    const bars = barsFor(sp, 0, measure)
    expect(bars.length).toBe(3)
    const b1 = bars[1]!
    expect(plotHitBars(sp, measure, b1.x + b1.w / 2, b1.y + b1.h / 2)).toBe(1)
    const l = layoutChart(sp, measure)
    expect(plotHitBars(sp, measure, l.plot.x - 10, l.plot.y + 10)).toBe(-1)
  })
  it('falls through to the stacked / grouped hit when there is no plain bar series', () => {
    const sp = spec([series('stacked', [3, 6, 9]), series('stacked', [1, 1, 1])])
    const l = layoutChart(sp, measure)
    const band = l.plot.w / 3
    // The tallest stack is the third band; a point just above the baseline there is inside it.
    expect(plotHitBars(sp, measure, l.plot.x + band * 2.5, l.plot.y + l.plot.h - 2)).toBe(2)
    expect(plotHitBars(sp, measure, l.plot.x + band * 2.5, l.plot.y - 5)).toBe(-1)
  })
  it('a line-only chart has no rect to hit', () => {
    const sp = spec([series('line', [3, 6, 9])])
    const l = layoutChart(sp, measure)
    expect(plotHitBars(sp, measure, l.plot.x + l.plot.w / 2, l.plot.y + l.plot.h / 2)).toBe(-1)
  })
})

describe('plotHitIndex', () => {
  it('prefers a bar hit, then the nearest x of a first line series', () => {
    const bars = spec([series('bars', [3, 6, 9])])
    const b = barsFor(bars, 0, measure)[2]!
    expect(plotHitIndex(bars, measure, b.x + b.w / 2, b.y + b.h / 2)).toBe(2)
    const line = spec([series('line', [3, 6, 9])])
    const l = layoutChart(line, measure)
    expect(plotHitIndex(line, measure, l.plot.x + 1, l.plot.y)).toBe(0)
    expect(plotHitIndex(line, measure, l.plot.x + l.plot.w - 1, l.plot.y)).toBe(2)
  })
  it('a bar-only first series with no hit stays a miss, and an empty spec is a miss', () => {
    const bars = spec([series('bars', [3, 6, 9])])
    const l = layoutChart(bars, measure)
    expect(plotHitIndex(bars, measure, l.plot.x + 1, l.plot.y + 1)).toBe(-1)
    const grouped = spec([series('grouped', [3, 6, 9])])
    expect(plotHitIndex(grouped, measure, l.plot.x - 10, l.plot.y - 10)).toBe(-1)
    expect(plotHitIndex(spec([]), measure, 10, 10)).toBe(-1)
  })
})
