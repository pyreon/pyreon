// The grammar's CHILD WALK and its prop forwarding: a `<Show>` / `<For>`
// wrapping a mark, a child that is not a mark at all, the family marks' option
// buckets, and the accessors `<Chart>` hands its host. Read through
// `makeReactiveProps`, which is what the mount pipeline does — so these assert
// the value a host really sees.
import { describe, expect, it, vi } from 'vitest'
import { For, Fragment, Show, h, makeReactiveProps } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import {
  Arc,
  Axis,
  Band,
  Bar,
  Candle,
  Cell,
  Dot,
  Histogram,
  Label,
  Legend,
  Line,
  Chart,
  Rule,
  Scale,
  Stage,
  StackedArea,
  Tooltip,
  Zoom,
  resolveGrammar,
} from './grammar'
import { resolveMarks } from './marks'
import type { VNode } from '@pyreon/core'

interface Row { month: string; revenue: number; cost: number; region: string; size: number }
const ROWS: Row[] = [
  { month: 'Jan', revenue: 10, cost: 4, region: 'eu', size: 2 },
  { month: 'Feb', revenue: 12, cost: 5, region: 'eu', size: 3 },
  { month: 'Jan', revenue: 7, cost: 3, region: 'us', size: 1 },
]

const resolve = (children: unknown, chart: Record<string, unknown> = {}) =>
  resolveGrammar<Row>(ROWS, { data: ROWS, ...chart } as never, children as never)

