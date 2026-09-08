// A band's accessible text must carry BOTH bounds.
//
// The description and the offscreen table are the whole chart for a reader who
// cannot see the fill. A band described by its high edge alone says "rising
// from 3 to 6" about a confidence interval and never says what it is an
// interval OF — the low edge is not a detail of the mark, it is half of it.
import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { chartTable, describeChart } from './a11y'
import { band, line } from './marks'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { PlotChart } from './Chart'

interface Row { m: string; lo: number; hi: number }
const ROWS: Row[] = [{ m: 'a', lo: 5, hi: 3 }, { m: 'b', lo: 2, hi: 6 }]

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

describe('the LIVE chart, not just the SVG helper', () => {
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
