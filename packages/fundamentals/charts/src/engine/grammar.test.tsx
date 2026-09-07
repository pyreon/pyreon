import { h } from '@pyreon/core'
import { Arc, Area, Axis, Bar, Candle, Cell, Dot, Label, Legend, Line, Rule, Stage, Tip, Zoom, channel, resolveGrammar } from './grammar'
import { area, bars, bubble, groupedBars, line, stackedBars, resolveMarks } from './marks'
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

describe('resolveGrammar — the family marks name the host', () => {
  interface Slice { name: string; pct: number; tint: string }
  const SLICES: Slice[] = [{ name: 'a', pct: 60, tint: '#111' }, { name: 'b', pct: 40, tint: '#222' }]
  it('<Arc> resolves to the pie host with its channels as accessors and its options on the host', () => {
    const g = resolveGrammar<Slice>(SLICES, { data: SLICES }, [h(Arc<Slice>, { value: 'pct', label: 'name', color: (d: Slice) => d.tint, innerRadius: 0.5 }), h(Tip, {}), h(Legend, {})])
    expect(g.family?.host).toBe('pie')
    expect(g.marks).toEqual([])
    const p = g.family!.props as { value: (d: Slice, i: number) => number; label: (d: Slice, i: number) => string; color: (d: Slice, i: number) => string; innerRadius: number }
    expect(p.value(SLICES[1]!, 1)).toBe(40)
    expect(p.label(SLICES[0]!, 0)).toBe('a')
    expect(p.color(SLICES[0]!, 0)).toBe('#111')
    expect(p.innerRadius).toBe(0.5)
    expect(g.props.tooltip).toBe(true)
    expect(g.props.showLegend).toBe(true)
  })
  it('<Stage> and <Candle> gather their option attrs into the host\'s options prop; <Cell> keeps them on the host', () => {
    const s = resolveGrammar<Slice>(SLICES, { data: SLICES }, [h(Stage<Slice>, { value: 'pct', label: 'name', sort: 'none', gap: 4 })])
    expect(s.family?.host).toBe('funnel')
    expect(s.family?.props.funnel).toEqual({ sort: 'none', gap: 4 })
    interface Bar { d: string; o: number; h: number; l: number; c: number }
    const bars: Bar[] = [{ d: 'Mon', o: 1, h: 3, l: 0.5, c: 2 }]
    const c = resolveGrammar<Bar>(bars, { data: bars, x: 'd' }, [h(Candle<Bar>, { open: 'o', high: 'h', low: 'l', close: 'c', upColor: '#0f0' })])
    expect(c.family?.host).toBe('candlestick')
    expect((c.family!.props.close as (d: Bar, i: number) => number)(bars[0]!, 0)).toBe(2)
    expect(c.family?.props.candle).toEqual({ upColor: '#0f0' })
    interface Obs { hour: string; day: string; n: number }
    const obs: Obs[] = [{ hour: '1', day: 'Mon', n: 2 }]
    const m = resolveGrammar<Obs>(obs, { data: obs }, [h(Cell<Obs>, { x: 'hour', y: 'day', value: 'n', gap: 2, colors: ['#000', '#fff'] })])
    expect(m.family?.host).toBe('heatmap')
    expect(m.family?.props.gap).toBe(2)
    expect(m.family?.props.colors).toEqual(['#000', '#fff'])
    expect((m.family!.props.y as (d: Obs, i: number) => string)(obs[0]!, 0)).toBe('Mon')
  })
  it('one family per plot, and a family mark beside a cartesian one wins — both reported', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = resolveGrammar<Slice>(SLICES, { data: SLICES }, [h(Bar<Slice>, { y: 'pct' }), h(Arc<Slice>, { value: 'pct', label: 'name' }), h(Stage<Slice>, { value: 'pct', label: 'name' })])
    expect(g.family?.host).toBe('pie')
    expect(g.marks).toEqual([])
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      '[Pyreon] <Plot>: one family per plot — <Stage> is ignored beside the pie mark.',
      '[Pyreon] <Plot>: a pie mark beside <Bar> — the plot renders the pie; the cartesian marks are ignored.',
    ])
    warn.mockRestore()
  })
  it('<Label> → point markers and <Rule x> → a vertical annotation on the plot', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS }, [h(Bar<Row>, { y: 'revenue' }), h(Label, { at: 'max', text: 'Peak', color: '#f00' }), h(Label, { series: 1, at: 2, text: 'Third', radius: 6 }), h(Rule, { x: 1.5, label: 'launch' })])
    expect(g.family).toBeNull()
    expect(g.props.markers).toEqual([{ label: 'Peak', at: 'max', color: '#f00' }, { label: 'Third', seriesIndex: 1, atIndex: 2, radius: 6 }])
    expect(g.props.annotations).toEqual([{ x: 1.5, label: 'launch' }])
  })
})
