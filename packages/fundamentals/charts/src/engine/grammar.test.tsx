import { h } from '@pyreon/core'
import { Area, Axis, Bar, Dot, Legend, Line, Rule, Tip, Zoom, channel, resolveGrammar } from './grammar'
import { area, bars, bubble, groupedBars, line, points, stackedBars, resolveMarks } from './marks'
import { compact } from './format'

interface Row { month: string; revenue: number; cost: number; region: string; size: number }
const ROWS: Row[] = [
  { month: 'Jan', revenue: 10, cost: 4, region: 'eu', size: 2 },
  { month: 'Feb', revenue: 12, cost: 5, region: 'eu', size: 3 },
  { month: 'Jan', revenue: 7, cost: 3, region: 'us', size: 1 },
]

describe('channel', () => {
  it('turns a field name into an accessor and passes an accessor through', () => {
    expect(channel<Row, number>('revenue')(ROWS[0]!, 0)).toBe(10)
    const f = (d: Row) => d.cost * 2
    expect(channel<Row, number>(f)).toBe(f)
  })
})

describe('resolveGrammar — wide form (no color channel)', () => {
  it('mark children resolve to the SAME Series the marks-array form produces', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'month' }, [
      h(Bar<Row>, { y: 'revenue', label: 'Revenue' }),
      h(Line<Row>, { y: (d: Row) => d.cost, label: 'Cost', width: 3 }),
      h(Area<Row>, { y: 'cost' }),
      h(Dot<Row>, { y: 'revenue', r: 'size' }),
      h(Bar<Row>, { y: 'cost', stack: true }),
      h(Bar<Row>, { y: 'cost', group: true }),
    ])
    const arr = [bars<Row>((d) => d.revenue, { label: 'Revenue' }), line<Row>((d) => d.cost, { label: 'Cost', width: 3 }), area<Row>((d) => d.cost), bubble<Row>((d) => d.revenue, (d) => d.size), stackedBars<Row>((d) => d.cost), groupedBars<Row>((d) => d.cost)]
    expect(g.pivot).toBeNull()
    expect(resolveMarks(ROWS, g.marks)).toEqual(resolveMarks(ROWS, arr))
    expect(g.marks.map((m) => m.kind)).toEqual(['bars', 'line', 'area', 'points', 'stacked', 'grouped'])
  })
  it('ignores non-mark children (text, null, elements) and reads a function child (the compiled lazy sole-child shape)', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS }, [null, 'text', h('div', null), () => h(Bar<Row>, { y: 'revenue' })])
    expect(g.marks).toHaveLength(1)
  })
  it('Rule → annotations, Axis → axis props, Tip/Legend/Zoom → their PlotChart switches', () => {
    const onBrush = () => {}
    const g = resolveGrammar<Row>(ROWS, { data: ROWS }, [
      h(Bar<Row>, { y: 'revenue' }),
      h(Rule, { y: 9, label: 'goal', color: '#f00' }),
      h(Rule, { from: 2, to: 4 }),
      h(Axis, { y: true, format: compact }),
      h(Axis, { x: true, time: true, hidden: true }),
      h(Axis, { y2: true, domain: { min: 0, max: 1 } }),
      h(Tip, { crosshair: true }),
      h(Legend, { toggle: false, maxRows: 2 }),
      h(Zoom, { navigator: true, presets: [{ label: '1M', count: 30 }], brush: onBrush }),
    ])
    expect(g.props.annotations).toEqual([{ y: 9, label: 'goal', color: '#f00' }, { yFrom: 2, yTo: 4 }])
    expect(g.props.format).toBe(compact)
    expect(g.props.xTime).toBe(true)
    expect(g.props.showXAxis).toBe(false)
    expect(g.props.y2Domain).toEqual({ min: 0, max: 1 })
    expect(g.props.tooltip).toBe(true)
    expect(g.props.crosshair).toBe(true)
    expect(g.props.showLegend).toBe(true)
    expect(g.props.legendToggle).toBe(false)
    expect(g.props.legendMaxRows).toBe(2)
    expect(g.props.dataZoom).toBe(true)
    expect(g.props.navigator).toBe(true)
    expect(g.props.zoomPresets).toEqual([{ label: '1M', count: 30 }])
    expect(g.props.brush).toBe(true)
    expect(g.props.onBrush).toBe(onBrush)
  })
})

describe('resolveGrammar — long form (color channel pivots)', () => {
  it('one series per distinct color value, categories from x, gaps where a (category, series) pair is absent, bars grouped by default', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'month', color: 'region' }, [h(Bar<Row>, { y: 'revenue' })])
    expect(g.pivot).not.toBeNull()
    expect(g.pivot!.rows).toEqual(['Jan', 'Feb'])
    const series = resolveMarks(g.pivot!.rows, g.marks as never)
    expect(series.map((s) => s.label)).toEqual(['eu', 'us'])
    expect(series.map((s) => s.kind)).toEqual(['grouped', 'grouped'])
    expect(series[0]!.values).toEqual([10, 12])
    expect(series[1]!.values[0]).toBe(7)
    expect(Number.isNaN(series[1]!.values[1])).toBe(true)
  })
  it('stack wins over the default grouping, and a line pivots without grouping', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'month', color: 'region' }, [h(Bar<Row>, { y: 'revenue', stack: true }), h(Line<Row>, { y: 'cost' })])
    expect(g.marks.map((m) => m.kind)).toEqual(['stacked', 'stacked', 'line', 'line'])
  })
})
