import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { chartTable } from './a11y'
import { Bar, Dot, resolveGrammar } from './grammar'
import { fillBy, shadeBy } from './item-colors'
import { bars, groupedBars, points, resolveMarks, stackedBars } from './marks'
import { defaultTheme, renderChart, stateFill } from './render'
import type { ChartSpec, Series } from './render'
import { tooltipAt, tooltipLines } from './tooltip'
import { renderSvg } from './svg'

interface Row { m: string; v: number; tone?: string; heat?: number }

const ROWS: Row[] = [
  { m: 'a', v: 3, tone: '#ff0000', heat: 10 },
  { m: 'b', v: 6, tone: '#00ff00', heat: 20 },
  { m: 'c', v: 4, heat: 30 },
]

const measure = (t: string, s: number): number => t.length * s * 0.6

const spec = (series: Series[], extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400, height: 200, series, categories: ['a', 'b', 'c'], theme: defaultTheme,
  showXAxis: true, showYAxis: true, showGrid: true, ...extra,
})

const fills = (cmds: ReturnType<typeof renderChart>): string[] => cmds.flatMap((c) => (c.kind === 'rect' && c.fill !== defaultTheme.background ? [c.fill] : []))

describe('fillBy', () => {
  it('reads a colour off the row; a missing one leaves the datum in the series colour', () => {
    const p = fillBy<Row>('tone').resolve(ROWS)
    expect(p.colors).toEqual(['#ff0000', '#00ff00', ''])
    expect(p.shades).toBeUndefined()
  })
  it('takes an accessor, and ignores a non-string result', () => {
    expect(fillBy<Row>((d, i) => (i === 1 ? d.tone : undefined)).resolve(ROWS).colors).toEqual(['', '#00ff00', ''])
  })
})

describe('shadeBy', () => {
  it('maps the value through the ramp over the data extent, and keeps the values', () => {
    const p = shadeBy<Row>('heat', { ramp: ['#000000', '#ffffff'] }).resolve(ROWS)
    expect(p.shades).toEqual([10, 20, 30])
    expect(p.colors[0]).toBe('rgb(0, 0, 0)')
    expect(p.colors[2]).toBe('rgb(255, 255, 255)')
    expect(p.colors[1]).toBe('rgb(128, 128, 128)')
  })
  it('a pinned domain clamps outside values to the end stops', () => {
    const p = shadeBy<Row>('heat', { ramp: ['#000000', '#ffffff'], domain: { min: 20, max: 30 } }).resolve(ROWS)
    expect(p.colors[0]).toBe('rgb(0, 0, 0)')
    expect(p.colors[2]).toBe('rgb(255, 255, 255)')
  })
  it('a missing value is a gap (no colour, NaN shade), not a zero', () => {
    const p = shadeBy<Row>((d) => (d.m === 'b' ? undefined : d.heat)).resolve(ROWS)
    expect(p.colors[1]).toBe('')
    expect(Number.isNaN(p.shades![1]!)).toBe(true)
  })
  it('a constant series takes the middle of the ramp rather than dividing by zero', () => {
    const p = shadeBy<Row>(() => 5, { ramp: ['#000000', '#ffffff'] }).resolve(ROWS)
    expect(new Set(p.colors).size).toBe(1)
    expect(p.colors[0]).toBe('rgb(128, 128, 128)')
  })
  it('a non-number result keeps the series colour and does not throw', () => {
    // @ts-expect-error a string is not a number; the chart must still draw
    expect(() => shadeBy<Row>(() => 'x').resolve(ROWS)).not.toThrow()
  })
})

