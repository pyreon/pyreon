// A band's accessible text must carry BOTH bounds.
//
// The description and the offscreen table are the whole chart for a reader who
// cannot see the fill. A band described by its high edge alone says "rising
// from 3 to 6" about a confidence interval and never says what it is an
// interval OF — the low edge is not a detail of the mark, it is half of it.
import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { chartTable, describeChart } from './a11y'
import { tooltipAt, tooltipLines } from './tooltip'
import { band, bars, bubble, line, resolveMarks } from './marks'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { PlotChart } from './Chart'

interface Row { m: string; lo: number; hi: number }
const ROWS: Row[] = [{ m: 'a', lo: 5, hi: 3 }, { m: 'b', lo: 2, hi: 6 }]

interface Bub { m: string; y: number; pop: number }
const BUBBLES: Bub[] = [{ m: 'a', y: 3, pop: 12 }, { m: 'b', y: 6, pop: 40 }]

describe('a band is accessible as an interval', () => {
  it('the description states both bounds', () => {
    const svg = chartToSvg({
      data: ROWS,
      x: (d) => d.m,
      marks: [band<Row>((d) => d.lo, (d) => d.hi)],
      title: 'Forecast',
      width: 320,
      height: 180,
    })
    const desc = (svg.match(/<desc[^>]*>([^<]*)</) ?? [])[1] ?? ''
    expect(desc).toContain('upper bound')
    expect(desc).toContain('lower bound')
    // The low edge's own span, which the high-edge-only sentence omitted.
    expect(desc).toMatch(/lower bound ranging 2 to 5/)
  })

  it('the table gives a band two columns and a one-channel series one', () => {
    const t = chartTable({
      categories: ['a', 'b'],
      series: [
        { label: 'Range', kind: 'band', values: [3, 6], values2: [5, 2] },
        { label: 'Actual', kind: 'line', values: [4, 5] },
      ],
    })
    expect(t.headers).toEqual(['Category', 'Range (upper)', 'Range (lower)', 'Actual'])
    expect(t.rows).toEqual([
      ['a', '3', '5', '4'],
      ['b', '6', '2', '5'],
    ])
  })

  it('a one-channel chart is described exactly as before', () => {
    // The two-channel branch must not change the sentence every other kind
    // produces — this is the half a regression would land on silently.
    const d = describeChart({
      title: 'T',
      categories: ['a', 'b'],
      series: [{ label: 'S', kind: 'line', values: [3, 6] }],
    })
    expect(d).toBe('T. 1 series over 2 categories from a to b. S, line: rising from 3 to 6, ranging 3 at a to 6 at b.')
  })

  it('a band whose low channel is empty falls back to the one-channel sentence', () => {
    const d = describeChart({
      title: 'T',
      categories: ['a', 'b'],
      series: [{ label: 'S', kind: 'band', values: [3, 6], values2: [] }],
    })
    expect(d).toContain('S, band: rising from 3 to 6')
    expect(d).not.toContain('lower bound')
  })

  it('a band beside a one-channel series keeps both sentences', () => {
    const svg = chartToSvg({
      data: ROWS,
      x: (d) => d.m,
      marks: [band<Row>((d) => d.lo, (d) => d.hi), line<Row>((d) => d.hi)],
      title: 'Forecast',
      width: 320,
      height: 180,
    })
    const desc = (svg.match(/<desc[^>]*>([^<]*)</) ?? [])[1] ?? ''
    expect(desc).toContain('lower bound')
    // The line series keeps the plain sentence in the same paragraph.
    expect(desc).toMatch(/Series 2, line: /)
  })
})

describe('error bars reach the numbers table', () => {
  // A whisker is a bound ON a value, so it reads as a parenthesis rather than
  // as extra columns — a band is the opposite case and gets two columns.
  // Either way the table's whole purpose is the numbers, and it was omitting
  // ones a sighted reader can see drawn.
  it('a whiskered datum carries its bounds in the cell', () => {
    const t = chartTable({
      categories: ['a', 'b'],
      series: [{ label: 'S', kind: 'bars', values: [3, 6], errLow: [2, 5], errHigh: [4, 7] }],
    })
    expect(t.headers).toEqual(['Category', 'S'])
    expect(t.rows).toEqual([['a', '3 (2 to 4)'], ['b', '6 (5 to 7)']])
  })

  it('a series with no whiskers is unchanged, and a partial one degrades per datum', () => {
    const t = chartTable({
      categories: ['a', 'b'],
      series: [
        { label: 'Plain', kind: 'bars', values: [1, 2] },
        // Shorter bound arrays: the datum past the end keeps the bare number
        // rather than reading a bound that is not there.
        { label: 'Partial', kind: 'bars', values: [1, 2], errLow: [0], errHigh: [3] },
      ],
    })
    expect(t.rows).toEqual([['a', '1', '1 (0 to 3)'], ['b', '2', '2']])
  })

  it('<PlotChart> forwards the whiskers too', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(
      h(PlotChart<Row>, {
        data: ROWS,
        x: (d: Row) => d.m,
        marks: [bars<Row>((d: Row) => d.hi, { errorLow: (d: Row) => d.lo, errorHigh: (d: Row) => d.hi + 1 })],
        title: 'M',
        width: 320,
        height: 180,
      }),
      el,
    )
    const cells = [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td, th')].map((c) => c.textContent))
    expect(cells).toEqual([['a', '3 (5 to 4)'], ['b', '6 (2 to 7)']])
    el.remove()
  })
})

