// Two seams the family layer owns: routing a compiled plan to its OWN canvas
// host (family-host), and the accessible sentence + colour fallbacks each
// family's SVG writes (family-svg). Both are covered on the plans and options
// the existing suites skip: the host-less families, per-datum colours, the
// title fallbacks, and a chart with no data to describe.
import { describe, expect, it } from 'vitest'
import { compileFamily } from './option-family'
import { familyHostNode } from './family-host'
import { ChordChart } from './ChordChart'
import { GaugeChart, PieChart } from './PieChart'
import { CandlestickChart } from './CandlestickChart'
import { HeatmapChart } from './HeatmapChart'
import { FunnelChart } from './FunnelChart'
import { candlestickToSvg, funnelToSvg, ganttToSvg, gaugeToSvg, heatmapToSvg, radarToSvg, treemapToSvg } from './family-svg'
import { layoutGantt } from './gantt'
import type { EChartsOption } from './option'
import type { FamilyPlan } from './option-family'

const host = (option: EChartsOption, onSelect?: (kind: FamilyPlan['kind'], hit: unknown) => void) => {
  const fam = compileFamily(option)
  expect(fam, `did not compile as a family: ${JSON.stringify(fam?.warnings ?? 'null')}`).not.toBeNull()
  return familyHostNode(fam!.plan, {
    width: 200,
    height: 120,
    ...(onSelect !== undefined ? { onSelect } : {}),
  })
}

