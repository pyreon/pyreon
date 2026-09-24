// Kotlin emit — `<PlotChart>`'s mark grammar and `<RadarChart>`, the two hosts
// whose props are mostly ACCESSORS and mostly optional.
//
// Every mark is a call the emitter has to recognise by callee name, take an
// accessor from, and bake options for; each of those three steps has its own
// decline, and a decline is an empty `Box {}` — a blank chart with a green
// build. So the specs pair the warning TEXT (which is the only signal the user
// gets) with the absence of the engine call that would have drawn something.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const warn = (src: string) => kotlin(src).warnings

const ROWS = `interface Row { m: string; v: number; lo: number; hi: number; r: number; vs: number[] }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 5, hi: 15, r: 3, vs: [1, 2] }]
const mk = () => (d: Row) => d.v
`
const plot = (imports: string, jsx: string, extra = '') =>
  `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { ${imports} } from '@pyreon/charts'
${ROWS}${extra}export function C() { const w = signal(1); return <Stack>${jsx}</Stack> }`
const P = (marks: string, extra = '') =>
  `<PlotChart data={ROWS} x={(d) => d.m} marks={${marks}} ${extra} height={200} />`

describe('<PlotChart> mark declines', () => {
  it.each([
    ['a callee the emitter does not know', 'PlotChart, bars', P('[notAMark((d) => d.v)]'), 'mark 1: this mark is not lowered on native'],
    ['a mark with no accessor at all', 'PlotChart, bars', P('[bars()]'), 'mark 1: needs an accessor'],
    ['a band given only one bound', 'PlotChart, band', P('[band((d) => d.lo)]'), '`band` needs both an upper and a lower accessor'],
    ['an accessor that is not an inline arrow', 'PlotChart, bars', P('[bars(mk())]'), 'mark 1: only a single-expression arrow'],
    ['an accessor that shadows its own parameter', 'PlotChart, bars', P('[bars((d) => d.vs.map((d) => d).length)]'), 'mark 1: the accessor shadows its own parameter'],
    ['options that are not an object literal', 'PlotChart, bars', P('[bars((d) => d.v, w())]'), 'mark 1: options must be an object literal'],
    ['an option of the wrong literal type', 'PlotChart, bars', P('[bars((d) => d.v, { label: 3 })]'), 'mark 1: `label` must be a string literal'],
    ['a bubble with no radius accessor', 'PlotChart, bubble', P('[bubble((d) => d.v)]'), '`bubble` needs a radius accessor'],
    ['a bubble radius that is not an arrow', 'PlotChart, bubble', P('[bubble((d) => d.v, mk())]'), 'mark 1 radius: only a single-expression arrow'],
    ['an errorLow that is not an arrow', 'PlotChart, bars', P('[bars((d) => d.v, { errorLow: mk(), errorHigh: (d) => d.hi })]'), 'mark 1 errorLow: only a single-expression arrow'],
    ['an x accessor that is not an arrow', 'PlotChart, bars', `<PlotChart data={ROWS} x={mk()} marks={[bars((d) => d.v)]} height={200} />`, '<PlotChart> x: only a single-expression arrow'],
    ['an xValue accessor that is not an arrow', 'PlotChart, bars', `<PlotChart data={ROWS} x={(d) => d.m} xValue={mk()} marks={[bars((d) => d.v)]} height={200} />`, '<PlotChart> xValue: only a single-expression arrow'],
  ])('declines %s', (_why, imports, jsx, expected) => {
    const r = kotlin(plot(imports, jsx))
    expect(r.warnings.join('\n')).toContain(expected)
    expect(r.code).not.toContain('renderChart(')
  })

  it('an advisory decline does NOT blank the chart — curve and a lone error bound both keep drawing', () => {
    const curve = kotlin(plot('PlotChart, line', P('[line((d) => d.v, { curve: (a: number) => a })]')))
    expect(curve.warnings).toEqual(['<PlotChart> mark 1: a `curve` callback is not lowered on native; the series draws straight.'])
    expect(curve.code).toContain('Series(kind = "line"')

    const oneBound = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v, { errorLow: (d) => d.lo })]')))
    expect(oneBound.warnings).toEqual([
      '<PlotChart> mark 1: an error bar needs BOTH `errorLow` and `errorHigh`; the bound given alone is ignored (as on the web).',
    ])
    // The lone bound is dropped from the Series — but the OTHER mark shapes
    // in this file do emit errLow, so assert on this emit's own series line.
    const series = oneBound.code.split('\n').find((l) => l.includes('Series(kind = "bars"'))
    expect(series, 'the bars series line').toBeTypeOf('string')
    expect(series!).not.toContain('errLow =')
  })

  it('the shapes that DO lower emit their series without a word', () => {
    const ok = {
      band: plot('PlotChart, band', P('[band((d) => d.lo, (d) => d.hi)]')),
      bubble: plot('PlotChart, bubble', P('[bubble((d) => d.v, (d) => d.r, { minRadius: 4, maxRadius: 20 })]')),
      errorBars: plot('PlotChart, bars', P('[bars((d) => d.v, { errorLow: (d) => d.lo, errorHigh: (d) => d.hi })]')),
      xValue: plot('PlotChart, bars', `<PlotChart data={ROWS} x={(d) => d.m} xValue={(d) => d.v} marks={[bars((d) => d.v)]} height={200} />`),
      noX: plot('PlotChart, bars', `<PlotChart data={ROWS} marks={[bars((d) => d.v)]} height={200} />`),
      horizontal: plot('PlotChart, bars', P('[bars((d) => d.v)]', 'horizontal y2Domain={[0, 10]} width={300}')),
      formatter: plot('PlotChart, bars, compact', P('[bars((d) => d.v)]', 'format={compact}')),
      legend: plot('PlotChart, bars', P('[bars((d) => d.v)]', 'showLegend legendMaxRows={2}')),
      rtl: plot('PlotChart, bars', P('[bars((d) => d.v)]', 'rtl onSelect={(i: number) => { }}')),
    }
    for (const [name, src] of Object.entries(ok)) expect(kotlin(src).warnings, name).toEqual([])
    // Spot-check the ones with a distinctive emit rather than asserting all.
    expect(kotlin(ok.bubble).code).toContain('bubbleRadii(pyreonRRaw0, 4.0, 20.0)')
    expect(kotlin(ok.errorBars).code).toContain('errLow = pyreonErrLow0')
    expect(kotlin(ok.xValue).code).toContain('xValues = pyreonXValues')
    expect(kotlin(ok.noX).code).toContain('val pyreonCats: List<String> = listOf<String>()')
    expect(kotlin(ok.horizontal).code).toContain('horizontal = true')
    // A bare engine formatter becomes a Kotlin function reference.
    expect(kotlin(ok.formatter).code).toContain('yFormat = ::compact')
    // `rtl` mirrors the draw list AND the tap x.
    expect(kotlin(ok.rtl).code).toContain('pyreonMirrorCmds(')
  })

  it('a boolean spec prop follows a signal; a literal-only prop refuses one BY NAME and keeps drawing', () => {
    const dyn = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v)]', 'showGrid={w() > 1} showXAxis={false}')))
    expect(dyn.warnings).toEqual([])
    expect(dyn.code).toContain('showGrid = w > 1')
    expect(dyn.code).toContain('showXAxis = false')

    const lits = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v)]', 'yScale="log" yTime stackNormalize xTitle="T" yTitle="Y" xLabels="all"')))
    expect(lits.warnings).toEqual([])
    expect(lits.code).toContain('yScale = "log"')

    const bad = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v)]', 'yScale={w()}')))
    expect(bad.warnings).toEqual(['<PlotChart>: `yScale` must be a string literal on native; the prop is ignored.'])
    expect(bad.code).not.toContain('yScale =')
  })

  it('an INLINE tooltipFormatter is declined on Kotlin too — a named function lowers', () => {
    const inline = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v)]', 'tooltip tooltipFormatter={(c: { title: string }) => c.title}')))
    expect(inline.warnings).toEqual([
      '<PlotChart tooltipFormatter>: must be a NAMED function on native — an inline arrow is not lowered; the default lines apply.',
    ])
    const named = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v)]', 'tooltip tooltipFormatter={tip}'), 'function tip(c: { title: string }): string { return c.title }\n'))
    expect(named.warnings).toEqual([])
    expect(named.code).toContain('tip(tooltipAt(')
  })

  it('onZoom without a window is named — there would be nothing to report', () => {
    expect(warn(plot('PlotChart, bars', P('[bars((d) => d.v)]', 'onZoom={(a: number, b: number) => { }}')))).toEqual([
      '<PlotChart onZoom>: needs `dataZoom`, `zoomPresets` or `navigator` — without a window there is nothing to report.',
    ])
  })

  it.each([
    ['a binding rather than an inline array', 'zoomPresets={PRE}', 'const PRE: never[] = []\n'],
    ['an array of non-objects', 'zoomPresets={[1, 2]}', ''],
    ['an entry whose label is not a string literal', "zoomPresets={[{ label: 1, count: 30 }]}", ''],
  ])('refuses zoomPresets given as %s', (_why, attr, extra) => {
    expect(warn(plot('PlotChart, bars', P('[bars((d) => d.v)]', `dataZoom ${attr}`), extra))).toContain(
      '<PlotChart zoomPresets>: must be an inline array of `{ label, count }` literals on native; the chart renders without the preset strip.',
    )
  })

  it('a well-formed preset list bakes; an EMPTY one is simply absent, not an error', () => {
    const ok = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v)]', "dataZoom zoomPresets={[{ label: '1M', count: 30 }]}")))
    expect(ok.warnings).toEqual([])
    expect(ok.code).toContain('ZoomPreset(label = "1M", count = 30)')
    const empty = kotlin(plot('PlotChart, bars', P('[bars((d) => d.v)]', 'dataZoom zoomPresets={[]}')))
    expect(empty.warnings).toEqual([])
    expect(empty.code).not.toContain('ZoomPreset(')
  })
})

