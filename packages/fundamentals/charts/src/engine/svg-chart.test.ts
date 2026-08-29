import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { bars, line } from './marks'
import { compact } from './format'

interface Row {
  month: string
  revenue: number
  target: number
}

const DATA: Row[] = [
  { month: 'Jan', revenue: 120, target: 100 },
  { month: 'Feb', revenue: 90, target: 100 },
  { month: 'Mar', revenue: 160, target: 110 },
]

const MARKS = [bars((d: Row) => d.revenue), line((d: Row) => d.target)]

describe('chartToSvg', () => {
  it('renders from data with no DOM, no canvas and no measurement context', () => {
    const svg = chartToSvg({ data: DATA, marks: MARKS, x: (d) => d.month })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('<rect')
    expect(svg).toContain('<polyline')
    expect(svg).toContain('Jan')
    expect(svg).not.toContain('NaN')
  })

  it('has no accessible name unless one is given', () => {
    // A generic default ("Chart") is worse than none — it looks labelled while
    // saying nothing, and a screen reader then has no reason to flag it.
    const svg = chartToSvg({ data: DATA, marks: MARKS })
    expect(svg).not.toContain('<title')
    expect(svg).not.toContain('<desc')
  })

  it('derives a description from the data when only a title is given', () => {
    const svg = chartToSvg({ data: DATA, marks: MARKS, x: (d) => d.month, title: 'Revenue' })
    expect(svg).toContain('<title id="pyreon-chart-title">Revenue</title>')
    expect(svg).toContain('<desc')
    // Derived, not boilerplate: the numbers are in it.
    expect(svg).toMatch(/<desc[^>]*>[^<]*160/)
  })

  it('takes an explicit description over the derived one', () => {
    const svg = chartToSvg({ data: DATA, marks: MARKS, title: 'R', description: 'Hand written' })
    expect(svg).toContain('Hand written')
    expect(svg).not.toMatch(/<desc[^>]*>[^<]*160/)
  })

  it('opts out of the derived description with an empty string', () => {
    const svg = chartToSvg({ data: DATA, marks: MARKS, title: 'R', description: '' })
    expect(svg).toContain('<title')
    expect(svg).not.toContain('<desc')
  })

  it('defaults to a fixed size and honours an override', () => {
    expect(chartToSvg({ data: DATA, marks: MARKS })).toContain('width="640" height="320"')
    expect(chartToSvg({ data: DATA, marks: MARKS, width: 300, height: 150 })).toContain(
      'width="300" height="150"',
    )
  })

  it('passes svg options through', () => {
    const svg = chartToSvg({ data: DATA, marks: MARKS, svg: { responsive: true, background: '#fff' } })
    expect(svg).toContain('width="100%"')
    expect(svg).toContain('fill="#fff"')
  })

  it('honours a pinned y domain', () => {
    const free = chartToSvg({ data: DATA, marks: MARKS })
    const pinned = chartToSvg({ data: DATA, marks: MARKS, yDomain: { min: 0, max: 1000 } })
    expect(pinned).not.toBe(free)
    expect(pinned).toContain('1000')
  })

  it('turns the chrome off', () => {
    const bare = chartToSvg({
      data: DATA,
      marks: MARKS,
      x: (d) => d.month,
      showXAxis: false,
      showYAxis: false,
      showGrid: false,
    })
    // No axis labels at all when both axes are off.
    expect(bare).not.toContain('Jan')
  })

  it('renders an empty dataset without throwing', () => {
    const svg = chartToSvg({ data: [] as Row[], marks: MARKS })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('NaN')
  })

  it('is deterministic — the same input gives byte-identical output', () => {
    // The property that makes an SVG snapshot a real assertion rather than a
    // flake, and that a canvas backend cannot offer at all.
    expect(chartToSvg({ data: DATA, marks: MARKS, x: (d) => d.month })).toBe(
      chartToSvg({ data: DATA, marks: MARKS, x: (d) => d.month }),
    )
  })
})

describe('chartToSvg — formatting', () => {
  const BIG: Row[] = [
    { month: 'Jan', revenue: 3200000, target: 3000000 },
    { month: 'Feb', revenue: 1800000, target: 3000000 },
  ]

  it('formats the axis labels', () => {
    const plainSvg = chartToSvg({ data: BIG, marks: MARKS })
    const compactSvg = chartToSvg({ data: BIG, marks: MARKS, format: compact })
    expect(plainSvg).toContain('3000000')
    expect(compactSvg).not.toContain('3000000')
    expect(compactSvg).toMatch(/>\d+(\.\d+)?M</)
  })

  it('uses the same formatter in the derived description', () => {
    // An axis reading "$3.2M" beside a description reading "3200000" is one
    // chart to a sighted reader and another to a screen-reader user.
    const svg = chartToSvg({ data: BIG, marks: MARKS, format: compact, title: 'Revenue' })
    expect(svg).toMatch(/<desc[^>]*>[^<]*M/)
    expect(svg).not.toMatch(/<desc[^>]*>[^<]*3200000/)
  })
})
