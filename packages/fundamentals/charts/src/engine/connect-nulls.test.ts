import { describe, expect, it } from 'vitest'
import { chartTable } from './a11y'
import { area, line, resolveMarks } from './marks'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec } from './render'
import { tooltipAt } from './tooltip'
import type { DrawCmd } from './types'

const measure = (t: string, s: number): number => t.length * s * 0.6
const CATS = ['a', 'b', 'c', 'd', 'e', 'f']

const spec = (values: number[], opts: { connectNulls?: boolean; kind?: 'line' | 'area' } = {}): ChartSpec => {
  const mark = opts.kind === 'area' ? area : line
  const rows = values.map((v) => ({ v }))
  const series = resolveMarks(rows, [mark((d: { v: number }) => d.v, opts.connectNulls === undefined ? {} : { connectNulls: opts.connectNulls })])

  return { width: 400, height: 200, series, categories: CATS, theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true }
}

const strokes = (cmds: DrawCmd[]): { x: number; y: number }[][] => cmds.flatMap((c) => (c.kind === 'polyline' && c.width === 2 ? [c.points] : []))
const GAPPY = [1, 3, Number.NaN, Number.NaN, 4, 2]

describe('connectNulls on a line', () => {
  it('default: a gap breaks the line into runs', () => {
    expect(strokes(renderChart(spec(GAPPY), measure)).map((r) => r.length)).toEqual([2, 2])
  })
  it('on: one stroke through the finite points, gap skipped', () => {
    const s = strokes(renderChart(spec(GAPPY, { connectNulls: true }), measure))
    expect(s.map((r) => r.length)).toEqual([4])
  })
  it('explicit false equals the default, byte for byte', () => {
    expect(renderChart(spec(GAPPY, { connectNulls: false }), measure)).toEqual(renderChart(spec(GAPPY), measure))
  })
  it('a series with no gap draws identically with the option on or off', () => {
    const full = [1, 2, 3, 4, 5, 6]
    expect(renderChart(spec(full, { connectNulls: true }), measure)).toEqual(renderChart(spec(full), measure))
  })
  // Property: bridging never moves a point and never invents one. The bridged
  // stroke has exactly one point per finite datum, in order, and every point of
  // the unbridged runs is in it unchanged. (A run of a single point draws no
  // stroke of its own, so the bridge is what first shows it.)
  it('property: bridged = one point per finite datum; unbridged points are untouched (random gap patterns)', () => {
    let seed = 7
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let t = 0; t < 80; t++) {
      const vals = CATS.map(() => (rnd() < 0.35 ? Number.NaN : Math.round(rnd() * 20)))
      const finite = vals.filter((v) => Number.isFinite(v)).length
      if (finite < 2) continue
      const bridged = strokes(renderChart(spec(vals, { connectNulls: true }), measure))
      expect(bridged).toHaveLength(1)
      expect(bridged[0]).toHaveLength(finite)
      const xs = bridged[0]!.map((p) => p.x)
      expect([...xs].sort((a, b) => a - b)).toEqual(xs)
      const at = new Set(bridged[0]!.map((p) => `${p.x},${p.y}`))
      for (const p of strokes(renderChart(spec(vals), measure)).flat()) expect(at.has(`${p.x},${p.y}`)).toBe(true)
    }
  })
  it('the gap is still missing data: no tooltip row, empty table cell', () => {
    const s = spec(GAPPY, { connectNulls: true })
    expect(tooltipAt(2, CATS, s.series).rows).toEqual([])
    expect(chartTable({ categories: CATS, series: s.series }).rows[2]).toEqual(['c', ''])
  })
})

describe('connectNulls on an area', () => {
  it('default fills two separate regions; on, one region across the gap', () => {
    const polys = (cmds: DrawCmd[]): number => cmds.filter((c) => c.kind === 'polygon').length
    expect(polys(renderChart(spec(GAPPY, { kind: 'area' }), measure))).toBe(2)
    expect(polys(renderChart(spec(GAPPY, { kind: 'area', connectNulls: true }), measure))).toBe(1)
  })
})
