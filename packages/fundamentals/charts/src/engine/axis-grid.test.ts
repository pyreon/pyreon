import { describe, expect, it } from 'vitest'
import { bars, line, resolveMarks } from './marks'
import type { Mark } from './marks'
import { defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec } from './render'
import type { DrawCmd } from './types'

const measure = (t: string, s: number): number => t.length * s * 0.6
interface Row { a: number }
const DATA: Row[] = [{ a: 3 }, { a: 18 }, { a: 9 }, { a: 14 }]
const a = (d: Row): number => d.a

const mk = (marks: Mark<Row>[], extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 360, height: 220, series: resolveMarks(DATA, marks), categories: ['a', 'b', 'c', 'd'], theme: defaultTheme,
  showXAxis: true, showYAxis: true, showGrid: true, ...extra,
})

const gridLines = (cmds: DrawCmd[], w: number, stroke: string): DrawCmd[] => cmds.filter((c) => c.kind === 'line' && c.stroke === stroke && c.width === w)
const horizontalRuns = (cmds: DrawCmd[]): number => cmds.filter((c) => c.kind === 'line' && c.from.y === c.to.y && c.from.x !== c.to.x && c.stroke === defaultTheme.grid).length
const verticalRuns = (cmds: DrawCmd[]): number => cmds.filter((c) => c.kind === 'line' && c.from.x === c.to.x && c.from.y !== c.to.y && c.stroke === defaultTheme.grid).length

describe('per-axis grid', () => {
  it('unset draws exactly what it always did (value-axis lines only)', () => {
    const base = renderChart(mk([bars<Row>(a)]), measure)
    expect(renderChart(mk([bars<Row>(a)], { yGrid: undefined, xGrid: undefined, yMinor: undefined, xMinor: undefined }), measure)).toEqual(base)
    expect(verticalRuns(base)).toBe(0)
    expect(horizontalRuns(base)).toBe(layoutChart(mk([bars<Row>(a)]), measure).yTicks.length)
  })
  it('yGrid false hides the value lines while showGrid stays on', () => {
    expect(horizontalRuns(renderChart(mk([bars<Row>(a)], { yGrid: false }), measure))).toBe(0)
  })
  it('xGrid adds a vertical line at every x tick, beside the value lines', () => {
    const spec = mk([bars<Row>(a)], { xGrid: true })
    const cmds = renderChart(spec, measure)
    expect(verticalRuns(cmds)).toBe(layoutChart(spec, measure).xTicks.length)
    expect(horizontalRuns(cmds)).toBe(layoutChart(spec, measure).yTicks.length)
  })
  it('on a horizontal chart xGrid draws the CATEGORY lines (horizontal) beside the value lines (vertical)', () => {
    const spec = mk([bars<Row>(a)], { xGrid: true, horizontal: true })
    const cmds = renderChart(spec, measure)
    const l = layoutChart(spec, measure)
    expect(horizontalRuns(cmds)).toBe(l.yTicks.length)
    expect(verticalRuns(cmds)).toBe(l.xTicks.length)
  })
  it('yGrid is independent of showGrid: showGrid false with yGrid true draws the value lines', () => {
    expect(horizontalRuns(renderChart(mk([bars<Row>(a)], { showGrid: false, yGrid: true }), measure))).toBeGreaterThan(0)
  })
})

describe('minor grid lines', () => {
  it('yMinor n draws n - 1 thin lines between each pair of major ticks, at equal pixel steps', () => {
    const spec = mk([bars<Row>(a)], { yMinor: 4 })
    const l = layoutChart(spec, measure)
    const minors = gridLines(renderChart(spec, measure), 0.5, defaultTheme.grid).concat(renderChart(spec, measure).filter((c) => c.kind === 'line' && c.width === 0.5))
    const ys = [...new Set(minors.map((c) => (c as { from: { y: number } }).from.y))].sort((p, q) => p - q)
    expect(ys.length).toBe((l.yTicks.length - 1) * 3)
    const gaps = [...new Set(ys.slice(1).map((y, i) => Math.round((y - ys[i]!) * 1000) / 1000))]
    expect(gaps.length).toBeLessThanOrEqual(2)
  })
  it('minor lines never coincide with a major tick', () => {
    const spec = mk([line<Row>(a)], { yMinor: 5 })
    const l = layoutChart(spec, measure)
    const cmds = renderChart(spec, measure).filter((c) => c.kind === 'line' && c.width === 0.5) as { from: { y: number } }[]
    for (const c of cmds) for (const t of l.yTicks) expect(Math.abs(c.from.y - t.pos)).toBeGreaterThan(0.5)
  })
  it('a value below 2 draws none, and a log axis is left to its own decade ticks', () => {
    const none = renderChart(mk([bars<Row>(a)], { yMinor: 1 }), measure)
    expect(none).toEqual(renderChart(mk([bars<Row>(a)]), measure))
    const log = renderChart(mk([bars<Row>(a)], { yScale: 'log', yMinor: 5 }), measure)
    expect(log).toEqual(renderChart(mk([bars<Row>(a)], { yScale: 'log' }), measure))
  })
  it('composes with a reversed axis: the minors reflect with the ticks', () => {
    const plain = renderChart(mk([bars<Row>(a)], { yMinor: 3 }), measure).filter((c) => c.kind === 'line' && c.width === 0.5) as { from: { y: number } }[]
    const inv = renderChart(mk([bars<Row>(a)], { yMinor: 3, yInverse: true }), measure).filter((c) => c.kind === 'line' && c.width === 0.5) as { from: { y: number } }[]
    expect(inv.length).toBe(plain.length)
  })
})