describe('the LIVE chart, not just the SVG helper', () => {
  it('a mounted <PlotChart> hands the tooltip a band row with both bounds', () => {
    // `Chart.tsx` passes the frame's own `Series[]` to `tooltipAt`, so the
    // field rides along structurally rather than through a mapping — which
    // is exactly the difference from the a11y path, where a field-by-field
    // map dropped it. Asserted so a future refactor to a mapping is caught.
    const series = resolveMarks(ROWS, [band<Row>((d: Row) => d.lo, (d: Row) => d.hi)])
    const c = tooltipAt(0, ['a', 'b'], series)
    expect(c.rows[0]!.value2).toBe(5)
  })

  // `Chart.tsx` builds its a11y input field by field, and that mapping is
  // exactly where `values2` went missing — a spec that renders through
  // `chartToSvg` twice proves nothing about it, which the first version of
  // this file did while claiming otherwise.
  it('<PlotChart> gives a band two columns in its offscreen table', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(
      h(PlotChart<Row>, {
        data: ROWS,
        x: (d: Row) => d.m,
        marks: [band<Row>((d: Row) => d.lo, (d: Row) => d.hi)],
        title: 'Forecast',
        width: 320,
        height: 180,
      }),
      el,
    )
    const headers = [...el.querySelectorAll('th')].map((th) => th.textContent)
    expect(headers).toContain('Series 1 (upper)')
    expect(headers).toContain('Series 1 (lower)')
    const cells = [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td, th')].map((c) => c.textContent))
    expect(cells).toEqual([['a', '3', '5'], ['b', '6', '2']])
    el.remove()
  })
})

describe('the tooltip reads a band as an interval', () => {
  // Third consumer of the same field. `values2` was added to `Series`, and
  // every downstream shape that projects a Series into its OWN narrower type
  // dropped it silently: the value labels, the accessible description and
  // table, and this. A row carrying only the high edge reports one number for
  // a mark whose whole meaning is the pair.
  it('a two-channel row carries both bounds, and prints low to high', () => {
    const c = tooltipAt(1, ['a', 'b'], [
      { label: 'Range', values: [3, 6], values2: [5, 2], color: '#111' },
      { label: 'Actual', values: [4, 5], color: '#222' },
    ])
    expect(c.rows[0]!.value).toBe(6)
    expect(c.rows[0]!.value2).toBe(2)
    expect(c.rows[1]!.value2).toBeUndefined()
    expect(tooltipLines(c)).toEqual(['b', 'Range: 2 to 6', 'Actual: 5'])
  })

  it('a gap in the second channel degrades to the one-number row', () => {
    const c = tooltipAt(0, ['a'], [{ label: 'R', values: [3], values2: [Number.NaN], color: '#111' }])
    expect(c.rows[0]!.value2).toBeUndefined()
    expect(tooltipLines(c)).toEqual(['a', 'R: 3'])
  })

  it('a shorter second channel does not read past its end', () => {
    const c = tooltipAt(1, ['a', 'b'], [{ label: 'R', values: [3, 6], values2: [5], color: '#111' }])
    expect(c.rows[0]!.value2).toBeUndefined()
    expect(tooltipLines(c)).toEqual(['b', 'R: 6'])
  })
})

describe("a bubble's size channel is data, not just a radius", () => {
  // Fourth instance of the same class, and the one that hid best: `Series`
  // DID carry the channel — as `radii`, already mapped to pixels. So the
  // tooltip and the table were not omitting a field they had, they were
  // holding a measurement of the DRAWING where the reader needs the datum.
  // `rValues` keeps the raw numbers beside the pixels.
  it('the tooltip names the size, and the table gives it a column', () => {
    const series = resolveMarks(BUBBLES, [bubble<Bub>((d: Bub) => d.y, (d: Bub) => d.pop)])
    expect(series[0]!.rValues).toEqual([12, 40])
    // The radii are pixels and are NOT what gets reported.
    expect(series[0]!.radii![0]).not.toBe(12)

    const c = tooltipAt(1, ['a', 'b'], series)
    expect(c.rows[0]!.size).toBe(40)
    expect(tooltipLines(c)).toEqual(['b', 'Series 1: 6 (size 40)'])

    const t = chartTable({ categories: ['a', 'b'], series })
    expect(t.headers).toEqual(['Category', 'Series 1', 'Series 1 (size)'])
    expect(t.rows).toEqual([['a', '3', '12'], ['b', '6', '40']])
  })

  it('a series with no size channel is unchanged', () => {
    const series = resolveMarks(BUBBLES, [line<Bub>((d: Bub) => d.y)])
    const t = chartTable({ categories: ['a', 'b'], series })
    expect(t.headers).toEqual(['Category', 'Series 1'])
    expect(tooltipLines(tooltipAt(0, ['a', 'b'], series))).toEqual(['a', 'Series 1: 3'])
  })
})