describe('familyHostNode — the families the routing table has to name', () => {
  it('routes a chord plan to ChordChart and tags its hit', () => {
    const seen: unknown[] = []
    const node = host(
      { series: [{ type: 'chord', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 3 }] }] },
      (kind, hit) => seen.push([kind, hit]),
    )!
    expect(node.type).toBe(ChordChart)
    ;(node.props as { onSelect: (i: number) => void }).onSelect(1)
    expect(seen).toEqual([['chord', 1]])
  })

  it('the host-less families answer null so the facade SVG stays their picture', () => {
    // boxplot: the plan carries five-number SUMMARIES, which the canvas host
    // has no prop for (it summarises raw observations itself).
    expect(host({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5]] }] })).toBeNull()
    // geoPoints: scatter over a registered map.
    const geo = compileFamily({
      geo: { map: 'cov-family' },
      series: [{ type: 'scatter', coordinateSystem: 'geo', data: [[5, 5]] }],
    })
    if (geo !== null && geo.plan.kind === 'geoPoints') expect(familyHostNode(geo.plan, { width: 100, height: 100 })).toBeNull()
  })

  it('a plan with a TITLE passes it through; one without leaves the prop unset', () => {
    const titled = host({ title: { text: 'Quarterly' }, series: [{ type: 'pie', data: [{ name: 'x', value: 1 }] }] })!
    expect((titled.props as { title?: string }).title).toBe('Quarterly')
    const bare = host({ series: [{ type: 'pie', data: [{ name: 'x', value: 1 }] }] })!
    expect('title' in (bare.props as object)).toBe(false)
  })

  it('a per-slice colour installs a colour channel; a slice WITHOUT one falls back to the palette', () => {
    const plain = host({ series: [{ type: 'pie', data: [{ name: 'x', value: 1 }] }] })!
    expect('color' in (plain.props as object)).toBe(false)
    const mixed = host({
      series: [{ type: 'pie', data: [{ name: 'x', value: 1, itemStyle: { color: '#ff0000' } }, { name: 'y', value: 2 }] }],
    })!
    expect(mixed.type).toBe(PieChart)
    const color = (mixed.props as { color: (d: { color: string | undefined }, i: number) => string }).color
    expect(typeof color).toBe('function')
    expect(color({ color: '#ff0000' }, 0)).toBe('#ff0000')
    // The uncoloured neighbour takes a palette slot rather than `undefined`.
    expect(color({ color: undefined }, 1)).toMatch(/^#|^rgb|^hsl/)
  })

  it('radar takes a colour channel from per-series colours, like the pie', () => {
    const mixed = host({
      radar: { indicator: [{ name: 'a', max: 10 }, { name: 'b', max: 10 }] },
      series: [{ type: 'radar', data: [{ name: 's1', value: [1, 2], itemStyle: { color: '#0000ff' } }, { name: 's2', value: [3, 4] }] }],
    })!
    const color = (mixed.props as { color?: (d: { color: string | undefined }, i: number) => string }).color
    expect(typeof color).toBe('function')
    expect(color!({ color: '#0000ff' }, 0)).toBe('#0000ff')
    expect(color!({ color: undefined }, 1)).toMatch(/^#|^rgb|^hsl/)
    // The rows' own channels answer the host.
    const values = (mixed.props as { values: (r: { values: number[] }) => number[] }).values
    const label = (mixed.props as { label: (r: { name: string }) => string }).label
    expect(values({ values: [1, 2] })).toEqual([1, 2])
    expect(label({ name: 's1' })).toBe('s1')
  })

  it('the candlestick host\'s four price channels each read their own field', () => {
    const node = host({ xAxis: { data: ['d1'] }, yAxis: {}, series: [{ type: 'candlestick', data: [[1, 2, 0, 3]] }] })!
    const p = node.props as {
      open: (r: { open: number }) => number
      high: (r: { high: number }) => number
      low: (r: { low: number }) => number
      close: (r: { close: number }) => number
      x: (r: { x: string }) => string
    }
    expect(p.open({ open: 1 })).toBe(1)
    expect(p.high({ high: 2 })).toBe(2)
    expect(p.low({ low: 0 })).toBe(0)
    expect(p.close({ close: 3 })).toBe(3)
    expect(p.x({ x: 'd1' })).toBe('d1')
  })

  it('the pie, funnel and heatmap hosts read their own row fields too', () => {
    const pie = host({ series: [{ type: 'pie', data: [{ name: 'x', value: 7 }] }] })!.props as {
      value: (r: { value: number }) => number
      label: (r: { name: string }) => string
    }
    expect(pie.value({ value: 7 })).toBe(7)
    expect(pie.label({ name: 'x' })).toBe('x')
    const funnel = host({ series: [{ type: 'funnel', data: [{ name: 'f', value: 2 }] }] })!.props as {
      value: (r: { value: number }) => number
      label: (r: { name: string }) => string
    }
    expect(funnel.value({ value: 2 })).toBe(2)
    expect(funnel.label({ name: 'f' })).toBe('f')
    const heat = host({ xAxis: { data: ['a'] }, yAxis: { data: ['b'] }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] })!.props as {
      x: (r: { x: string }) => string
      y: (r: { y: string }) => string
      value: (r: { value: number }) => number
    }
    expect(heat.x({ x: 'a' })).toBe('a')
    expect(heat.y({ y: 'b' })).toBe('b')
    expect(heat.value({ value: 5 })).toBe(5)
  })

  it('gauge carries thickness and valueColor only when the option set them', () => {
    const bare = host({ series: [{ type: 'gauge', data: [{ value: 40 }] }] })!
    expect(bare.type).toBe(GaugeChart)
    expect('thickness' in (bare.props as object)).toBe(false)
    expect('valueColor' in (bare.props as object)).toBe(false)
    const styled = host({
      series: [{ type: 'gauge', data: [{ value: 40 }], axisLine: { lineStyle: { width: 18 } }, itemStyle: { color: '#00ff00' } }],
    })!
    expect((styled.props as { thickness: number }).thickness).toBe(18)
    expect((styled.props as { valueColor: string }).valueColor).toBe('#00ff00')
  })

  it('candlestick carries up/down colours, and heatmap its colour ramp, only when set', () => {
    const bare = host({ xAxis: { data: ['d1'] }, yAxis: {}, series: [{ type: 'candlestick', data: [[1, 2, 0, 3]] }] })!
    expect(bare.type).toBe(CandlestickChart)
    expect((bare.props as { candle: object }).candle).toEqual({})
    const styled = host({
      xAxis: { data: ['d1'] },
      yAxis: {},
      series: [{ type: 'candlestick', data: [[1, 2, 0, 3]], itemStyle: { color: '#00aa00', color0: '#aa0000' } }],
    })!
    expect((styled.props as { candle: { upColor: string; downColor: string } }).candle).toEqual({ upColor: '#00aa00', downColor: '#aa0000' })

    const heat = host({
      xAxis: { data: ['a'] },
      yAxis: { data: ['b'] },
      visualMap: { min: 0, max: 5, inRange: { color: ['#000000', '#ffffff'] } },
      series: [{ type: 'heatmap', data: [[0, 0, 5]] }],
    })!
    expect(heat.type).toBe(HeatmapChart)
    expect((heat.props as { colors: string[] }).colors).toEqual(['#000000', '#ffffff'])
    const plainHeat = host({ xAxis: { data: ['a'] }, yAxis: { data: ['b'] }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] })!
    expect('colors' in (plainHeat.props as object)).toBe(false)
  })

  it('funnel gets a colour channel from per-stage colours, like the pie', () => {
    const mixed = host({
      series: [{ type: 'funnel', data: [{ name: 'a', value: 5, itemStyle: { color: '#123456' } }, { name: 'b', value: 2 }] }],
    })!
    expect(mixed.type).toBe(FunnelChart)
    const color = (mixed.props as { color: (d: { color: string | undefined }, i: number) => string }).color
    expect(color({ color: '#123456' }, 0)).toBe('#123456')
    expect(color({ color: undefined }, 1)).toMatch(/^#|^rgb|^hsl/)
  })

  it('without an onSelect the host gets no handler at all', () => {
    const node = host({ series: [{ type: 'pie', data: [{ name: 'x', value: 1 }] }] })!
    expect('onSelect' in (node.props as object)).toBe(false)
  })
})

