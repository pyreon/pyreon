import { describe, expect, it } from 'vitest'
import { area, bars, groupedBars, line, points, resolveCategories, resolveMarks, stackedBars } from './marks'

interface Row {
  month: string
  revenue: number
}

const DATA: Row[] = [
  { month: 'Jan', revenue: 100 },
  { month: 'Feb', revenue: 200 },
]

describe('marks', () => {
  it('each factory carries its own kind', () => {
    expect(bars<Row>((d) => d.revenue).kind).toBe('bars')
    expect(line<Row>((d) => d.revenue).kind).toBe('line')
    expect(area<Row>((d) => d.revenue).kind).toBe('area')
    expect(points<Row>((d) => d.revenue).kind).toBe('points')
  })

  it('resolves accessors against the data, in order', () => {
    const [s] = resolveMarks(DATA, [bars<Row>((d) => d.revenue)])
    expect(s!.values).toEqual([100, 200])
    expect(s!.kind).toBe('bars')
  })

  it('passes the index to the accessor', () => {
    const [s] = resolveMarks(DATA, [bars<Row>((_d, i) => i * 10)])
    expect(s!.values).toEqual([0, 10])
  })

  /**
   * A NaN in the domain makes every scale NaN, and the chart vanishes with
   * nothing to trace it by. Zero is visibly wrong at the right datum, which is
   * the better failure — and the reason this is a substitution, not a throw.
   */
  it('substitutes zero for a non-finite accessor result', () => {
    const [s] = resolveMarks(DATA, [bars<Row>(() => Number.NaN)])
    expect(s!.values).toEqual([0, 0])
    const [inf] = resolveMarks(DATA, [bars<Row>(() => Number.POSITIVE_INFINITY)])
    expect(inf!.values).toEqual([0, 0])
  })

  it('applies option defaults and overrides', () => {
    const [d] = resolveMarks(DATA, [line<Row>((x) => x.revenue)])
    expect(d!.width).toBe(2)
    expect(d!.radius).toBe(3)
    expect(d!.color).toBe('#0f766e')

    const [o] = resolveMarks(DATA, [
      line<Row>((x) => x.revenue, { color: '#b45309', width: 4, radius: 6 }),
    ])
    expect(o!.color).toBe('#b45309')
    expect(o!.width).toBe(4)
    expect(o!.radius).toBe(6)
  })

  it('resolves several marks into several series', () => {
    const out = resolveMarks(DATA, [bars<Row>((d) => d.revenue), line<Row>((d) => d.revenue * 2)])
    expect(out).toHaveLength(2)
    expect(out[1]!.values).toEqual([200, 400])
  })

  it('handles empty data', () => {
    expect(resolveMarks([], [bars<Row>((d) => d.revenue)])[0]!.values).toEqual([])
    expect(resolveMarks(DATA, [])).toEqual([])
  })

  it('resolves categories, and none without an accessor', () => {
    expect(resolveCategories(DATA, (d) => d.month)).toEqual(['Jan', 'Feb'])
    expect(resolveCategories(DATA)).toEqual([])
  })
})

describe('stacked and grouped marks', () => {
  it('carry their own kinds', () => {
    expect(stackedBars<Row>((d) => d.revenue).kind).toBe('stacked')
    expect(groupedBars<Row>((d) => d.revenue).kind).toBe('grouped')
  })

  /**
   * A single default colour would render a two-series chart in one colour,
   * which reads as ONE series. The palette is indexed by position.
   */
  it('gives each series a distinct default colour', () => {
    const out = resolveMarks(DATA, [
      bars<Row>((d) => d.revenue),
      line<Row>((d) => d.revenue),
      area<Row>((d) => d.revenue),
    ])
    expect(new Set(out.map((s) => s.color)).size).toBe(3)
  })

  it('lets an explicit colour win over the palette', () => {
    const [s] = resolveMarks(DATA, [bars<Row>((d) => d.revenue, { color: '#123456' })])
    expect(s!.color).toBe('#123456')
  })

  it('labels a series, defaulting to its position', () => {
    const out = resolveMarks(DATA, [
      bars<Row>((d) => d.revenue, { label: 'Revenue' }),
      line<Row>((d) => d.revenue),
    ])
    expect(out[0]!.label).toBe('Revenue')
    expect(out[1]!.label).toBe('Series 2')
  })
})
