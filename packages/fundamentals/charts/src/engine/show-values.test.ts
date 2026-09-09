// `showValues` across every mark kind.
//
// It was documented as "draw each value above its bar" and honoured by bars
// and waterfall only. On line, area, points, stacked, grouped and stackedArea
// it was a silent no-op — which reads as "the option does not apply here" and
// was really "nobody wrote the branch". Labelling the points of a line is as
// ordinary a request as labelling bars.
//
// The test is TOTAL over the mark kinds rather than a list of the ones that
// happen to work, so a kind added later has to answer the question.

import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import * as marks from './marks'
import type { Mark } from './marks'

interface Row { m: string; v: number; w: number }
const ROWS: Row[] = [{ m: 'a', v: 3, w: 5 }, { m: 'b', v: 6, w: 2 }]
const SIZE = { width: 320, height: 180 }
const y = (d: Row): number => d.v
const y2 = (d: Row): number => d.w

/** Every kind, and how to build a chart of it — set-laid-out kinds need two series. */
const KINDS: Record<string, (o?: marks.MarkOptions) => Mark<Row>[]> = {
  bars: (o) => [marks.bars<Row>(y, o)],
  line: (o) => [marks.line<Row>(y, o)],
  area: (o) => [marks.area<Row>(y, o)],
  points: (o) => [marks.points<Row>(y, o)],
  waterfall: (o) => [marks.waterfall<Row>(y, o)],
  stackedBars: (o) => [marks.stackedBars<Row>(y, o), marks.stackedBars<Row>(y2, o)],
  groupedBars: (o) => [marks.groupedBars<Row>(y, o), marks.groupedBars<Row>(y2, o)],
  stackedArea: (o) => [marks.stackedArea<Row>(y, o), marks.stackedArea<Row>(y2, o)],
  band: (o) => [marks.band<Row>(y2, y, o)],
}

const draw = (mk: (o?: marks.MarkOptions) => Mark<Row>[], o?: marks.MarkOptions): string =>
  chartToSvg({ data: ROWS, x: (d) => d.m, marks: mk(o), ...SIZE })

describe('showValues', () => {
  it('every mark kind draws labels when asked', () => {
    const silent: string[] = []
    for (const [name, mk] of Object.entries(KINDS)) {
      if (draw(mk) === draw(mk, { showValues: true })) silent.push(name)
    }
    expect(silent, 'these kinds ignore `showValues` — the option is offered and does nothing').toEqual([])
  })

  it('covers every kind the Series union declares', () => {
    // Totality against the type, so a kind added later cannot skip the check
    // by simply not appearing in the table above.
    const declared = ['bars', 'line', 'area', 'points', 'stacked', 'grouped', 'waterfall', 'stackedArea', 'band']
    const tested = new Set(Object.values(KINDS).flatMap((mk) => mk().map((m) => m.kind)))
    // No exemptions. `band` carried one — "a region has no single value to
    // print" — and that was a rationale for a branch nobody had written: its
    // HIGH edge is a perfectly good single value, and labelling it is what
    // every other kind does.
    const missing = declared.filter((k) => !tested.has(k as never))
    expect(missing, 'a mark kind exists that this test never exercises').toEqual([])
  })

  it('prints the datum value, not the running total, for a stack', () => {
    // A stacked segment labelled with the cumulative figure would repeat what
    // the outline says and hide what the series contributed.
    //
    // The axis is turned OFF for this one: its ticks are numbers too, and
    // `8` is one of them here, so a bare "does the string appear" check
    // cannot tell a tick from a label. Removing the axis makes every number
    // in the output a value label.
    const svg = chartToSvg({
      data: ROWS,
      x: (d) => d.m,
      marks: KINDS.stackedBars!({ showValues: true }),
      showXAxis: false,
      showYAxis: false,
      showGrid: false,
      ...SIZE,
    })
    expect(svg).toContain('>3<')
    expect(svg).toContain('>5<')
    expect(svg, 'the running total must not be printed as a segment label').not.toContain('>8<')
  })

  it('a gap prints nothing', () => {
    const gapped: Row[] = [{ m: 'a', v: Number.NaN, w: 1 }, { m: 'b', v: 4, w: 1 }]
    const svg = chartToSvg({ data: gapped, x: (d) => d.m, marks: [marks.line<Row>(y, { showValues: true })], ...SIZE })
    expect(svg).not.toContain('NaN')
  })
})