describe('family SVG — the accessible sentence each family writes', () => {
  const desc = (svg: string): string => /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(svg)?.[1] ?? ''

  // NOTE: a heatmap's `colIdx.get(...) ?? -1` / `rowIdx.get(...) ?? -1` cannot
  // take their fallbacks — both index maps are built from `firstSeen` over the
  // SAME rows and the same channel, so every row's key is in its map.
  //
  // NOTE: every `options.title ?? '<Family>'` inside a derived sentence is
  // UNREACHABLE — `svgTail` only calls the deriver when `title !== undefined`,
  // so the fallback name can never be the one printed. An explicit
  // `description` bypasses the deriver entirely.
  it('gauge derives "<title>: <value> of <max>" from the title, and an explicit description wins', () => {
    expect(desc(gaugeToSvg({ value: 40, max: 100, title: 'Disk use' }))).toContain('Disk use: 40 of 100')
    // No title: no derived sentence at all.
    expect(desc(gaugeToSvg({ value: 40, max: 100 }))).toBe('')
    expect(desc(gaugeToSvg({ value: 40, max: 100, title: 'Disk use', description: 'custom' }))).toBe('custom')
  })

  it('candlestick and heatmap say "no data" for an empty series, and count periods/cells otherwise', () => {
    const emptyCandle = candlestickToSvg({ title: 'Prices', data: [], x: () => '', open: () => 0, high: () => 0, low: () => 0, close: () => 0 })
    expect(desc(emptyCandle)).toBe('Prices: no data.')
    const candle = candlestickToSvg({
      title: 'Prices',
      data: [{ x: 'd1', o: 1, h: 3, l: 0, c: 2 }],
      x: (d) => d.x,
      open: (d) => d.o,
      high: (d) => d.h,
      low: (d) => d.l,
      close: (d) => d.c,
    })
    expect(desc(candle)).toContain('Prices: 1 periods')
    expect(desc(candle)).toContain('last close 2')

    const emptyHeat = heatmapToSvg({ title: 'Load', data: [], x: () => '', y: () => '', value: () => 0 })
    expect(desc(emptyHeat)).toBe('Load: no data.')
    const heat = heatmapToSvg({ title: 'Load', data: [{ x: 'a', y: 'r', v: 3 }], x: (d) => d.x, y: (d) => d.y, value: (d) => d.v })
    expect(desc(heat)).toContain('Load: 1 columns by 1 rows')
  })

  it('a non-finite heatmap value reads as 0 rather than poisoning the grid extent', () => {
    const svg = heatmapToSvg({
      title: 'Load',
      data: [{ x: 'a', y: 'r', v: Number.NaN }, { x: 'b', y: 'r', v: 4 }],
      x: (d) => d.x,
      y: (d) => d.y,
      value: (d) => d.v,
    })
    expect(desc(svg)).toContain('values 0 to 4')
    expect(desc(svg)).not.toContain('NaN')
  })

  it('radar draws a legend only when asked, and the legend pushes the plot down', () => {
    const opts = {
      data: [{ name: 's', values: [1, 2] }],
      axes: [{ label: 'a', max: 10 }, { label: 'b', max: 10 }],
      values: (d: { values: number[] }) => d.values,
      label: (d: { name: string }) => d.name,
    }
    const off = radarToSvg(opts)
    const on = radarToSvg({ ...opts, showLegend: true })
    expect(on).toContain('>s<')
    expect(on.length).toBeGreaterThan(off.length)
  })

  it('funnel takes a per-stage colour function when given one, and the palette otherwise', () => {
    const rows = [{ name: 'a', v: 5 }, { name: 'b', v: 2 }]
    const opts = { data: rows, value: (d: { v: number }) => d.v, label: (d: { name: string }) => d.name }
    const themed = funnelToSvg({ ...opts, color: () => '#ff00ff' })
    expect(themed).toContain('#ff00ff')
    expect(funnelToSvg(opts)).not.toContain('#ff00ff')
  })

  it('treemap describes its largest leaf, and says "none" when there is no leaf to name', () => {
    const withLeaves = treemapToSvg({ data: [{ name: 'r', children: [{ name: 'small', value: 1 }, { name: 'big', value: 9 }] }], title: 'Sizes' })
    expect(desc(withLeaves)).toContain('largest big')
    // An explicit description short-circuits the derived sentence entirely.
    expect(desc(treemapToSvg({ data: [], title: 'Sizes', description: 'hand written' }))).toBe('hand written')
    const empty = treemapToSvg({ data: [], title: 'Sizes' })
    expect(desc(empty)).toContain('0 leaves, largest none')
    // Without a title there is no generated sentence to write at all.
    expect(desc(treemapToSvg({ data: [] }))).toBe('')
  })

  it('gantt describes the TASKS\' own span, and falls back to the axis domain when there is no task', () => {
    const withTasks = ganttToSvg({
      tasks: [{ id: 't', name: 'Design', start: '2024-03-04', end: '2024-03-08' }],
      title: 'Plan',
    })
    // The sentence reads the task's own dates, not the padded axis domain.
    expect(desc(withTasks)).toContain('1 task from 2024-03-04 to 2024-03-08')
    // SEVERAL tasks: the span is the earliest start to the latest end, so a
    // task that ends BEFORE the running maximum leaves it where it was.
    const many = ganttToSvg({
      tasks: [
        { id: 'a', name: 'Long', start: '2024-03-01', end: '2024-03-20' },
        { id: 'b', name: 'Short', start: '2024-03-05', end: '2024-03-06' },
      ],
      title: 'Plan',
    })
    expect(desc(many)).toContain('2 tasks from 2024-03-01 to 2024-03-20')
    const none = ganttToSvg({ tasks: [], title: 'Plan' })
    expect(desc(none)).toContain('0 tasks from ')
    expect(desc(none)).not.toContain('NaN')
    // The layout it describes really does have an empty row list.
    expect(layoutGantt([], { x: 0, y: 0, w: 400, h: 300 }).rows).toEqual([])
  })
})
