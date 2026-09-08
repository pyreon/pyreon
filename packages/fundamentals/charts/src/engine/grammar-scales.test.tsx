// The batch-2 grammar: <Scale>, <Axis title labels scale time>, <Histogram>,
// <Bar waterfall errorLow errorHigh>, and the small-multiples / locale hosts.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { Axis, Bar, Dot, Histogram, Line, Plot, Scale, resolveGrammar } from './grammar'
import { PlotChart } from './Chart'
import { bars, resolveMarks } from './marks'
import type { Bin } from './bin'

interface Row { month: string; revenue: number; lo: number; hi: number; region: string }
const ROWS: Row[] = [
  { month: 'Jan', revenue: 10, lo: 8, hi: 12, region: 'eu' },
  { month: 'Feb', revenue: 12, lo: 11, hi: 14, region: 'eu' },
  { month: 'Jan', revenue: 7, lo: 6, hi: 9, region: 'us' },
  { month: 'Feb', revenue: 9, lo: 8, hi: 10, region: 'us' },
]

beforeAll(() => {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
})

describe('resolveGrammar — scales, titles, histogram, waterfall, error bars', () => {
  it('<Scale> sets the y scale, the time axes and the normalized stack; <Axis> carries title / labels / scale / time per axis', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'month' }, [
      h(Scale, { y: 'log', x: 'time', normalize: true }),
      h(Axis, { x: true, title: 'Month', labels: 'thin' }),
      h(Axis, { y: true, title: 'Revenue' }),
      h(Axis, { y2: true, title: 'Cost' }),
      h(Bar<Row>, { y: 'revenue' }),
    ])
    expect(g.props.yScale).toBe('log')
    expect(g.props.xTime).toBe(true)
    expect(g.props.stackNormalize).toBe(true)
    expect(g.props.xTitle).toBe('Month')
    expect(g.props.xLabels).toBe('thin')
    expect(g.props.yTitle).toBe('Revenue')
    expect(g.props.y2Title).toBe('Cost')
    const t = resolveGrammar<Row>(ROWS, { data: ROWS }, [h(Scale, { y: 'time' }), h(Axis, { y: true, scale: 'linear', time: true })])
    expect(t.props.yTime).toBe(true)
    expect(t.props.yScale).toBe('linear')
  })
  it('<Bar waterfall> resolves to the waterfall kind; errorLow / errorHigh channels become bound arrays on every cartesian mark', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS }, [
      h(Bar<Row>, { y: 'revenue', waterfall: true, negativeColor: '#f00' }),
      h(Line<Row>, { y: 'revenue', errorLow: 'lo', errorHigh: (d: Row) => d.hi }),
      h(Dot<Row>, { y: 'revenue', errorLow: 'lo' }),
    ])
    const series = resolveMarks(ROWS, g.marks)
    expect(series[0]!.kind).toBe('waterfall')
    expect(series[0]!.negativeColor).toBe('#f00')
    expect(series[1]!.errLow).toEqual([8, 11, 6, 8])
    expect(series[1]!.errHigh).toEqual([12, 14, 9, 10])
    // One bound is no error bar.
    expect(series[2]!.errLow).toBeUndefined()
  })
  it('<Histogram> replaces the rows with bins (the pivot channel), labels each bin by its range, and wins over other marks with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = resolveGrammar<Row>(ROWS, { data: ROWS }, [h(Histogram<Row>, { x: 'revenue', bins: 3, label: 'Months' }), h(Line<Row>, { y: 'revenue' })])
    expect(g.pivot).not.toBeNull()
    const bins = g.pivot!.rows as Bin[]
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(4)
    expect(g.pivot!.x(bins[0]!, 0)).toMatch(/^\d+–\d+$/)
    expect(g.marks).toHaveLength(1)
    expect(resolveMarks(bins, g.marks as never)[0]!.label).toBe('Months')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('<Histogram> beside another mark'))
    warn.mockRestore()
  })
})

describe('<Plot facet> and locale hosts (happy-dom)', () => {
  it('facet renders one titled panel per distinct value in a grid, every panel sharing the y domain, and a new value adds a panel', async () => {
    const rows = signal(ROWS)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const unmount = mount(
      h(Plot<Row>, { data: () => rows(), x: 'month', facet: 'region', facetColumns: 3, children: h(Bar<Row>, { y: 'revenue' }) }),
      container,
    )
    await new Promise((r) => setTimeout(r, 0))
    const grid = query<HTMLDivElement>(container, '.pyreon-plot-facets')
    expect(grid.style.gridTemplateColumns).toBe('repeat(3,minmax(0,1fr))')
    expect(container.querySelectorAll('canvas')).toHaveLength(2)
    const captions = Array.from(container.querySelectorAll('caption')).map((c) => c.textContent)
    expect(captions.join(' ')).toContain('eu')
    expect(captions.join(' ')).toContain('us')
    // The shared domain reaches the tallest value ACROSS panels: the us panel (max 9) is described against the same 12-high axis, so its table still lists its own rows only.
    const tables = container.querySelectorAll('table')
    expect(tables).toHaveLength(2)
    expect(tables[1]!.textContent).toContain('7')
    expect(tables[1]!.textContent).not.toContain('12')
    rows.set([...ROWS, { month: 'Jan', revenue: 3, lo: 2, hi: 4, region: 'apac' }])
    await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelectorAll('canvas')).toHaveLength(3)
    unmount()
    container.remove()
  })
  it('locale formats the accessible table (and so every number surface) through Intl, an explicit format winning', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const data = [{ v: 1234.5 }]
    const unmount = mount(
      h(PlotChart<{ v: number }>, { data, marks: [bars<{ v: number }>((d) => d.v)], locale: 'de-DE' }),
      container,
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(query<HTMLTableElement>(container, 'table').textContent).toContain('1.234,5')
    unmount()
    const explicit = mount(
      h(PlotChart<{ v: number }>, { data, marks: [bars<{ v: number }>((d) => d.v)], locale: 'de-DE', format: (v: number) => `#${v}` }),
      container,
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(query<HTMLTableElement>(container, 'table').textContent).toContain('#1234.5')
    explicit()
    container.remove()
  })
})
