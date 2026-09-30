// The keyed geometry morph: survivors slide between slots, entering bars
// grow from the baseline in their new slot, exiting bars shrink out in their
// old one — the full data join, not just a value tween.
import { describe, expect, it } from 'vitest'
import { canKeyMorph, keyedGeometry, keyedMorphCmds, maskForMorph } from './keyed-morph'
import { defaultTheme, layoutChart } from './render'
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

  it('only plain vertical single-axis bar / line charts morph; the mask keeps the domain', () => {
    expect(canKeyMorph(newSpec)).toBe(true)
    expect(canKeyMorph({ ...newSpec, horizontal: true })).toBe(false)
    expect(canKeyMorph({ ...newSpec, series: [{ ...bars([1]), kind: 'stacked' }] })).toBe(false)
    const masked = maskForMorph(specOf([2, 3, 10], ['b', 'c', 'd'], { yDomain: undefined }))
    expect(masked.yDomain).toBeDefined()
    expect(masked.series[0]!.values.every((v) => Number.isNaN(v))).toBe(true)
  })
})
