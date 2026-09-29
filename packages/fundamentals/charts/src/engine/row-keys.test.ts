// `ChartSpec.rowKeys` tags the draw list for a keyed native morph: each bar
// command carries its row's key and the rect it grows from, and a line whose
// points are its rows one-to-one carries one key per point. Without
// `rowKeys` nothing changes — the web and every unkeyed chart draw
// byte-identically.
import { describe, expect, it } from 'vitest'
import { defaultTheme, growEdgeRect, layoutChart, renderChartIn, resolveYDomain } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, Rect } from './types'

const measure = (t: string, s: number): number => t.length * s * 0.6
const s = (kind: Series['kind'], values: number[], color = '#2060ff'): Series => ({ kind, values, color, label: color, width: 2, radius: 3 })
const spec = (series: Series[], extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 300, height: 200, series, categories: ['a', 'b', 'c'], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...extra,
})
type RectCmd = Extract<DrawCmd, { kind: 'rect' }>
const keyed = (cmds: DrawCmd[]): RectCmd[] => cmds.filter((c): c is RectCmd => c.kind === 'rect' && c.key !== undefined)
const draw = (sp: ChartSpec): DrawCmd[] => renderChartIn(sp, measure, layoutChart(sp, measure))

describe('ChartSpec.rowKeys tags the draw list', () => {
  const cases: [string, ChartSpec][] = [
    ['plain bars', spec([s('bars', [1, -2, 3])])],
    ['horizontal bars', spec([s('bars', [1, 2, 3])], { horizontal: true })],
    ['stacked', spec([s('stacked', [1, 2, 3]), s('stacked', [2, 1, 1], '#a00')])],
    ['grouped', spec([s('grouped', [1, 2, 3]), s('grouped', [2, 1, 1], '#a00')])],
    ['line', spec([s('line', [1, 2, 3])])],
  ]

  it('without rowKeys the draw list is byte-identical to before (no key, enter or pointKeys)', () => {
    for (const [, sp] of cases) {
      const json = JSON.stringify(draw(sp))
      expect(json).not.toContain('"key"')
      expect(json).not.toContain('"enter"')
      expect(json).not.toContain('"pointKeys"')
    }
  })

  it('with rowKeys the tags are the ONLY difference', () => {
    for (const [name, sp] of cases) {
      const strip = (c: DrawCmd): DrawCmd => {
        const { key: _k, enter: _e, pointKeys: _p, ...rest } = c as DrawCmd & { key?: string; enter?: Rect; pointKeys?: string[] }
        return rest as DrawCmd
      }
      expect(draw({ ...sp, rowKeys: ['a', 'b', 'c'] }).map(strip), name).toEqual(draw(sp))
    }
  })

  it('every plain bar carries its row key and the rect it grows from', () => {
    const sp = spec([s('bars', [1, -2, 3])], { rowKeys: ['a', 'b', 'c'] })
    const bars = keyed(draw(sp))
    expect(bars.map((c) => c.key)).toEqual(['a', 'b', 'c'])
    const l = layoutChart(sp, measure)
    for (const c of bars) expect(c.enter).toEqual(growEdgeRect(c.rect, resolveYDomain(sp), l.plot, false))
    // A positive bar grows from its foot, a negative one from its head — both on the zero line.
    expect(bars[0]!.enter!.y).toBeCloseTo(bars[0]!.rect.y + bars[0]!.rect.h, 6)
    expect(bars[1]!.enter!.y).toBeCloseTo(bars[1]!.rect.y, 6)
    expect(bars[0]!.enter!.y).toBeCloseTo(bars[1]!.enter!.y, 6)
  })

  it('a horizontal bar grows along x', () => {
    const bars = keyed(draw(spec([s('bars', [1, 2, 3])], { horizontal: true, rowKeys: ['a', 'b', 'c'] })))
    expect(bars).toHaveLength(3)
    for (const c of bars) {
      expect(c.enter!.w).toBe(0)
      expect(c.enter!.h).toBe(c.rect.h)
    }
  })

  it('a stacked row tags one command per series, in series order, each growing from its own base', () => {
    const bars = keyed(draw(spec([s('stacked', [1, 2, 3]), s('stacked', [2, 1, 1], '#a00')], { rowKeys: ['a', 'b', 'c'] })))
    const forB = bars.filter((c) => c.key === 'b')
    expect(forB.map((c) => c.fill)).toEqual(['#2060ff', '#a00'])
    // The upper segment grows from the lower segment's top.
    expect(forB[1]!.enter!.y).toBeCloseTo(forB[0]!.rect.y, 6)
  })

  it('a line tags one key per point only when its points are its rows one-to-one', () => {
    const lineOf = (sp: ChartSpec) => draw(sp).find((c): c is Extract<DrawCmd, { kind: 'polyline' }> => c.kind === 'polyline')!
    expect(lineOf(spec([s('line', [1, 2, 3])], { rowKeys: ['a', 'b', 'c'] })).pointKeys).toEqual(['a', 'b', 'c'])
    // A gap splits the line into runs: no row-to-point correspondence to key.
    expect(lineOf(spec([s('line', [1, Number.NaN, 3, 4])], { categories: ['a', 'b', 'c', 'd'], rowKeys: ['a', 'b', 'c', 'd'] })).pointKeys).toBeUndefined()
    // A curve adds points.
    expect(lineOf(spec([{ ...s('line', [1, 2, 3]), curve: (p) => [...p, p[p.length - 1]!] }], { rowKeys: ['a', 'b', 'c'] })).pointKeys).toBeUndefined()
  })

  it('keys cover only the rows rowKeys names', () => {
    const bars = keyed(draw(spec([s('bars', [1, 2, 3])], { rowKeys: ['a', 'b'] })))
    expect(bars.map((c) => c.key)).toEqual(['a', 'b'])
  })
})
