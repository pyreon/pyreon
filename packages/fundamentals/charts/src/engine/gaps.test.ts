import { describe, expect, it } from 'vitest'
import { chartTable } from './a11y'
import { layoutBars, layoutBarsH, hitBar } from './layout'
import { bars, line, resolveMarks, stackedBars, groupedBars } from './marks'
import { plotHitBars, plotHitBarsIn, plotHitIndex, plotHitIndexIn } from './plot-hit'
import { defaultTheme, layoutChart, renderChart, renderChartIn, barsFor, barsForIn, stackedHitAt, stackedHitIn } from './render'
import type { ChartSpec } from './render'
import { layoutGroupedBars, layoutStackedBars } from './stack'
import { tooltipAt } from './tooltip'

const measure = (t: string, s: number): number => t.length * s * 0.6
interface Row { v: number | null }
const ROWS: Row[] = [{ v: 4 }, { v: null }, { v: 8 }, { v: Number.NaN }]

function spec(marks: ReturnType<typeof bars<Row>>[]): ChartSpec {
  return { width: 400, height: 200, series: resolveMarks(ROWS, marks), categories: ['a', 'b', 'c', 'd'], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true }
}

describe('a missing measurement is a gap everywhere', () => {
  it('a NaN bar is a zero-height rect at the zero line — drawn as nothing, never hit', () => {
    const rects = layoutBars([4, Number.NaN, 8], { x: 0, y: 0, w: 300, h: 100 }, { min: 0, max: 10 }, 0)
    expect(rects[1]).toEqual({ x: 100, y: 100, w: 100, h: 0 })
    expect(hitBar(rects, 150, 50)).toBe(-1)
    const h = layoutBarsH([4, Number.NaN], { x: 0, y: 0, w: 100, h: 100 }, { min: 0, max: 10 }, 0)
    expect(h[1]!.w).toBe(0)
  })

  it('a gap in a stack or a group contributes nothing and produces no NaN geometry', () => {
    const st = layoutStackedBars([[1, Number.NaN], [2, 3]], { x: 0, y: 0, w: 200, h: 100 }, { min: 0, max: 10 }, 0)
    expect(st.some((s) => Number.isNaN(s.rect.y) || Number.isNaN(s.rect.h))).toBe(false)
    expect(st.filter((s) => s.datumIndex === 1)).toHaveLength(1)
    const gr = layoutGroupedBars([[1, Number.NaN]], { x: 0, y: 0, w: 200, h: 100 }, { min: 0, max: 10 }, 0)
    expect(gr[1]!.rect.h).toBe(0)
  })

  it('renders a sparse series with no NaN coordinate and no NaN label', () => {
    const s = spec([bars<Row>((d) => d.v as number, { showValues: true }), line<Row>((d) => d.v as number)])
    const cmds = renderChart(s, measure)
    const text = JSON.stringify(cmds)
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('null')
    // The line breaks into two single-point runs around the gaps: nothing to draw as a polyline of one point.
    expect(cmds.filter((c) => c.kind === 'polyline').length).toBe(0)
  })

  it('leaves the gap out of the accessible table and the tooltip', () => {
    const [s] = resolveMarks(ROWS, [bars<Row>((d) => d.v as number)])
    const t = chartTable({ categories: ['a', 'b', 'c', 'd'], series: [{ label: 'V', values: s!.values, kind: 'bars' }] })
    expect(t.rows[1]).toEqual(['b', ''])
    const tip = tooltipAt(1, ['a', 'b'], [{ label: 'V', values: s!.values, color: '#000' }])
    expect(tip.rows).toEqual([])
  })
})

describe('the layout-taking variants answer exactly what the measuring ones do', () => {
  it('renderChartIn / barsForIn / stackedHitIn / plotHit*In match their originals', () => {
    const s = spec([bars<Row>((d) => d.v as number), stackedBars<Row>((d) => d.v as number), groupedBars<Row>((d) => d.v as number)])
    const l = layoutChart(s, measure)
    expect(renderChartIn(s, measure, l)).toEqual(renderChart(s, measure))
    expect(barsForIn(s, 0, l.plot)).toEqual(barsFor(s, 0, measure))
    const first = barsFor(s, 0, measure)[0]!
    const px = first.x + first.w / 2
    const py = first.y + first.h / 2
    expect(plotHitBarsIn(s, l, px, py)).toBe(plotHitBars(s, measure, px, py))
    expect(plotHitIndexIn(s, l, px, py)).toBe(plotHitIndex(s, measure, px, py))
    expect(stackedHitIn(s, l.plot, px, py)).toBe(stackedHitAt(s, measure, px, py))
  })
})
