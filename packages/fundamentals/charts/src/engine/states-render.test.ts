import { describe, expect, it } from 'vitest'
import { applySeriesSelection, defaultTheme, layoutChart, seriesEmphasisLevel, stateFill } from './render'
import type { ChartSpec, Series } from './render'
import { plotHitSeriesIn } from './plot-hit'
import type { Double, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (kind: Series['kind'], values: Double[], over: Partial<Series> = {}): Series =>
  ({ kind, values, color: '#0f766e', width: 2.0, radius: 3.0, label: 'S', ...over })
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400.0, height: 200.0, series: [series('line', [10, 20, 30])], categories: [],
  theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...over,
})

describe('whole-series selection (`selectedMode: "series"`)', () => {
  it('puts every datum of a listed series in the selected state, and no other', () => {
    const s = applySeriesSelection(spec({ series: [series('bars', [1, 2]), series('bars', [3, 4])] }), [1])
    expect(s.series[0]!.seriesSelected).toBeUndefined()
    expect(s.series[1]!.seriesSelected).toBe(true)
    expect(seriesEmphasisLevel(s, s.series[1]!, 0)).toBe(2)
    expect(seriesEmphasisLevel(s, s.series[1]!, 1)).toBe(2)
    expect(seriesEmphasisLevel(s, s.series[0]!, 0)).toBe(0)
    // Selection outlines the datum; its fill is its own.
    expect(stateFill(s.series[1]!, 0, '#0f766e')).toBe('#0f766e')
  })

  it('a highlight still reaches the series that is not selected', () => {
    const s = applySeriesSelection(spec({ series: [series('points', [1, 2]), series('points', [3, 4])], emphasis: { highlight: 1, selected: [] } }), [0])
    expect(seriesEmphasisLevel(s, s.series[1]!, 1)).toBe(1)
    expect(seriesEmphasisLevel(s, s.series[1]!, 0)).toBe(0)
  })
})

describe('plotHitSeriesIn — which series a tap pins under `selectedMode: "series"`', () => {
  it('names the bar series whose rect holds the point, and the nearest point series otherwise', () => {
    const bars = spec({ series: [series('bars', [10, 20, 30])], categories: ['a', 'b', 'c'] })
    const l = layoutChart(bars, measure)
    const r = { x: l.plot.x + l.plot.w / 2, y: l.plot.y + l.plot.h - 5 }
    expect(plotHitSeriesIn(bars, l, r.x, r.y, 14)).toBe(0)
    expect(plotHitSeriesIn(bars, l, l.plot.x - 40, l.plot.y - 40, 14)).toBe(-1)
    const two = spec({ series: [series('points', [1, 1, 1]), series('points', [30, 30, 30])] })
    const l2 = layoutChart(two, measure)
    expect(plotHitSeriesIn(two, l2, l2.plot.x + l2.plot.w / 2, l2.plot.y + l2.plot.h - 2, 20)).toBe(0)
    expect(plotHitSeriesIn(two, l2, l2.plot.x + l2.plot.w / 2, l2.plot.y + 2, 20)).toBe(1)
  })
})
