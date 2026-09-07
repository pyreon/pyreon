// Emphasis in the draw list — the engine half of the events/actions model.
// Every assertion is on the DrawCmd[] `renderChart` returns, so it holds for
// the web canvas, the SVG string and the generated native engines alike.

import { describe, expect, it } from 'vitest'
import { bars, groupedBars, resolveMarks, stackedBars, points } from './marks'
import { defaultTheme, emphasisLevel, layoutChart, renderChart } from './render'
import type { ChartSpec, Emphasis } from './render'
import type { DrawCmd } from './types'

interface Row {
  k: string
  v: number
  w: number
}
const ROWS: Row[] = [
  { k: 'a', v: 3, w: 1 },
  { k: 'b', v: 5, w: 2 },
  { k: 'c', v: 2, w: 4 },
]
const measure = (t: string, s: number): number => t.length * s * 0.6

const spec = (series: ChartSpec['series'], emphasis?: Emphasis, over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 300,
  height: 160,
  series,
  categories: ROWS.map((r) => r.k),
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...(emphasis === undefined ? {} : { emphasis }),
  ...over,
})

const outlines = (cmds: DrawCmd[]): { width: number }[] =>
  cmds.filter((c): c is Extract<DrawCmd, { kind: 'polyline' }> => c.kind === 'polyline' && (c.width === 1.5 || c.width === 2.5) && c.points.length === 5 && c.dash === undefined)
const band = (cmds: DrawCmd[]): Extract<DrawCmd, { kind: 'rect' }> | undefined =>
  cmds.find((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect' && c.fill.startsWith('rgba(132, 150, 165, 0.14'))

describe('emphasisLevel', () => {
  it('reads 0 without emphasis, 1 for the highlight, 2 for a pin — and a pin wins over the highlight', () => {
    const s = spec(resolveMarks(ROWS, [bars((d: Row) => d.v)]))
    expect(emphasisLevel(s, 1)).toBe(0)
    const e = spec(s.series, { highlight: 1, selected: [2] })
    expect(emphasisLevel(e, 1)).toBe(1)
    expect(emphasisLevel(e, 2)).toBe(2)
    expect(emphasisLevel(e, 0)).toBe(0)
    expect(emphasisLevel(spec(s.series, { highlight: 2, selected: [2] }), 2)).toBe(2)
  })
})

describe('renderChart emphasis', () => {
  it('draws nothing extra without emphasis', () => {
    const cmds = renderChart(spec(resolveMarks(ROWS, [bars((d: Row) => d.v), points((d: Row) => d.w)])), measure)
    expect(outlines(cmds)).toHaveLength(0)
    expect(band(cmds)).toBeUndefined()
  })

  it('highlights a column: one faint band over it, under the series, and a 1.5px outline on its bar', () => {
    const s = spec(resolveMarks(ROWS, [bars((d: Row) => d.v)]), { highlight: 1, selected: [] })
    const cmds = renderChart(s, measure)
    const b = band(cmds)
    expect(b).toBeDefined()
    const plot = layoutChart(s, measure).plot
    // The band is column 1 of 3, spanning the plot's full height.
    expect(b!.rect.x).toBeCloseTo(plot.x + plot.w / 3, 5)
    expect(b!.rect.w).toBeCloseTo(plot.w / 3, 5)
    expect(b!.rect.y).toBeCloseTo(plot.y, 5)
    expect(b!.rect.h).toBeCloseTo(plot.h, 5)
    // ...and sits BEFORE the bar fills.
    const firstBar = cmds.findIndex((c) => c.kind === 'rect' && c.fill === s.series[0]!.color)
    expect(cmds.indexOf(b!)).toBeLessThan(firstBar)
    expect(outlines(cmds).map((o) => o.width)).toEqual([1.5])
  })

  it('pins draw the heavy outline and the pin wins where it coincides with the highlight', () => {
    const s = spec(resolveMarks(ROWS, [bars((d: Row) => d.v)]), { highlight: 2, selected: [0, 2] })
    expect(outlines(renderChart(s, measure)).map((o) => o.width)).toEqual([2.5, 2.5])
  })

  it('outlines every segment of a pinned datum in a stack and a group', () => {
    const stacked = spec(resolveMarks(ROWS, [stackedBars((d: Row) => d.v), stackedBars((d: Row) => d.w)]), { highlight: -1, selected: [1] })
    expect(outlines(renderChart(stacked, measure)).map((o) => o.width)).toEqual([2.5, 2.5])
    const grouped = spec(resolveMarks(ROWS, [groupedBars((d: Row) => d.v), groupedBars((d: Row) => d.w)]), { highlight: 1, selected: [] })
    expect(outlines(renderChart(grouped, measure)).map((o) => o.width)).toEqual([1.5, 1.5])
  })

  it('a horizontal chart outlines the bar but draws no column band', () => {
    const s = spec(resolveMarks(ROWS, [bars((d: Row) => d.v)]), { highlight: 0, selected: [] }, { horizontal: true })
    const cmds = renderChart(s, measure)
    expect(band(cmds)).toBeUndefined()
    expect(outlines(cmds).map((o) => o.width)).toEqual([1.5])
  })

  it('a highlighted point gets a translucent halo UNDER its dot', () => {
    const s = spec(resolveMarks(ROWS, [points((d: Row) => d.w)]), { highlight: 2, selected: [] })
    const cmds = renderChart(s, measure)
    const halo = cmds.findIndex((c) => c.kind === 'circle' && c.fill.startsWith('rgba(90, 107, 122, 0.35'))
    expect(halo).toBeGreaterThanOrEqual(0)
    const dot = cmds[halo + 1]!
    expect(dot.kind).toBe('circle')
    expect((dot as Extract<DrawCmd, { kind: 'circle' }>).fill).toBe(s.series[0]!.color)
  })

  it('an out-of-range highlight draws nothing', () => {
    const s = spec(resolveMarks(ROWS, [bars((d: Row) => d.v)]), { highlight: 7, selected: [] })
    const cmds = renderChart(s, measure)
    expect(band(cmds)).toBeUndefined()
    expect(outlines(cmds)).toHaveLength(0)
  })
})
