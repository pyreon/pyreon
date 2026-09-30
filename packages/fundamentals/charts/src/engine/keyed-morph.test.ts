// The keyed geometry morph: survivors slide between slots, entering bars
// grow from the baseline in their new slot, exiting bars shrink out in their
// old one — the full data join, not just a value tween.
import { describe, expect, it } from 'vitest'
import { canKeyMorph, keyedGeometry, keyedMorphCmds, maskForMorph, morphMatches } from './keyed-morph'
import { defaultTheme, layoutChart, renderChartIn } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, Rect } from './types'

const measure = (t: string, s: number): number => t.length * s * 0.6
const bars = (values: number[]): Series => ({ kind: 'bars', values, color: '#2060ff', label: 'v', width: 2, radius: 3 })
const specOf = (values: number[], cats: string[], extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 300, height: 200, series: [bars(values)], categories: cats, theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: false, yDomain: { min: 0, max: 10 }, ...extra,
})
const rects = (cmds: DrawCmd[]): Rect[] => cmds.filter((c) => c.kind === 'rect').map((c) => (c as { rect: Rect }).rect)

describe('keyed geometry morph', () => {
  // Old rows a, b, c → new rows b, c, d (a sliding window).
  const oldSpec = specOf([1, 2, 3], ['a', 'b', 'c'])
  const newSpec = specOf([2, 3, 10], ['b', 'c', 'd'])
  const from = keyedGeometry(oldSpec, layoutChart(oldSpec, measure), ['a', 'b', 'c'])
  const to = keyedGeometry(newSpec, layoutChart(newSpec, measure), ['b', 'c', 'd'])

  it('at 0 it is the OLD frame (plus the entering bar flat on the baseline)', () => {
    const r = rects(keyedMorphCmds(from, to, 0))
    const oldR = [...from[0]!.rects.values()]
    // exiting a, then b, c at their OLD slots, then d flat.
    expect(r[0]).toEqual(oldR[0])
    expect(r[1]).toEqual(oldR[1])
    expect(r[2]).toEqual(oldR[2])
    expect(r[3]!.h).toBe(0)
  })

  it('at 1 it is the NEW frame, with the exiting bar collapsed', () => {
    const r = rects(keyedMorphCmds(from, to, 1))
    expect(r[0]!.h).toBe(0)
    expect(r.slice(1)).toEqual([...to[0]!.rects.values()])
  })

  it('half way, a survivor is between its two slots and the exiting bar is shrinking', () => {
    const r = rects(keyedMorphCmds(from, to, 0.5))
    const bOld = from[0]!.rects.get('b')!
    const bNew = to[0]!.rects.get('b')!
    expect(r[1]!.x).toBeCloseTo((bOld.x + bNew.x) / 2, 6)
    expect(r[0]!.h).toBeCloseTo(from[0]!.rects.get('a')!.h / 2, 6)
    expect(r[3]!.h).toBeCloseTo(to[0]!.rects.get('d')!.h / 2, 6)
  })

  it('bars, lines, stacks and groups morph in any frame; areas, bands, symbols and numeric x do not', () => {
    expect(canKeyMorph(newSpec)).toBe(true)
    expect(canKeyMorph({ ...newSpec, horizontal: true })).toBe(true)
    expect(canKeyMorph({ ...newSpec, yScale: 'log' })).toBe(true)
    expect(canKeyMorph({ ...newSpec, series: [{ ...bars([1]), kind: 'stacked' }, { ...bars([2]), kind: 'grouped' }] })).toBe(true)
    expect(canKeyMorph({ ...newSpec, series: [{ ...bars([1]), kind: 'area' }] })).toBe(false)
    expect(canKeyMorph({ ...newSpec, series: [{ ...bars([1]), kind: 'waterfall' }] })).toBe(false)
    expect(canKeyMorph({ ...newSpec, series: [{ ...bars([1]), symbol: 'circle' }] })).toBe(false)
    expect(canKeyMorph({ ...newSpec, xValues: [1, 2, 3] })).toBe(false)
    const masked = maskForMorph(specOf([2, 3, 10], ['b', 'c', 'd'], { yDomain: undefined }))
    expect(masked.yDomain).toBeDefined()
    expect(masked.series[0]!.values.every((v) => Number.isNaN(v))).toBe(true)
  })

})

