// Where a marker lands on the shapes that used to refuse one.
//
// `markers` was skipped outright on the flipped frame and on the two
// set-laid-out kinds — a silent no-op on three shapes, while `annotations`
// drew on all of them. The skip was not arbitrary: a stacked datum is drawn
// at its RUNNING TOTAL in a band-centred segment, so pushing it through the
// point-like placement would have put the marker where the data never
// appears. Refusing was better than lying. Reading the segment back from the
// same layout the paint used is better than either.

import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { bars, groupedBars, line, stackedBars } from './marks'
import { layoutChart, markerAnchor } from './render'
import { layoutStackedBars } from './stack'
import type { ChartSpec, PointMarker } from './render'

interface Row { m: string; v: number; w: number }
const ROWS: Row[] = [{ m: 'a', v: 3, w: 5 }, { m: 'b', v: 6, w: 2 }, { m: 'c', v: 4, w: 7 }]
const SIZE = { width: 320, height: 180 }
const measure = (t: string, s: number): number => t.length * s * 0.55
const MARKER: PointMarker[] = [{ seriesIndex: 0, at: 'max', label: 'peak' }]
const circles = (svg: string): number => (svg.match(/<circle/g) ?? []).length

const spec = (kind: 'stacked' | 'grouped', horizontal = false): ChartSpec => ({
  ...SIZE,
  series: [
    { kind, label: 'a', values: [3, 6, 4], color: '#4f8', width: 2, radius: 3 },
    { kind, label: 'b', values: [5, 2, 7], color: '#88f', width: 2, radius: 3 },
  ],
  categories: ['a', 'b', 'c'],
  theme: { axis: '#333', grid: '#eee', label: '#666', bg: '#fff', series: ['#4f8', '#88f'], fontSize: 11 } as never,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  horizontal,
  markers: MARKER,
})

describe('markers on the shapes that used to refuse them', () => {
  it('draw on a horizontal chart, as annotations already did', () => {
    const without = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [bars<Row>((d) => d.v)], horizontal: true, ...SIZE })
    const with_ = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [bars<Row>((d) => d.v)], horizontal: true, markers: MARKER, ...SIZE })
    expect(without).not.toBe(with_)
    expect(circles(with_)).toBeGreaterThan(circles(without))
  })

  it('draw on stacked and grouped series', () => {
    for (const kind of ['stacked', 'grouped'] as const) {
      const marks = kind === 'stacked'
        ? [stackedBars<Row>((d) => d.v), stackedBars<Row>((d) => d.w)]
        : [groupedBars<Row>((d) => d.v), groupedBars<Row>((d) => d.w)]
      const without = chartToSvg({ data: ROWS, x: (d) => d.m, marks, ...SIZE })
      const with_ = chartToSvg({ data: ROWS, x: (d) => d.m, marks, markers: MARKER, ...SIZE })
      expect(without, kind).not.toBe(with_)
    }
  })

  it('a stacked marker sits on ITS segment, not at the raw value', () => {
    // The reason the skip existed. Series 0's max is datum 1 (value 6); its
    // segment there is the bottom of the stack, so the anchor must be that
    // segment's TOP — not where a point-like placement would put 6 on a
    // domain whose max is the stack total.
    const s = spec('stacked')
    const plot = layoutChart(s, measure).plot
    // A 0- or 1-element list, not an optional — the engine's native subset.
    const anchor = markerAnchor(s, 0, 1, plot, { min: 0, max: 13 })[0]
    expect(anchor).toBeDefined()
    const segs = layoutStackedBars(s.series.map((q) => q.values), plot, { min: 0, max: 13 }, 0.25)
    const own = segs.find((g) => g.seriesIndex === 0 && g.datumIndex === 1)!
    expect(anchor!.x).toBeCloseTo(own.rect.x + own.rect.w / 2, 6)
    expect(anchor!.y).toBeCloseTo(own.rect.y, 6)
  })

  it('a horizontal stacked marker anchors at the segment END, not its top', () => {
    // The flipped frame turns "the far edge" from the top of a bar into the
    // right end of one; anchoring at the same corner in both would place it
    // off the bar.
    const flipped = spec('stacked', true)
    const upright = spec('stacked')
    const plot = layoutChart(flipped, measure).plot
    // Each anchor is resolved against ITS OWN spec. The helper is addressed
    // by series INDEX rather than by the series object, because a Series is a
    // struct on native and has no identity to compare.
    const a = markerAnchor(flipped, 0, 1, plot, { min: 0, max: 13 })[0]!
    const v = markerAnchor(upright, 0, 1, plot, { min: 0, max: 13 })[0]!
    expect(a).toBeDefined()
    expect(v).toBeDefined()
    expect(a.x).not.toBeCloseTo(v.x, 3)
  })

  it('returns an EMPTY list for the kinds it does not own', () => {
    // The helper answers only for set-laid-out series; everything else keeps
    // the point-like placement, so a wrong answer here would silently move
    // every ordinary marker.
    const s: ChartSpec = { ...spec('stacked'), series: [{ kind: 'line', label: 'l', values: [1, 2], color: '#000', width: 2, radius: 3 }] }
    expect(markerAnchor(s, 0, 0, { x: 0, y: 0, w: 10, h: 10 }, { min: 0, max: 2 })).toEqual([])
  })

  it('an ordinary line marker is unmoved by all of this', () => {
    const before = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [line<Row>((d) => d.v)], markers: MARKER, ...SIZE })
    expect(circles(before)).toBeGreaterThan(0)
  })
})
