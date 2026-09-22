import { describe, expect, it } from 'vitest'
import { applySeriesSelection, defaultTheme, layoutChart, renderChart, seriesEmphasisLevel, stateAreaOpacity, stateFill, stateLabelShown, stateWidth } from './render'
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
const texts = (s: ChartSpec): string[] => renderChart(s, measure).flatMap((c) => (c.kind === 'text' ? [c.text] : []))

describe('states — the extras ECharts styles a highlight, a selection and a blur with', () => {
  it('emphasis.disabled keeps a series at level 0 while another highlights', () => {
    const on = spec({ series: [series('points', [1, 2], { emphasisDisabled: true })], emphasis: { highlight: 1, selected: [] } })
    expect(seriesEmphasisLevel(on, on.series[0]!, 1)).toBe(0)
    const off = spec({ series: [series('points', [1, 2])], emphasis: { highlight: 1, selected: [] } })
    expect(seriesEmphasisLevel(off, off.series[0]!, 1)).toBe(1)
  })

  it('emphasis.scale grows the highlighted symbol only', () => {
    const plain = renderChart(spec({ series: [series('points', [1, 2])], emphasis: { highlight: 1, selected: [] } }), measure)
    const scaled = renderChart(spec({ series: [series('points', [1, 2], { emphasisScale: 3.0 })], emphasis: { highlight: 1, selected: [] } }), measure)
    const radii = (cmds: ReturnType<typeof renderChart>) => cmds.flatMap((c) => (c.kind === 'circle' ? [c.radius] : []))
    expect(Math.max(...radii(scaled))).toBeGreaterThan(Math.max(...radii(plain)))
  })

  it('a state stroke and area opacity apply while that state is active', () => {
    const s = spec({ series: [series('line', [1, 2], { emphasisWidth: 6.0, blurWidth: 1.0, emphasisAreaOpacity: 0.7, focus: 'self' })] })
    const idle = { ...s, emphasis: { highlight: -1, selected: [] } }
    const hot = { ...s, emphasis: { highlight: 1, selected: [] } }
    expect(stateWidth(idle, s.series[0]!)).toBe(2)
    expect(stateWidth(hot, s.series[0]!)).toBe(6)
    expect(stateAreaOpacity(hot, s.series[0]!)).toBeCloseTo(0.7, 9)
    expect(stateAreaOpacity(idle, s.series[0]!)).toBe(-1)
    // A disabled series never takes the EMPHASIS stroke; it still blurs with the rest.
    const off = { ...s, series: [{ ...s.series[0]!, emphasisDisabled: true }] }
    expect(stateWidth({ ...off, emphasis: { highlight: 1, selected: [] } }, off.series[0]!)).toBe(1)
  })

  it('emphasis.label / select.label print the datum only in that state', () => {
    const base = series('bars', [10, 17], { emphasisLabel: true, selectLabel: true })
    expect(stateLabelShown(spec({ series: [base], emphasis: { highlight: 1, selected: [] } }), base, 1)).toBe(true)
    expect(stateLabelShown(spec({ series: [base], emphasis: { highlight: -1, selected: [] } }), base, 1)).toBe(false)
    expect(stateLabelShown(spec({ series: [base], emphasis: { highlight: -1, selected: [1] } }), base, 1)).toBe(true)
    const hot = spec({ series: [base], categories: ['a', 'b'], emphasis: { highlight: 1, selected: [] } })
    expect(texts(hot)).toContain('17')
    expect(texts(spec({ series: [base], categories: ['a', 'b'] }))).not.toContain('17')
  })

  it('whole-series selection tints every datum of the listed series', () => {
    const s = applySeriesSelection(spec({ series: [series('bars', [1, 2], { selectColor: '#ff0000' }), series('bars', [3, 4], { selectColor: '#00ff00' })] }), [1])
    expect(s.series[0]!.seriesSelected).toBeUndefined()
    expect(stateFill(s, s.series[1]!, 0, '#0f766e')).toBe('#00ff00')
    expect(stateFill(s, s.series[1]!, 1, '#00ff00')).toBe('#00ff00')
    expect(stateFill(s, s.series[0]!, 0, '#0f766e')).toBe('#0f766e')
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