// The morph must END exactly where the renderer draws: every layout below is
// morphed from itself, and at e = 1 its bar commands must equal
// `renderChartIn`'s — same rects, fills, corners, gradients and patterns.
describe('keyed morph uses the renderer\'s own geometry in every frame', () => {
  const stacked = (values: number[], color: string): Series => ({ kind: 'stacked', values, color, label: color, width: 2, radius: 3 })
  const grouped = (values: number[], color: string): Series => ({ kind: 'grouped', values, color, label: color, width: 2, radius: 3 })
  const cats = ['a', 'b', 'c']
  const base = (series: Series[], extra: Partial<ChartSpec> = {}): ChartSpec => ({
    width: 300, height: 200, series, categories: cats, theme: defaultTheme, showXAxis: false, showYAxis: false, showGrid: false, ...extra,
  })
  const key = (c: DrawCmd): string => JSON.stringify(c)
  const rectCmds = (cmds: DrawCmd[]): string[] => cmds.filter((c) => c.kind === 'rect').map(key).sort()
  const cases: [string, ChartSpec][] = [
    ['vertical bars', base([bars([1, -2, 3])])],
    ['horizontal bars', base([bars([1, -2, 3])], { horizontal: true })],
    ['stacked', base([stacked([1, 2, 3], '#a00'), stacked([2, -1, 1], '#0a0')])],
    ['stacked, horizontal', base([stacked([1, 2, 3], '#a00'), stacked([2, 1, 1], '#0a0')], { horizontal: true })],
    ['normalized stack', base([stacked([1, 2, 3], '#a00'), stacked([2, 1, 1], '#0a0')], { stackNormalize: true })],
    ['grouped', base([grouped([1, 2, 3], '#a00'), grouped([2, 5, 1], '#0a0')])],
    ['grouped, horizontal', base([grouped([1, 2, 3], '#a00'), grouped([2, 5, 1], '#0a0')], { horizontal: true })],
    ['log scale', base([bars([1, 100, 1000])], { yScale: 'log' })],
    ['dual axis', base([bars([1, 2, 3]), { ...bars([100, 400, 900]), color: '#0a0', axis: 'right' }])],
    ['themed corners', base([bars([1, 2, 3])], { theme: { ...defaultTheme, radius: 4 } })],
  ]
  for (const [name, spec] of cases) {
    it(name + ': the morph at 1 is the rendered frame', () => {
      const l = layoutChart(spec, measure)
      const geo = keyedGeometry(spec, l, cats)
      const morphed = rectCmds(keyedMorphCmds(geo, geo, 1))
      expect(morphed.length).toBeGreaterThan(0)
      expect(morphed).toEqual(rectCmds(renderChartIn(spec, measure, l)))
    })
  }

  it('the mask leaves every non-series command (grid, axes, rules) exactly where the frame puts it', () => {
    for (const [, spec] of cases) {
      const withChrome: ChartSpec = { ...spec, showGrid: true, showXAxis: true, showYAxis: true, annotations: [{ y: 2, label: 'goal' }] }
      const l = layoutChart(withChrome, measure)
      const chrome = (cmds: DrawCmd[]): string[] => cmds.filter((c) => c.kind === 'line' || c.kind === 'text').map(key)
      expect(chrome(renderChartIn(maskForMorph(withChrome), measure, l))).toEqual(chrome(renderChartIn(withChrome, measure, l)))
    }
  })

  it('a stacked segment enters from its own base, not from the axis', () => {
    const spec = base([stacked([1, 2, 3], '#a00'), stacked([2, 1, 1], '#0a0')])
    const l = layoutChart(spec, measure)
    const to = keyedGeometry(spec, l, cats)
    const from = keyedGeometry(spec, l, ['a', 'b'])
    // `c` enters; at 0 its upper segment is a zero-height rect ON TOP of its lower one.
    const lowerC = to[0]!.rects.get('c')!
    const enteringUpper = keyedMorphCmds(from, to, 0).filter((c) => c.kind === 'rect' && (c as { fill: string }).fill === '#0a0').map((c) => (c as { rect: Rect }).rect)
    const flatUpper = enteringUpper.find((r) => r.h === 0 && Math.abs(r.x - lowerC.x) < 0.5)!
    expect(flatUpper.y).toBeCloseTo(lowerC.y, 5)
  })

  it('a horizontal bar grows along x from the zero line', () => {
    const spec = base([bars([1, 2, 3])], { horizontal: true })
    const l = layoutChart(spec, measure)
    const from = keyedGeometry(spec, l, ['a', 'b'])
    const to = keyedGeometry(spec, l, cats)
    const c = rects(keyedMorphCmds(from, to, 0)).find((r) => r.w === 0)!
    expect(c.h).toBeGreaterThan(0)
    expect(c.x).toBeCloseTo(to[0]!.baseline, 5)
  })

  it('a frame whose series kinds or orientation changed does not morph', () => {
    const spec = base([bars([1, 2, 3])])
    const geo = keyedGeometry(spec, layoutChart(spec, measure), cats)
    expect(morphMatches(geo, spec)).toBe(true)
    expect(morphMatches(geo, { ...spec, horizontal: true })).toBe(false)
    expect(morphMatches(geo, { ...spec, series: [{ ...bars([1, 2, 3]), kind: 'line' }] })).toBe(false)
    expect(morphMatches(geo, { ...spec, series: [bars([1]), bars([2])] })).toBe(false)
  })

  it('a gapped line breaks at the gap mid-morph instead of bridging it', () => {
    const line = (values: number[]): Series => ({ kind: 'line', values, color: '#0a0', label: 'l', width: 2, radius: 3 })
    const four = ['a', 'b', 'c', 'd']
    const from = base([line([1, 2, 3, 4])], { categories: four })
    const to = base([line([2, 1, Number.NaN, 3])], { categories: four })
    const polys = keyedMorphCmds(keyedGeometry(from, layoutChart(from, measure), four), keyedGeometry(to, layoutChart(to, measure), four), 0.5).filter((c) => c.kind === 'polyline')
    expect(polys).toHaveLength(1)
    expect((polys[0] as { points: unknown[] }).points).toHaveLength(2)
  })
})

