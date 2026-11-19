import { describe, expect, it } from 'vitest'
import { bars, line, resolveMarks } from './marks'
import { defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec } from './render'
import { chartToSvg } from './svg-chart'
import type { DrawCmd } from './types'

const measure = (t: string, s: number): number => t.length * s * 0.6
interface Row { x: number; v: number }
const ROWS: Row[] = [{ x: 1, v: 5 }, { x: 4, v: 9 }, { x: 10, v: 2 }, { x: 11, v: 7 }]
const numeric = (extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 360, height: 220, series: resolveMarks(ROWS, [line<Row>((d) => d.v)]), categories: [], theme: defaultTheme,
  showXAxis: true, showYAxis: true, showGrid: true, xValues: ROWS.map((r) => r.x), ...extra,
})
const pts = (cmds: DrawCmd[]): { x: number; y: number }[] => cmds.flatMap((c) => (c.kind === 'polyline' && c.width === 2 ? c.points : []))

describe('xInverse on a numeric x axis', () => {
  it('reflects every point about the plot midline and keeps y (the y axis does not move)', () => {
    const plain = renderChart(numeric(), measure)
    const inv = renderChart(numeric({ xInverse: true }), measure)
    const plot = layoutChart(numeric(), measure).plot
    const mid = plot.x + plot.w / 2
    const a = pts(plain)
    const b = pts(inv)
    expect(b.length).toBe(a.length)
    for (let i = 0; i < a.length; i++) {
      expect(b[i]!.x).toBeCloseTo(2 * mid - a[i]!.x, 6)
      expect(b[i]!.y).toBeCloseTo(a[i]!.y, 6)
    }
  })
  it('the tick labels run the other way, with the SAME plot rect', () => {
    const p = layoutChart(numeric(), measure)
    const i = layoutChart(numeric({ xInverse: true }), measure)
    expect(i.xTicks[0]!.pos).toBeGreaterThan(i.xTicks[i.xTicks.length - 1]!.pos)
    expect(p.xTicks[0]!.pos).toBeLessThan(p.xTicks[p.xTicks.length - 1]!.pos)
    expect(Math.abs(i.plot.w - p.plot.w)).toBeLessThan(6)
  })
  it('the y axis stays on the left: the y axis line is at the same x', () => {
    const axisX = (cmds: DrawCmd[]): number[] => cmds.flatMap((c) => (c.kind === 'line' && c.from.x === c.to.x && c.stroke === defaultTheme.axis ? [c.from.x] : []))
    expect(axisX(renderChart(numeric({ xInverse: true }), measure))[0]).toBeCloseTo(axisX(renderChart(numeric(), measure))[0]!, 0)
  })
  it('unset renders identically (byte-stable)', () => {
    expect(renderChart(numeric({ xInverse: false }), measure)).toEqual(renderChart(numeric(), measure))
  })
})

describe('xInverse on a category axis (static SVG)', () => {
  const data = [{ m: 'a', v: 3 }, { m: 'b', v: 9 }, { m: 'c', v: 5 }]
  const opts = { data, marks: [bars<{ m: string; v: number }>((d) => d.v)], x: (d: { m: string }) => d.m, width: 300, height: 200 }
  it('lays the categories out right to left, y axis unchanged', () => {
    const plain = chartToSvg(opts)
    const inv = chartToSvg({ ...opts, xInverse: true })
    expect(inv).not.toBe(plain)
    const order = (svg: string): string[] => [...svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="middle"[^>]*>([abc])</g)].sort((p, q) => Number(p[1]) - Number(q[1])).map((m) => m[2]!)
    expect(order(plain)).toEqual(['a', 'b', 'c'])
    expect(order(inv)).toEqual(['c', 'b', 'a'])
  })
  it('combined with rtl it reads left to right again (RTL mirrors the plot, inverse reverses the direction within it)', () => {
    const order = (svg: string): string[] => [...svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="middle"[^>]*>([abc])</g)].sort((p, q) => Number(p[1]) - Number(q[1])).map((m) => m[2]!)
    expect(order(chartToSvg({ ...opts, rtl: true }))).toEqual(['c', 'b', 'a'])
    expect(order(chartToSvg({ ...opts, rtl: true, xInverse: true }))).toEqual(['a', 'b', 'c'])
  })
})