describe('the child walk', () => {
  it('a <Show> reads its condition as a VALUE or an ACCESSOR, and an off one contributes nothing', () => {
    expect(resolve([h(Show, { when: true }, h(Bar<Row>, { y: 'revenue' }))]).marks).toHaveLength(1)
    expect(resolve([h(Show, { when: false }, h(Bar<Row>, { y: 'revenue' }))]).marks).toHaveLength(0)
    expect(resolve([h(Show, { when: () => true }, h(Bar<Row>, { y: 'revenue' }))]).marks).toHaveLength(1)
    expect(resolve([h(Show, { when: () => false }, h(Bar<Row>, { y: 'revenue' }))]).marks).toHaveLength(0)
    // A Show with no `when` at all is off.
    expect(resolve([h(Show, {}, h(Bar<Row>, { y: 'revenue' }))]).marks).toHaveLength(0)
  })

  it('a <For> resolves its items through the render callback, in both child shapes', () => {
    const render = (k: 'revenue' | 'cost') => h(Bar<Row>, { y: k, label: k })
    // `children` as a function prop (the compiled shape) …
    const looped = resolve([h(For, { each: ['revenue', 'cost'], children: render })])
    expect(resolveMarks(ROWS, looped.marks).map((s) => s.label)).toEqual(['revenue', 'cost'])
    // … and as the single child vnode slot.
    expect(resolve([h(For, { each: ['revenue'] }, render as never)]).marks).toHaveLength(1)
    // An accessor `each` is read here, inside the resolving scope.
    expect(resolve([h(For, { each: () => ['revenue', 'cost'], children: render })]).marks).toHaveLength(2)
    // Neither a non-array `each` nor a non-function render produces marks.
    expect(resolve([h(For, { each: 'nope', children: render })]).marks).toHaveLength(0)
    expect(resolve([h(For, { each: ['revenue'], children: 'nope' })]).marks).toHaveLength(0)
  })

  it('a fragment is transparent, an array flattens, and a function child is read', () => {
    expect(resolve([h(Fragment, null, h(Bar<Row>, { y: 'revenue' }), h(Line<Row>, { y: 'cost' }))]).marks).toHaveLength(2)
    expect(resolve([[h(Bar<Row>, { y: 'revenue' })], () => h(Line<Row>, { y: 'cost' })]).marks).toHaveLength(2)
    // The atoms a walk must simply drop.
    expect(resolve([null, undefined, true, false, 'text', 7]).marks).toHaveLength(0)
  })

  it('a child that is not a mark is NAMED in the warning, whatever it is', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      resolve([h('div', null)])
      expect(warn.mock.calls.map(String).join()).toContain('<div>')
      warn.mockClear()
      function MyThing(): null { return null }
      resolve([h(MyThing, null)])
      expect(warn.mock.calls.map(String).join()).toContain('<MyThing>')
      warn.mockClear()
      // An anonymous component has no name to print, so the walk says so.
      const anon = (): null => null
      Object.defineProperty(anon, 'name', { value: '' })
      resolve([h(anon as never, null)])
      expect(warn.mock.calls.map(String).join()).toContain('<Component>')
      warn.mockClear()
      // A type that is neither a tag nor a component (a bare symbol) is
      // stringified rather than dressed up as an element.
      resolve([{ type: Symbol('mystery'), props: {}, children: [] }])
      expect(warn.mock.calls.map(String).join()).toContain('mystery')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('mark children → PlotChart props', () => {
  it('a <Rule x> is a VERTICAL rule, distinct from the y and from/to forms', () => {
    const g = resolve([h(Bar<Row>, { y: 'revenue' }), h(Rule, { x: 2, label: 'now' }), h(Rule, {})])
    // The bare rule names no bound, so it is skipped rather than guessed at.
    expect(g.props.annotations).toEqual([{ x: 2, label: 'now' }])
  })

  it('a <Label at> takes "max"/"min" as a name and a number as an index', () => {
    const g = resolve([
      h(Bar<Row>, { y: 'revenue' }),
      h(Label, { text: 'peak', at: 'max', series: 0, color: '#f00', radius: 6 }),
      h(Label, { text: 'third', at: 2 }),
      h(Label, { text: 'floating' }),
    ])
    expect(g.props.markers).toEqual([
      { label: 'peak', seriesIndex: 0, at: 'max', color: '#f00', radius: 6 },
      { label: 'third', atIndex: 2 },
      { label: 'floating' },
    ])
  })

  it('<Axis> sets title and labels on the x branch, title on the y2 branch, scale/time on the y branch', () => {
    const g = resolve([
      h(Bar<Row>, { y: 'revenue' }),
      h(Axis, { x: true, title: 'Month', labels: 'rotate', format: (v: string) => `M${v}` }),
      h(Axis, { y2: true, title: 'Rate', format: (v: number) => `${v}%` }),
      h(Axis, { y: true, title: 'Revenue', time: true, scale: 'log', hidden: true }),
    ])
    expect(g.props.xTitle).toBe('Month')
    expect(typeof g.props.xFormat).toBe('function')
    expect(g.props.xLabels).toBe('rotate')
    expect(g.props.y2Title).toBe('Rate')
    expect(typeof g.props.y2Format).toBe('function')
    expect(g.props.yTitle).toBe('Revenue')
    expect(g.props.yTime).toBe(true)
    expect(g.props.yScale).toBe('log')
    expect(g.props.showYAxis).toBe(false)
    // An axis that sets nothing changes nothing.
    const bare = resolve([h(Bar<Row>, { y: 'revenue' }), h(Axis, { x: true })])
    expect(bare.props.xTitle).toBeUndefined()
    expect(bare.props.showXAxis).toBeUndefined()
  })

  it('<Scale> maps log/linear/time on y and time on x, plus the normalize switch', () => {
    expect(resolve([h(Bar<Row>, { y: 'revenue' }), h(Scale, { y: 'log' })]).props.yScale).toBe('log')
    expect(resolve([h(Bar<Row>, { y: 'revenue' }), h(Scale, { y: 'linear' })]).props.yScale).toBe('linear')
    const t = resolve([h(Bar<Row>, { y: 'revenue' }), h(Scale, { y: 'time', x: 'time', normalize: true })])
    expect(t.props.yTime).toBe(true)
    expect(t.props.xTime).toBe(true)
    expect(t.props.stackNormalize).toBe(true)
    // `y: 'time'` is not a yScale.
    expect(t.props.yScale).toBeUndefined()
  })

  it('<Tooltip format> installs the formatter; <Zoom inside={false}> withholds the in-plot zoom', () => {
    const fmt = () => 'x'
    const g = resolve([h(Bar<Row>, { y: 'revenue' }), h(Tooltip, { format: fmt as never })])
    expect(g.props.tooltip).toBe(true)
    expect(g.props.tooltipFormatter).toBe(fmt)
    const off = resolve([h(Bar<Row>, { y: 'revenue' }), h(Zoom, { inside: false })])
    expect(off.props.dataZoom).toBeUndefined()
    const on = resolve([h(Bar<Row>, { y: 'revenue' }), h(Zoom, { link: 'group-a' })])
    expect(on.props.dataZoom).toBe(true)
    expect(on.props.link).toBe('group-a')
    // A bare <Legend> turns it on without touching the switches.
    const leg = resolve([h(Bar<Row>, { y: 'revenue' }), h(Legend, {})])
    expect(leg.props.showLegend).toBe(true)
    expect(leg.props.legendToggle).toBeUndefined()
  })

  it('<Histogram> replaces the rows with its bins and carries every option', () => {
    const g = resolve([h(Histogram<Row>, { x: 'revenue', bins: 2, label: 'Spread', color: '#abc', format: (v: number) => `${v}` })])
    expect(g.pivot).not.toBeNull()
    expect(g.marks).toHaveLength(1)
    expect(resolveMarks(g.pivot!.rows as Row[], g.marks)[0]!.label).toBe('Spread')
    // Its bins replace the rows, so the pivot names its own x.
    expect(typeof g.pivot!.x).toBe('function')
    expect(g.pivot!.rows.length).toBeGreaterThan(0)
    // A histogram with only its channel still bins.
    expect(resolve([h(Histogram<Row>, { x: 'revenue' })]).marks).toHaveLength(1)
  })

  it('<Histogram> beside another mark warns and wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const g = resolve([h(Bar<Row>, { y: 'revenue' }), h(Histogram<Row>, { x: 'revenue' })])
      expect(g.marks).toHaveLength(1)
      expect(warn.mock.calls.map(String).join()).toContain('<Histogram>')
    } finally {
      warn.mockRestore()
    }
  })

  it('a <Dot> with an r channel is a bubble; without one it is points', () => {
    expect(resolve([h(Dot<Row>, { y: 'revenue', r: 'size' })]).marks[0]!.kind).toBe('points')
    expect(resolve([h(Dot<Row>, { y: 'revenue' })]).marks[0]!.kind).toBe('points')
    // The bubble form carries the radius channel; the plain one does not.
    const bubble = resolve([h(Dot<Row>, { y: 'revenue', r: 'size' })]).marks[0]! as { r?: unknown; minRadius?: number; maxRadius?: number }
    const plain = resolve([h(Dot<Row>, { y: 'revenue' })]).marks[0]! as { r?: unknown }
    expect(bubble.r).toBeDefined()
    expect(plain.r).toBeUndefined()
    // The radius BOUNDS are forwarded only when given; unset, the mark keeps
    // its own defaults rather than being handed `undefined`.
    const bounded = resolve([h(Dot<Row>, { y: 'revenue', r: 'size', minRadius: 2, maxRadius: 19 })]).marks[0]! as { minRadius?: number; maxRadius?: number }
    expect(bounded.minRadius).toBe(2)
    expect(bounded.maxRadius).toBe(19)
    // Unset, the mark keeps its own defaults — real numbers, not the caller's.
    expect(bubble.minRadius).toBeTypeOf('number')
    expect(bubble.minRadius).not.toBe(2)
    expect(bubble.maxRadius).not.toBe(19)
  })

  it('a <Band> and a <StackedArea> resolve to their own mark kinds', () => {
    expect(resolve([h(Band<Row>, { high: 'revenue', low: 'cost' })]).marks[0]!.kind).toBe('band')
    expect(resolve([h(StackedArea<Row>, { y: 'revenue' })]).marks[0]!.kind).toBe('stackedArea')
  })
})

describe('the family marks', () => {
  it('<Arc> channels become accessors; a `children` prop and an undefined one are dropped', () => {
    const g = resolve([h(Arc<Row>, { value: 'revenue', label: 'month', color: undefined, innerRadius: 0.4, children: null } as never)])
    expect(g.family).not.toBeNull()
    expect(g.family!.host).toBe('pie')
    expect(typeof g.family!.props['value']).toBe('function')
    expect((g.family!.props['value'] as (d: Row, i: number) => number)(ROWS[0]!, 0)).toBe(10)
    expect('color' in g.family!.props).toBe(false)
    expect('children' in g.family!.props).toBe(false)
    // A non-channel prop passes straight through for the pie.
    expect(g.family!.props['innerRadius']).toBe(0.4)
    expect(g.marks).toEqual([])
  })

  it('<Stage> and <Candle> bucket their non-channel props under `funnel` / `candle`', () => {
    const stage = resolve([h(Stage<Row>, { value: 'revenue', label: 'month', gap: 4 } as never)])
    expect(stage.family!.host).toBe('funnel')
    expect(stage.family!.props['funnel']).toEqual({ gap: 4 })
    const candle = resolve([h(Candle<Row>, { open: 'cost', high: 'revenue', low: 'cost', close: 'revenue', upColor: '#0a0' } as never)])
    expect(candle.family!.host).toBe('candlestick')
    expect(candle.family!.props['candle']).toEqual({ upColor: '#0a0' })
    // With no extra options the bucket is not created at all.
    const bare = resolve([h(Stage<Row>, { value: 'revenue', label: 'month' } as never)])
    expect('funnel' in bare.family!.props).toBe(false)
  })

  it('<Cell> takes the heatmap channel trio', () => {
    const g = resolve([h(Cell<Row>, { x: 'month', y: 'region', value: 'revenue' } as never)])
    expect(g.family!.host).toBe('heatmap')
    expect(Object.keys(g.family!.props).sort()).toEqual(['value', 'x', 'y'])
  })

  it('a SECOND family mark and a cartesian mark beside one both warn, and the first family wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const g = resolve([
        h(Arc<Row>, { value: 'revenue', label: 'month' } as never),
        h(Stage<Row>, { value: 'cost', label: 'month' } as never),
        h(Bar<Row>, { y: 'revenue' }),
      ])
      expect(g.family!.host).toBe('pie')
      expect(g.marks).toEqual([])
      const said = warn.mock.calls.map(String).join()
      expect(said).toContain('<Stage>')
      expect(said).toContain('<Bar>')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('long form — the pivot', () => {
  it('with no x channel the categories are the row INDEX, and with one they are its values', () => {
    const byIndex = resolve([h(Bar<Row>, { y: 'revenue' })], { color: 'region' })
    expect(byIndex.pivot).not.toBeNull()
    expect(byIndex.pivot!.rows.map((r, i) => byIndex.pivot!.x(r, i))).toEqual(['0', '1', '2'])
    const byMonth = resolve([h(Bar<Row>, { y: 'revenue' })], { color: 'region', x: 'month' })
    expect(byMonth.pivot!.rows.map((r, i) => byMonth.pivot!.x(r, i))).toEqual(['Jan', 'Feb'])
    // One series per distinct colour value.
    expect(byMonth.marks).toHaveLength(2)
  })
})

describe('<Chart> — the accessors it hands its host', () => {
  const readProps = (node: VNode): Record<string, unknown> => makeReactiveProps(node.props as Record<string, unknown>)

  it('the cartesian host receives the pivot rows and x when a colour channel splits them', () => {
    const out = Chart<Row>({ data: ROWS, x: 'month', color: 'region', children: h(Bar<Row>, { y: 'revenue' }) } as never)
    const node = (out as () => VNode)()
    const p = readProps(node)
    expect(Array.isArray(p['data'])).toBe(true)
    expect(typeof p['x']).toBe('function')
    expect(Array.isArray(p['marks'])).toBe(true)
    // Without a colour channel the host gets the ORIGINAL rows AND the plot's
    // own x channel (there is no pivot to supply one).
    const wide = (Chart<Row>({ data: ROWS, x: 'month', children: h(Bar<Row>, { y: 'revenue' }) } as never) as () => VNode)()
    expect(readProps(wide)['data']).toBe(ROWS)
    const wideX = readProps(wide)['x'] as (d: Row, i: number) => string
    expect(typeof wideX).toBe('function')
    expect(wideX(ROWS[0]!, 0)).toBe('Jan')
    // A function `data` prop is read on demand.
    const lazy = (Chart<Row>({ data: () => ROWS, children: h(Bar<Row>, { y: 'revenue' }) } as never) as () => VNode)()
    expect(readProps(lazy)['data']).toEqual(ROWS)
    // No x channel at all leaves the host's x unset.
    expect(readProps(lazy)['x']).toBeUndefined()
  })

  it('a continuous xValue channel becomes an accessor, and is absent when unset', () => {
    const withX = (Chart<Row>({ data: ROWS, xValue: 'size', children: h(Dot<Row>, { y: 'revenue' }) } as never) as () => VNode)()
    expect(typeof readProps(withX)['xValue']).toBe('function')
    const without = (Chart<Row>({ data: ROWS, children: h(Dot<Row>, { y: 'revenue' }) } as never) as () => VNode)()
    expect(readProps(without)['xValue']).toBeUndefined()
  })

  it('onSelect reaches the plot host as its index callback, and is absent when unset', () => {
    // <Chart> has ONE selection callback: `onSelect` with the drawn item's
    // index, on every target. There is no `onSelectIndex` to merge.
    const a = vi.fn()
    const withA = (Chart<Row>({ data: ROWS, onSelect: a, children: h(Bar<Row>, { y: 'revenue' }) } as never) as () => VNode)()
    expect(readProps(withA)['onSelect']).toBe(a)
    const neither = (Chart<Row>({ data: ROWS, children: h(Bar<Row>, { y: 'revenue' }) } as never) as () => VNode)()
    expect(readProps(neither)['onSelect']).toBeUndefined()
  })

  it('a chart-level prop WINS over the same switch declared by a child', () => {
    const node = (Chart<Row>({
      data: ROWS,
      showLegend: false,
      children: [h(Bar<Row>, { y: 'revenue' }), h(Legend, {})],
    } as never) as () => VNode)()
    // `false ?? childValue` keeps the chart's own answer.
    expect(readProps(node)['showLegend']).toBe(false)
    // Unset on the chart, the child's switch reaches the host.
    const fromChild = (Chart<Row>({ data: ROWS, children: [h(Bar<Row>, { y: 'revenue' }), h(Legend, {})] } as never) as () => VNode)()
    expect(readProps(fromChild)['showLegend']).toBe(true)
  })

  it('a funnel and a heatmap mark each route to their OWN host', () => {
    const funnel = (Chart<Row>({ data: ROWS, children: h(Stage<Row>, { value: 'revenue', label: 'month' } as never) } as never) as () => VNode)()
    expect(typeof readProps(funnel)['value']).toBe('function')
    expect(readProps(funnel)['funnel']).toBeUndefined()
    const heat = (Chart<Row>({ data: ROWS, children: h(Cell<Row>, { x: 'month', y: 'region', value: 'revenue' } as never) } as never) as () => VNode)()
    const hp = readProps(heat)
    expect(typeof hp['x']).toBe('function')
    expect(typeof hp['y']).toBe('function')
    expect(typeof hp['value']).toBe('function')
  })

  it('a family host takes a child-declared switch when the chart itself left it unset', () => {
    const fromChild = (Chart<Row>({
      data: ROWS,
      children: [h(Arc<Row>, { value: 'revenue', label: 'month' } as never), h(Legend, {})],
    } as never) as () => VNode)()
    expect(readProps(fromChild)['showLegend']).toBe(true)
    // The chart's own answer wins when it has one.
    const fromChart = (Chart<Row>({
      data: ROWS,
      showLegend: false,
      children: [h(Arc<Row>, { value: 'revenue', label: 'month' } as never), h(Legend, {})],
    } as never) as () => VNode)()
    expect(readProps(fromChart)['showLegend']).toBe(false)
  })

  it('a family mark routes to its OWN host, with the shared props and the mark\'s channels', () => {
    const pie = (Chart<Row>({ data: ROWS, width: 300, height: 200, title: 'Share', children: h(Arc<Row>, { value: 'revenue', label: 'month' } as never) } as never) as () => VNode)()
    const p = readProps(pie)
    expect(p['width']).toBe(300)
    expect(p['title']).toBe('Share')
    expect(typeof p['value']).toBe('function')
    expect(Array.isArray(p['data'])).toBe(true)
    // The toolbox maps the plot's form to the family host's PNG-only switch.
    expect(p['toolbox']).toBeUndefined()
    const withTb = (Chart<Row>({ data: ROWS, toolbox: { saveAsImage: 'svg' }, children: h(Arc<Row>, { value: 'revenue', label: 'month' } as never) } as never) as () => VNode)()
    expect(readProps(withTb)['toolbox']).toEqual({ saveAsImage: true })
    const offTb = (Chart<Row>({ data: ROWS, toolbox: { saveAsImage: false }, children: h(Arc<Row>, { value: 'revenue', label: 'month' } as never) } as never) as () => VNode)()
    expect(readProps(offTb)['toolbox']).toEqual({ saveAsImage: false })
  })

  it('the CANDLESTICK host additionally gets the plot\'s x channel', () => {
    const withX = (Chart<Row>({
      data: ROWS, x: 'month',
      children: h(Candle<Row>, { open: 'cost', high: 'revenue', low: 'cost', close: 'revenue' } as never),
    } as never) as () => VNode)()
    expect(typeof readProps(withX)['x']).toBe('function')
    const withoutX = (Chart<Row>({
      data: ROWS,
      children: h(Candle<Row>, { open: 'cost', high: 'revenue', low: 'cost', close: 'revenue' } as never),
    } as never) as () => VNode)()
    expect(readProps(withoutX)['x']).toBeUndefined()
  })

  it('a facet channel returns a GRID of panels, one per facet value, sharing ONE y domain', () => {
    const grid = Chart<Row>({ data: ROWS, x: 'month', facet: 'region', facetColumns: 3, children: h(Bar<Row>, { y: 'revenue' }) } as never) as VNode
    expect(grid.type).toBe('div')
    expect(String((grid.props as { style: string }).style)).toContain('repeat(3,')
    // The panels are built by the child accessor, one per distinct facet value.
    const panels = (grid.children[0] as () => VNode[])()
    expect(panels).toHaveLength(2)
    const p0 = readProps(panels[0]!)
    expect(p0['title']).toBe('eu')
    expect(p0['showTitle']).toBe(true)
    expect(Array.isArray(p0['data'])).toBe(true)
    expect((p0['data'] as Row[]).every((r) => r.region === 'eu')).toBe(true)
    expect(typeof p0['x']).toBe('function')
    // Comparison is the point of a facet grid: both panels share one domain.
    const p1 = readProps(panels[1]!)
    expect(p0['yDomain']).toEqual(p1['yDomain'])
    expect(p0['yDomain']).toBeDefined()
    // Default column count when none is given.
    const twoCol = Chart<Row>({ data: ROWS, facet: 'region', children: h(Bar<Row>, { y: 'revenue' }) } as never) as VNode
    expect(String((twoCol.props as { style: string }).style)).toContain('repeat(2,')
  })

  it('a facet grid gains and loses panels as the facet values change', () => {
    const rows = signal<Row[]>(ROWS)
    const grid = Chart<Row>({ data: () => rows(), facet: 'region', children: h(Bar<Row>, { y: 'revenue' }) } as never) as VNode
    const panels = grid.children[0] as () => VNode[]
    expect(panels().map((n) => (n.props as { title: string }).title)).toEqual(['eu', 'us'])
    // A row set with a NEW value adds a panel …
    rows.set([...ROWS, { month: 'Mar', revenue: 4, cost: 1, region: 'apac', size: 1 }])
    expect(panels().map((n) => (n.props as { title: string }).title)).toEqual(['eu', 'us', 'apac'])
    // … and one with fewer values drops back, while the surviving panel keeps
    // its identity (its rows come through its own signal).
    rows.set(ROWS.filter((r) => r.region === 'eu'))
    expect(panels().map((n) => (n.props as { title: string }).title)).toEqual(['eu'])
    // The same values again recompute to the same key list.
    rows.set(ROWS.filter((r) => r.region === 'eu'))
    expect(panels()).toHaveLength(1)
  })

  it('a faceted plot with a PINNED domain uses it, and one with nothing to scale shares none', () => {
    const pinned = Chart<Row>({
      data: ROWS, facet: 'region',
      children: [h(Bar<Row>, { y: 'revenue' }), h(Axis, { y: true, domain: { min: 0, max: 99 } })],
    } as never) as VNode
    const panels = (pinned.children[0] as () => VNode[])()
    expect(readProps(panels[0]!)['yDomain']).toEqual({ min: 0, max: 99 })

    // No marks at all: nothing to derive a shared domain from, and with no x
    // channel either the panel's x stays unset.
    const empty = Chart<Row>({ data: ROWS, facet: 'region', children: null } as never) as VNode
    const emptyPanel = readProps(((empty.children[0] as () => VNode[])())[0]!)
    expect(emptyPanel['yDomain']).toBeUndefined()
    expect(emptyPanel['x']).toBeUndefined()
    // A FAMILY mark has no cartesian domain either.
    const family = Chart<Row>({ data: ROWS, facet: 'region', children: h(Arc<Row>, { value: 'revenue', label: 'month' } as never) } as never) as VNode
    expect(readProps(((family.children[0] as () => VNode[])())[0]!)['yDomain']).toBeUndefined()
  })

  it('a faceted LOG plot shares the decade window, and a long-format one facets its pivot', () => {
    const log = Chart<Row>({
      data: ROWS, facet: 'region',
      children: [h(Bar<Row>, { y: 'revenue' }), h(Scale, { y: 'log' })],
    } as never) as VNode
    const domain = readProps(((log.children[0] as () => VNode[])())[0]!)['yDomain'] as { min: number; max: number }
    expect(domain.min).toBeGreaterThan(0)
    expect(Math.log10(domain.min) % 1).toBe(0)

    const long = Chart<Row>({ data: ROWS, x: 'month', color: 'region', facet: 'region', children: h(Bar<Row>, { y: 'revenue' }) } as never) as VNode
    const p = readProps(((long.children[0] as () => VNode[])())[0]!)
    // The panel reads the pivot's rows and its own x, not the raw rows.
    expect(typeof p['x']).toBe('function')
    expect(Array.isArray(p['data'])).toBe(true)
    // The shared domain is derived over the PIVOTED rows, not the raw ones.
    expect(p['yDomain']).toBeDefined()
  })
})