describe('the series and the draw list', () => {
  it('an unpainted mark resolves to a series with no itemColors/shades keys at all', () => {
    const s = resolveMarks(ROWS, [bars((d: Row) => d.v)])[0]!
    expect('itemColors' in s).toBe(false)
    expect('shades' in s).toBe(false)
  })
  it('a painted bar chart draws each bar in its own colour, falling back to the series colour', () => {
    const s = resolveMarks(ROWS, [bars((d: Row) => d.v, { fill: fillBy<Row>('tone') as never })])
    const f = fills(renderChart(spec(s), measure))
    expect(f).toEqual(['#ff0000', '#00ff00', s[0]!.color])
  })
  it('stacked and grouped bars honour fill (one stateFill chokepoint)', () => {
    const marks = [stackedBars((d: Row) => d.v, { fill: fillBy<Row>('tone') as never }), stackedBars((d: Row) => d.v)]
    expect(fills(renderChart(spec(resolveMarks(ROWS, marks)), measure))).toContain('#ff0000')
    const g = [groupedBars((d: Row) => d.v, { fill: fillBy<Row>('tone') as never })]
    expect(fills(renderChart(spec(resolveMarks(ROWS, g)), measure))).toContain('#00ff00')
  })
  it('dots honour fill', () => {
    const s = resolveMarks(ROWS, [points((d: Row) => d.v, { fill: fillBy<Row>('tone') as never })])
    const circles = renderChart(spec(s), measure).flatMap((c) => (c.kind === 'circle' ? [c.fill] : []))
    expect(circles).toContain('#ff0000')
  })
  it('horizontal bars honour fill', () => {
    const s = resolveMarks(ROWS, [bars((d: Row) => d.v, { fill: fillBy<Row>('tone') as never })])
    expect(fills(renderChart(spec(s, { horizontal: true }), measure))).toEqual(['#ff0000', '#00ff00', s[0]!.color])
  })
  it('a brush fade still applies on top of a per-datum colour', () => {
    const s = resolveMarks(ROWS, [bars((d: Row) => d.v, { fill: fillBy<Row>('tone') as never })])[0]!
    expect(stateFill({ ...s, inBrush: [], brushOpacity: 0.2 }, 0, s.color)).not.toBe('#ff0000')
    expect(stateFill({ ...s, inBrush: [0], brushOpacity: 0.2 }, 0, s.color)).toBe('#ff0000')
  })
  it('SVG output carries the per-datum colours', () => {
    const s = resolveMarks(ROWS, [bars((d: Row) => d.v, { fill: fillBy<Row>('tone') as never })])
    expect(renderSvg(renderChart(spec(s), measure), 400, 200)).toContain('#ff0000')
  })
})

describe('the value behind a shade reaches the reader', () => {
  const s = resolveMarks(ROWS, [bars((d: Row) => d.v, { label: 'Revenue', fill: shadeBy<Row>('heat') as never })])
  it('the accessible table has a (shade) column with the raw values', () => {
    const t = chartTable({ categories: ['a', 'b', 'c'], series: s })
    expect(t.headers).toEqual(['Category', 'Revenue', 'Revenue (shade)'])
    expect(t.rows.map((r) => r[2])).toEqual(['10', '20', '30'])
  })
  it('the tooltip names it', () => {
    expect(tooltipLines(tooltipAt(1, ['a', 'b', 'c'], s))).toEqual(['b', 'Revenue: 6 (shade 20)'])
  })
  it('an unshaded series prints exactly what it always did', () => {
    const plain = resolveMarks(ROWS, [bars((d: Row) => d.v, { label: 'Revenue' })])
    expect(tooltipLines(tooltipAt(1, ['a', 'b', 'c'], plain))).toEqual(['b', 'Revenue: 6'])
    expect(chartTable({ categories: ['a'], series: plain }).headers).toEqual(['Category', 'Revenue'])
  })
})

describe('on the grammar', () => {
  it('fill is a descriptor, so it cannot be confused with the series colour or the long-format split', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: (d: Row) => d.m }, [h(Bar<Row>, { y: 'v', color: '#112233', fill: fillBy<Row>('tone') })])
    const s = resolveMarks(ROWS, g.marks)[0]!
    expect(s.color).toBe('#112233')
    expect(s.itemColors).toEqual(['#ff0000', '#00ff00', ''])
  })
  it('works on Dot as well', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: (d: Row) => d.m }, [h(Dot<Row>, { y: 'v', fill: shadeBy<Row>('heat') })])
    expect(resolveMarks(ROWS, g.marks)[0]!.shades).toEqual([10, 20, 30])
  })
})