describe('<RadarChart> on Kotlin', () => {
  const radar = (jsx: string) => `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { RadarChart } from '@pyreon/charts'
interface S { name: string; vals: number[]; tint: string }
const SS: S[] = [{ name: 'a', vals: [1, 2, 3], tint: '#f00' }]
const AX: string[] = ['x', 'y', 'z']
const mk = () => (d: S) => d.vals
export function C() { const w = signal(300); return <Stack>${jsx}</Stack> }`

  it.each([
    ['no values accessor', `<RadarChart data={SS} axes={AX} />`, '<RadarChart>: needs a `values` accessor on native; emitting an empty Box().'],
    ['a values accessor that is not an arrow', `<RadarChart data={SS} axes={AX} values={mk()} />`, '<RadarChart values>: only a single-expression arrow'],
    ['a color accessor that is not an arrow', `<RadarChart data={SS} axes={AX} values={(d) => d.vals} color={mk()} />`, '<RadarChart color>: only a single-expression arrow'],
    ['a legend with no label accessor', `<RadarChart data={SS} axes={AX} values={(d) => d.vals} showLegend={true} />`, '<RadarChart showLegend>: needs a `label` accessor for the legend'],
    ['a legend label that is not an arrow', `<RadarChart data={SS} axes={AX} values={(d) => d.vals} showLegend={true} label={mk()} />`, '<RadarChart label>: only a single-expression arrow'],
  ])('declines %s', (_why, jsx, expected) => {
    const r = kotlin(radar(jsx))
    expect(r.warnings.join('\n')).toContain(expected)
    expect(r.code).toContain('Box {}')
  })

  it('rings and showLabels take a static literal, a dynamic expression, or the default', () => {
    const dflt = kotlin(radar(`<RadarChart data={SS} axes={AX} values={(d) => d.vals} />`)).code
    expect(dflt).toContain('RadarOptions(rings = 4,')
    expect(dflt).toContain('showLabels = true)')

    const stat = kotlin(radar(`<RadarChart data={SS} axes={AX} values={(d) => d.vals} rings={6} showLabels={false} />`)).code
    expect(stat).toContain('RadarOptions(rings = 6,')
    expect(stat).toContain('showLabels = false)')

    const dyn = kotlin(radar(`<RadarChart data={SS} axes={AX} values={(d) => d.vals} rings={w()} showLabels={w() > 1} />`)).code
    expect(dyn).toContain('RadarOptions(rings = w,')
    expect(dyn).toContain('showLabels = w > 1)')
  })

  it('an accessor-arrow height and a dynamic width both reach the layout unwrapped', () => {
    // `height={() => 300}` is the accessor spelling; a Kotlin lambda in that
    // position would render its toString rather than a number.
    const code = kotlin(radar(`<RadarChart data={SS} axes={AX} values={(d) => d.vals} height={() => 300} width={w()} />`)).code
    expect(code).toContain('(300).toDouble()')
    expect(code).toContain('(w).toDouble()')
    expect(code).not.toContain('val pyreonW = maxWidth.value.toDouble()')
  })

  it('a legend + explicit color emits the entries and stays silent', () => {
    const r = kotlin(radar(`<RadarChart data={SS} axes={AX} values={(d) => d.vals} color={(d) => d.tint} showLegend={true} label={(d) => d.name} width={300} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('LegendEntry(label = pyreonD.name, color = pyreonD.tint)')
  })
})

describe('the accessor hosts share the same shadow decline', () => {
  it('<PieChart value> naming its own parameter twice is refused rather than mis-substituted', () => {
    const r = kotlin(`import { Stack } from '@pyreon/primitives'
import { PieChart } from '@pyreon/charts'
interface Row { m: string; vs: number[] }
const ROWS: Row[] = [{ m: 'Jan', vs: [1, 2] }]
export function C() { return <Stack><PieChart data={ROWS} value={(d) => d.vs.map((d) => d).length} label={(d) => d.m} /></Stack> }`)
    expect(r.warnings).toEqual(['<PieChart value>: the accessor shadows its own parameter; emitting an empty Box().'])
    expect(r.code).toContain('Box {}')
  })
})

describe('the remaining frame-host declines and defaults on Kotlin', () => {
  const host = (imports: string, jsx: string) => `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { ${imports} } from '@pyreon/charts'
interface Row { m: string; v: number; lo: number; hi: number; o: number; h: number; l: number; c: number; vals: number[] }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 5, hi: 15, o: 1, h: 2, l: 0, c: 1, vals: [1, 2, 3] }]
const mk = () => (d: Row) => d.v
const handlers = { pick: (i: number) => { } }
export function C() { return <Stack>${jsx}</Stack> }`

  it.each([
    ['a band LOWER bound that is not an arrow', 'PlotChart, band', `<PlotChart data={ROWS} x={(d) => d.m} marks={[band(mk(), (d) => d.hi)]} height={200} />`, '<PlotChart> mark 1 lower bound: only a single-expression arrow'],
    ['a candlestick OHLC accessor that is not an arrow', 'CandlestickChart', `<CandlestickChart data={ROWS} open={mk()} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} />`, '<CandlestickChart open>: only a single-expression arrow'],
    ['a boxplot `values` that is not an arrow', 'BoxplotChart', `<BoxplotChart data={ROWS} values={mk()} />`, '<BoxplotChart values>: only a single-expression arrow'],
  ])('declines %s', (_why, imports, jsx, expected) => {
    const r = kotlin(host(imports, jsx))
    expect(r.warnings.join('\n')).toContain(expected)
    expect(r.code).toContain('Box {}')
  })

  it('an OMITTED `x` on boxplot/candlestick is legal — the category list is simply empty', () => {
    // `x` is the only optional accessor on these two; leaving it out must not
    // blank the chart, and the empty list has to be TYPED (Kotlin cannot infer
    // `List<String>` from `listOf()`).
    const box = kotlin(host('BoxplotChart', `<BoxplotChart data={ROWS} values={(d) => d.vals} animate={false} />`))
    expect(box.warnings).toEqual([])
    expect(box.code).toContain('val pyreonCats: List<String> = listOf<String>()')
    // animate={false} drops the entrance progress arguments.
    expect(box.code).not.toContain('pyreonEntrance')

    const cand = kotlin(host('CandlestickChart', `<CandlestickChart data={ROWS} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} />`))
    expect(cand.warnings).toEqual([])
    expect(cand.code).toContain('val pyreonCats: List<String> = listOf<String>()')
  })

  it('a heatmap with no `colors` falls back to the theme ramp', () => {
    const r = kotlin(host('HeatmapChart', `<HeatmapChart data={ROWS} x={(d) => d.m} y={(d) => d.m} value={(d) => d.v} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('pyreonTheme.ramp')
  })

  it('an onSelect that is a MEMBER expression is called with the hit index, like a bare name', () => {
    const r = kotlin(host('PieChart', `<PieChart data={ROWS} value={(d) => d.v} label={(d) => d.m} onSelect={handlers.pick} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('detectTapGestures { pyreonTap -> (handlers.pick)(hitArc(')
  })

  it('a table-driven host (the CHART_HOSTS family) lowers through the generic path', () => {
    const r = kotlin(`import { Stack } from '@pyreon/primitives'
import { SankeyChart } from '@pyreon/charts'
import type { SankeyNode, SankeyLink } from '@pyreon/charts'
const N: SankeyNode[] = []
const L: SankeyLink[] = []
export function C() { return <Stack><SankeyChart nodes={N} links={L} width={300} height={200} /></Stack> }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderSankey(')
  })

  it('a SIDE legend shifts the radar hit test by the chrome inset', () => {
    // With the legend on the left, a tap's x has to have the legend width
    // subtracted before it reaches the engine — an un-shifted hit selects the
    // wrong spoke, silently.
    const r = kotlin(`import { Stack } from '@pyreon/primitives'
import { RadarChart } from '@pyreon/charts'
interface S { name: string; vals: number[] }
const SS: S[] = [{ name: 'a', vals: [1, 2, 3] }]
const AX: string[] = ['x', 'y', 'z']
export function C() { return <Stack><RadarChart data={SS} axes={AX} values={(d) => d.vals} showLegend={true} label={(d) => d.name} legendPosition="left" onSelect={(i: number) => { }} /></Stack> }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toMatch(/hitRadarIndex\(.* - pyreonLegend\.left,/)
  })
})

describe('mark grammar — the last shapes', () => {
  const src = (jsx: string) => `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/engine'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 1 }]
const OPTS = { label: 'Base' }
const LOOSE = bars((d: Row) => d.v)
export function C() { return (<Stack>${jsx}</Stack>) }`
  const P = (marks: string) => `<PlotChart data={ROWS} x={(d) => d.m} marks={${marks}} height={200} />`

  it('a mark entry that is not a CALL at all is refused — a hoisted mark cannot be read', () => {
    // `marks={[LOOSE]}` looks reasonable but the emitter has to see the callee
    // to know which Series kind to build.
    expect(warn(src(P('[LOOSE]'))).join('\n')).toContain('<PlotChart> mark 1: this mark is not lowered on native; emitting an empty Box().')
  })

  it('mark options carrying a SPREAD are refused — the fields cannot be enumerated', () => {
    expect(warn(src(P('[bars((d) => d.v, { ...OPTS })]'))).join('\n')).toContain(
      '<PlotChart> mark 1: options must be an object literal on native; emitting an empty Box().',
    )
  })

  it('an accessor with more than the (d, i) pair is refused', () => {
    expect(warn(src(P('[bars((d, i, x) => d.v)]'))).join('\n')).toContain('<PlotChart> mark 1: only a single-expression arrow')
  })

  it('a correctly-typed option bakes into the Series — the positive twin of the literal-type refusal', () => {
    const r = kotlin(src(P(`[bars((d) => d.v, { label: 'Revenue' })]`)))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('label = "Revenue"')
  })
})

describe('chrome, options and accessor edge shapes', () => {
  const src = (jsx: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Scroll, For } from '@pyreon/primitives'
import { PieChart } from '@pyreon/charts'
import { PlotChart, bars, bubble } from '@pyreon/charts/engine'
interface Row { m: string; v: number; r: number }
const ROWS: Row[] = [{ m: 'Jan', v: 1, r: 2 }]
export function C() { return (<Stack>${jsx}</Stack>) }`

  it('a `showTitle` with NO legend still lays out chrome — the legend placement collapses to an empty one', () => {
    // Chrome is entered by EITHER a title or a legend; with only the title the
    // legend slot still has to exist, sized zero, or the plot rect maths below
    // it has nothing to subtract.
    const r = kotlin(src(`<PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v)]} title="T" showTitle height={200} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonLegend: LegendPlacement = LegendPlacement(cmds = listOf(), top = 0.0')
  })

  it('a bubble with NO options takes the default radius range rather than skipping the mark', () => {
    const r = kotlin(src(`<PlotChart data={ROWS} x={(d) => d.m} marks={[bubble((d) => d.v, (d) => d.r)]} height={200} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('bubbleRadii(pyreonRRaw0, 3.0, 18.0)')
  })

  it('a BLOCK-bodied arrow with no statements is still a single-expression accessor', () => {
    // `(d) => { }` parses with an empty statement list; the guard asks for a
    // NON-empty one, so this lowers rather than being refused.
    const r = kotlin(src(`<PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => { })]} height={200} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Series(kind = "bars"')
  })

  it('an accessor host WITH an explicit width drops the auto-width binding', () => {
    const r = kotlin(src(`<PieChart data={ROWS} value={(d) => d.v} label={(d) => d.m} width={200} height={200} />`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Modifier.width((200.0).dp)')
    expect(r.code).not.toContain('val pyreonW = maxWidth.value.toDouble()')
  })

  it('the lazy-list scan descends through a fragment that holds NO <For> and keeps looking', () => {
    const r = kotlin(src(`<Scroll><Text>a</Text><><Text>b</Text></><For each={ROWS} by={(r: Row) => r.m}>{(r: Row) => <Text>{r.m}</Text>}</For></Scroll>`))
    expect(r.warnings.some((w) => w.startsWith('<Scroll> with a <For> among OTHER children'))).toBe(true)
  })
})
