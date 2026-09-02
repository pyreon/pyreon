// `@pyreon/charts/plot` family hosts on native — `<SankeyChart>` and its
// siblings lower to `PyreonChartCanvas` walking the generated engine's draw
// list, sized by the container (GeometryReader / BoxWithConstraints) or by
// explicit `width` / `height`. The hosts whose props are accessor closures
// warn BY NAME. Compile-proven three ways: swiftc against the stub bundle
// (which pulls the REAL generated engine in when a chart host is present),
// swiftc against real SwiftUI + the real canvas, and kotlinc.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
  validateSwiftWithStubs,
} from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const SANKEY = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { SankeyChart } from '@pyreon/charts/plot'
import type { SankeyLink, SankeyNode } from '@pyreon/charts/plot'
export function Flows() {
  const nodes = signal<SankeyNode[]>([{ name: 'Coal' }, { name: 'Power' }, { name: 'Homes' }])
  const links = signal<SankeyLink[]>([{ source: 'Coal', target: 'Power', value: 10 }, { source: 'Power', target: 'Homes', value: 8 }])
  return (
    <Stack>
      <Text>Energy</Text>
      <SankeyChart nodes={nodes()} links={links()} height={240} data-testid="flows" title="Energy flows" />
    </Stack>
  )
}`

const GANTT = `import { Stack } from '@pyreon/primitives'
import { GanttChart } from '@pyreon/charts/plot'
import type { GanttTask } from '@pyreon/charts/plot'
const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: '2024-03-01', end: '2024-03-10', progress: 0.5 },
  { id: 'b', name: 'Build', start: '2024-03-08', end: '2024-03-24', dependencies: ['a'] },
]
export function Plan() {
  return (<Stack><GanttChart tasks={TASKS} /></Stack>)
}`

const SUNBURST = `import { Stack } from '@pyreon/primitives'
import { SunburstChart } from '@pyreon/charts/plot'
import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'root', value: 10 }]
export function Rings() {
  return (<Stack><SunburstChart data={DATA} width={200} height={200} innerRatio={0.3} /></Stack>)
}`

describe('chart hosts — Swift', () => {
  it('<SankeyChart> lowers to a GeometryReader-sized PyreonChartCanvas over renderSankey(layoutSankey(…)) with the web host box', () => {
    const r = transform(SANKEY, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('GeometryReader { pyreonGeo in')
    expect(r.code).toContain(
      'PyreonChartCanvas(cmds: renderSankey(layoutSankey(nodes, links, PyreonChartRect(x: 80.0, y: 8.0, w: max(0.0, Double(pyreonGeo.size.width) - 80.0 * 2.0), h: max(0.0, 240.0 - 16.0)), nil), nil))',
    )
    expect(r.code).toContain('}.frame(height: 240.0)')
    expect(r.code).toContain('.accessibilityLabel("Energy flows")')
    expect(r.code).toContain('.accessibilityIdentifier("flows")')
  })
  it('a host without height uses the web default; a module-const data prop is referenced', () => {
    const r = transform(GANTT, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderGantt(layoutGantt(TASKS, PyreonChartRect(x: 4.0, y: 4.0, w: Double(pyreonGeo.size.width) - 8.0, h: 320.0 - 8.0), nil), nil)')
    expect(r.code).toContain('.frame(height: 320.0)')
  })
  it('an explicit width skips the GeometryReader and frames both axes; sunburst derives its radii from the box', () => {
    const r = transform(SUNBURST, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('GeometryReader')
    expect(r.code).toContain('renderSunburst(layoutSunburst(DATA, max(0.0, min(200.0, 200.0) / 2.0 - 4.0) * 0.3, max(0.0, min(200.0, 200.0) / 2.0 - 4.0), nil), PyreonChartPt(x: 200.0 / 2.0, y: 200.0 / 2.0), nil)')
    expect(r.code).toContain('.frame(width: 200.0, height: 200.0)')
  })
  it('a missing data prop warns by name and emits an EmptyView', () => {
    const r = transform(
      `import { SankeyChart } from '@pyreon/charts/plot'
export function C() { return <SankeyChart nodes={[]} /> }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('<SankeyChart>: needs a `links` attribute on native')
    expect(r.code).toContain('EmptyView()')
  })
  it('a still-unlowered host (OptionChart) warns by name instead of naming a view that does not exist', () => {
    const r = transform(
      `import { OptionChart } from '@pyreon/charts/plot'
export function C() { return <OptionChart option={{ series: [] }} /> }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('<OptionChart> has no native lowering yet')
    expect(r.code).not.toContain('OptionChart(')
  })
  it('importing from @pyreon/charts/plot does not raise the web-only package warning', () => {
    const r = transform(SANKEY, { target: 'swift' })
    expect(r.warnings.some((w) => /web-only/i.test(w))).toBe(false)
  })
})

describe('chart hosts — Kotlin', () => {
  it('<SankeyChart> lowers to BoxWithConstraints + PyreonChartCanvas with fillMaxWidth().height(), testTag and the title as a content description', () => {
    const r = transform(SANKEY, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {')
    expect(r.code).toContain('val pyreonW = maxWidth.value.toDouble()')
    expect(r.code).toContain('renderSankey(layoutSankey(nodes, links, PyreonChartRect(80.0, 8.0, maxOf(0.0, pyreonW - 80.0 * 2.0), maxOf(0.0, 240.0 - 16.0)), null), null)')
    expect(r.code).toContain('modifier = Modifier.fillMaxWidth().height((240.0).dp).semantics { contentDescription = "Energy flows" }.testTag("flows")')
  })
  it('an explicit width sizes the canvas directly', () => {
    const r = transform(SUNBURST, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('BoxWithConstraints')
    expect(r.code).toContain('modifier = Modifier.width((200.0).dp).height((200.0).dp)')
    expect(r.code).toContain('minOf(200.0, 200.0) / 2.0 - 4.0')
  })
  it('a missing data prop warns and emits an empty Box', () => {
    const r = transform(
      `import { GraphChart } from '@pyreon/charts/plot'
export function C() { return <GraphChart links={[]} /> }`,
      { target: 'kotlin' },
    )
    expect(r.warnings.join('\n')).toContain('<GraphChart>: needs a `nodes` attribute on native')
    expect(r.code).toContain('Box {}')
  })
})

describe('chart hosts — compile-proven', () => {
  const swiftCode = () => [SANKEY, GANTT, SUNBURST].map((s) => transform(s, { target: 'swift' }).code).join('\n\n')
  it.skipIf(!isSwiftcAvailable())('swiftc against the stub bundle (which links the real generated engine when a chart host is present)', () => {
    const r = validateSwiftWithStubs(swiftCode())
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + the real canvas + the real engine', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + swiftCode())
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc against the stub bundle + the real generated engine', () => {
    for (const src of [SANKEY, GANTT, SUNBURST]) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})

const ONSELECT = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { SankeyChart, TreemapChart } from '@pyreon/charts/plot'
import type { SankeyHitIndex, SankeyLink, SankeyNode, TreeNode } from '@pyreon/charts/plot'
const CELLS: TreeNode[] = [{ name: 'a', value: 3 }, { name: 'b', value: 1 }]
function report(i: number) {
  return i
}
export function Picker() {
  const nodes = signal<SankeyNode[]>([{ name: 'Coal' }, { name: 'Power' }])
  const links = signal<SankeyLink[]>([{ source: 'Coal', target: 'Power', value: 10 }])
  const picked = signal(-1)
  const cell = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <SankeyChart nodes={nodes()} links={links()} height={240} onSelectIndex={(hit: SankeyHitIndex) => picked.set(hit.node)} />
      <TreemapChart data={CELLS} width={200} height={100} onSelectIndex={(i: number) => { cell.set(report(i)) }} />
    </Stack>
  )
}`

describe('chart hosts — onSelectIndex (tap → the engine index hit)', () => {
  it('Swift: a zero-distance drag whose location feeds hitXIndex over the same layout the canvas painted', () => {
    const r = transform(ONSELECT, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      '.contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onEnded { pyreonTap in let hit = hitSankeyIndex(layoutSankey(nodes, links, PyreonChartRect(x: 80.0, y: 8.0, w: max(0.0, Double(pyreonGeo.size.width) - 80.0 * 2.0), h: max(0.0, 240.0 - 16.0)), nil), Double(pyreonTap.location.x), Double(pyreonTap.location.y)); ({ picked = hit.node })() })',
    )
    expect(r.code).toContain('let i = hitTreemapIndex(layoutTreemap(CELLS, PyreonChartRect(x: 0.0, y: 0.0, w: 200.0, h: 100.0), nil), Double(pyreonTap.location.x), Double(pyreonTap.location.y))')
    expect(r.code).toContain('.frame(width: 200.0, height: 100.0)')
  })
  it('Kotlin: detectTapGestures over the same layout, the px tap divided by the density read in the enclosing scope', () => {
    const r = transform(ONSELECT, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonDensity = LocalDensity.current.density')
    expect(r.code).toContain(
      '.pointerInput(Unit) { detectTapGestures { pyreonTap -> val hit = hitSankeyIndex(layoutSankey(nodes, links, PyreonChartRect(80.0, 8.0, maxOf(0.0, pyreonW - 80.0 * 2.0), maxOf(0.0, 240.0 - 16.0)), null), (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble()); ({ picked = hit.node })() } }',
    )
    // An explicit-width host with a tap still gets the BoxWithConstraints scope (the density lives there).
    expect(r.code).toContain('val i = hitTreemapIndex(layoutTreemap(CELLS, PyreonChartRect(0.0, 0.0, 200.0, 100.0), null), (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble())')
  })
  it('a bare function reference is called with the hit', () => {
    const src = `import { Stack } from '@pyreon/primitives'
import { GanttChart } from '@pyreon/charts/plot'
import type { GanttTask } from '@pyreon/charts/plot'
const TASKS: GanttTask[] = [{ id: 'a', name: 'Design', start: '2024-03-01', end: '2024-03-10' }]
function chosen(i: number) {
  return i
}
export function Plan() {
  return (<Stack><GanttChart tasks={TASKS} onSelectIndex={chosen} /></Stack>)
}`
    expect(transform(src, { target: 'swift' }).code).toContain('pyreonTap in chosen(hitGanttIndex(layoutGantt(TASKS, ')
    expect(transform(src, { target: 'kotlin' }).code).toContain('pyreonTap -> chosen(hitGanttIndex(layoutGantt(TASKS, ')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts the tap emit', () => {
    const r = validateSwiftWithStubs(transform(ONSELECT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts the tap emit', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(ONSELECT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts the tap emit', () => {
    const r = validateKotlin(transform(ONSELECT, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const ACCESSOR = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { FunnelChart, GaugeChart, PieChart } from '@pyreon/charts/plot'
interface Stage { name: string; total: number; tint: string }
const STAGES: Stage[] = [{ name: 'Visit', total: 120, tint: '#111111' }, { name: 'Sign up', total: 48, tint: '#222222' }]
export function Sales() {
  const picked = signal(-1)
  const load = signal(42)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <FunnelChart data={STAGES} value={(d) => d.total} label={(d, i) => d.name} height={200} onSelect={(i: number) => picked.set(i)} />
      <PieChart data={STAGES} value={(d) => d.total} label={(d) => d.name} color={(d) => d.tint} innerRadius={0.4} width={200} height={200} />
      <GaugeChart value={load()} min={0} max={100} thickness={18} valueColor="#b45309" height={120} data-testid="gauge" />
    </Stack>
  )
}`

describe('chart hosts — accessor-prop hosts (Funnel / Pie) and Gauge', () => {
  it('Swift: rows map through the inlined accessors into the engine struct; absent color takes the palette; onSelect taps hitFunnel', () => {
    const r = transform(ACCESSOR, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'renderFunnel(STAGES.enumerated().map { (pyreonI, pyreonD) in FunnelStage(value: Double(pyreonD.total), label: pyreonD.name, color: ["#0f766e", "#b45309", "#1d4ed8", "#b42318", "#15803d", "#7c3aed"][pyreonI % 6]) }, PyreonChartRect(x: 8.0, y: 8.0, w: Double(pyreonGeo.size.width) - 16.0, h: 200.0 - 16.0), nil)',
    )
    expect(r.code).toContain('let i = hitFunnel(STAGES.enumerated().map { (pyreonI, pyreonD) in FunnelStage(')
    expect(r.code).toContain(
      'renderPie(STAGES.enumerated().map { (pyreonI, pyreonD) in Slice(value: Double(pyreonD.total), label: pyreonD.name, color: pyreonD.tint) }, PyreonChartRect(x: 0.0, y: 0.0, w: 200.0, h: 200.0), PieOptions(innerRadius: 0.4, showLabels: true, labelColor: "#ffffff", fontSize: 11.0))',
    )
    expect(r.code).toContain('renderGauge(Double(load), PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 120.0 * 2.0), GaugeOptions(min: 0.0, max: 100.0, sweep: Double.pi, thickness: 18.0, trackColor: "rgba(132,150,165,0.22)", valueColor: "#b45309")) + [PyreonDrawCmd(kind: "text", fill: "#10161d", text: plain(Double(load))')
    expect(r.code).toContain('.accessibilityIdentifier("gauge")')
  })
  it('Kotlin: mapIndexed with the same inlined accessors; the pie options and gauge text mirror Swift', () => {
    const r = transform(ACCESSOR, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderFunnel(STAGES.mapIndexed { pyreonI, pyreonD -> FunnelStage(value = (pyreonD.total).toDouble(), label = pyreonD.name, color = listOf("#0f766e", "#b45309", "#1d4ed8", "#b42318", "#15803d", "#7c3aed")[pyreonI % 6]) }, PyreonChartRect(8.0, 8.0, pyreonW - 16.0, 200.0 - 16.0), null)')
    expect(r.code).toContain('PieOptions(innerRadius = 0.4, showLabels = true, labelColor = "#ffffff", fontSize = 11.0)')
    expect(r.code).toContain('renderGauge((load).toDouble(), PyreonChartRect(0.0, 0.0, pyreonW, 120.0 * 2.0), GaugeOptions(min = 0.0, max = 100.0, sweep = Math.PI, thickness = 18.0, trackColor = "rgba(132,150,165,0.22)", valueColor = "#b45309")) + listOf(PyreonDrawCmd(kind = "text", fill = "#10161d", text = plain((load).toDouble())')
    expect(r.code).toContain('.testTag("gauge")')
  })
  it('a block-bodied accessor is reported by name; a pie legend now lowers', () => {
    const r = transform(
      `import { FunnelChart, PieChart } from '@pyreon/charts/plot'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function C() { return (<><FunnelChart data={ROWS} value={(d) => { const twice = d.v * 2; return twice }} label={(d) => d.n} /><PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} showLegend={true} /></>) }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('<FunnelChart value>: only a single-expression arrow')
    expect(r.warnings.join('\n')).not.toContain('showLegend')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts the accessor and gauge emits', () => {
    const r = validateSwiftWithStubs(transform(ACCESSOR, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts them', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(ACCESSOR, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts them', () => {
    const r = validateKotlin(transform(ACCESSOR, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

const FRAMES = `import { Stack } from '@pyreon/primitives'
import { CandlestickChart, HeatmapChart, RadarChart } from '@pyreon/charts/plot'
import type { RadarAxis } from '@pyreon/charts/plot'
interface Bar { day: string; o: number; h: number; l: number; c: number }
interface Cell { d: string; hour: string; n: number }
interface Team { name: string; scores: number[] }
const BARS: Bar[] = [{ day: 'Mon', o: 10, h: 12, l: 9, c: 11 }, { day: 'Tue', o: 11, h: 13, l: 10, c: 12 }]
const CELLS: Cell[] = [{ d: 'Mon', hour: '09', n: 3 }, { d: 'Mon', hour: '10', n: 5 }, { d: 'Tue', hour: '09', n: 1 }]
const TEAMS: Team[] = [{ name: 'A', scores: [3, 4, 5] }]
const AXES: RadarAxis[] = [{ label: 'x', max: 5 }, { label: 'y', max: 5 }, { label: 'z', max: 5 }]
export function Frames() {
  return (
    <Stack>
      <CandlestickChart data={BARS} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} x={(d) => d.day} height={180} onSelect={(i: number) => console.log(i)} />
      <HeatmapChart data={CELLS} x={(d) => d.hour} y={(d) => d.d} value={(d) => d.n} gap={2} width={240} height={160} data-testid="heat" />
      <RadarChart data={TEAMS} axes={AXES} values={(d) => d.scores} label={(d) => d.name} rings={3} height={220} title="Skills" />
    </Stack>
  )
}`

describe('chart hosts — cartesian-frame hosts (Candlestick / Heatmap) and Radar', () => {
  it('Swift: the candles, grid and radar series map through inlined accessors into the shared engine frames', () => {
    const r = transform(FRAMES, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonCandles: [Ohlc] = BARS.enumerated().map { (pyreonI, pyreonD) in Ohlc(open: pyreonChartDouble(pyreonD.o), high: pyreonChartDouble(pyreonD.h), low: pyreonChartDouble(pyreonD.l), close: pyreonChartDouble(pyreonD.c)) }')
    expect(r.code).toContain('let pyreonCats: [String] = BARS.enumerated().map { (pyreonI, pyreonD) in pyreonD.day }')
    expect(r.code).toContain(
      'renderCandlestickChart(pyreonCandles, Double(pyreonGeo.size.width), 180.0, pyreonCats, pyreonTheme, nil, pyreonChartMeasure)',
    )
    expect(r.code).toContain('let i = hitCandlestickChart(pyreonCandles, Double(pyreonGeo.size.width), 180.0, pyreonCats, pyreonTheme.fontSize, pyreonChartMeasure, Double(pyreonTap.location.x), Double(pyreonTap.location.y))')
    expect(r.code).toContain('let pyreonXs: [String] = CELLS.enumerated().map { (pyreonI, pyreonD) in pyreonD.hour }')
    expect(r.code).toContain('let pyreonVals: [Double] = CELLS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.n) }')
    expect(r.code).toContain('let pyreonGrid: HeatGrid = heatGridFrom(pyreonXs, pyreonYs, pyreonVals)')
    expect(r.code).toContain(
      'renderHeatChart(pyreonGrid, 240.0, 160.0, pyreonTheme, ["#eff6ff", "#93c5fd", "#3b82f6", "#1e40af"], 2.0, pyreonChartMeasure)',
    )
    expect(r.code).toContain('.accessibilityIdentifier("heat")')
    expect(r.code).toContain(
      'let pyreonSeries: [RadarSeries] = TEAMS.enumerated().map { (pyreonI, pyreonD) in RadarSeries(values: (pyreonD.scores).map { pyreonChartDouble($0) }, color: ["#0f766e", "#b45309", "#1d4ed8", "#b42318", "#15803d", "#7c3aed"][pyreonI % 6], fillAlpha: 0.25) }',
    )
    expect(r.code).toContain(
      'renderRadar(AXES, pyreonSeries, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 220.0), RadarOptions(rings: 3, gridColor: "rgba(132,150,165,0.35)", labelColor: "#5a6b7a", fontSize: 11.0, showLabels: true))',
    )
    expect(r.code).toContain('.accessibilityLabel("Skills")')
  })
  it('Kotlin: the same frames via mapIndexed and the function reference for the measurer', () => {
    const r = transform(FRAMES, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderCandlestickChart(pyreonCandles, pyreonW, 180.0, pyreonCats, pyreonTheme, null, ::pyreonChartMeasure)')
    expect(r.code).toContain('renderHeatChart(pyreonGrid, 240.0, 160.0, pyreonTheme, listOf("#eff6ff", "#93c5fd", "#3b82f6", "#1e40af"), 2.0, ::pyreonChartMeasure)')
    expect(r.code).toContain('RadarSeries(values = (pyreonD.scores).map { it.toDouble() }, color = listOf(')
    expect(r.code).toContain('RadarOptions(rings = 3, gridColor = "rgba(132,150,165,0.35)", labelColor = "#5a6b7a", fontSize = 11.0, showLabels = true)')
    expect(r.code).toContain('.testTag("heat")')
  })
  it('a cell-shaped heatmap onSelect is reported by name; a literal theme and a radar legend lower', () => {
    const r = transform(
      `import { CandlestickChart, HeatmapChart, RadarChart } from '@pyreon/charts/plot'
import type { RadarAxis } from '@pyreon/charts/plot'
interface Bar { o: number; h: number; l: number; c: number }
interface Cell { d: string; hour: string; n: number }
interface Team { name: string; scores: number[] }
const BARS: Bar[] = [{ o: 1, h: 2, l: 0, c: 1 }]
const CELLS: Cell[] = [{ d: 'a', hour: 'b', n: 1 }]
const TEAMS: Team[] = [{ name: 'A', scores: [1, 2, 3] }]
const AXES: RadarAxis[] = [{ label: 'x', max: 5 }, { label: 'y', max: 5 }, { label: 'z', max: 5 }]
export function C() { return (<><CandlestickChart data={BARS} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} theme={{ fontSize: 14 }} /><HeatmapChart data={CELLS} x={(d) => d.hour} y={(d) => d.d} value={(d) => d.n} onSelect={(c) => console.log(c)} /><RadarChart data={TEAMS} axes={AXES} values={(d) => d.scores} label={(d) => d.name} showLegend={true} /></>) }`,
      { target: 'swift' },
    )
    const w = r.warnings.join('\n')
    expect(w).not.toContain('<CandlestickChart theme>')
    expect(w).toContain('<HeatmapChart onSelect>: the cell-shaped callback is not lowered')
    expect(w).not.toContain('showLegend')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine + measurer) accepts the frame emits', () => {
    const r = validateSwiftWithStubs(transform(FRAMES, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts them', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(FRAMES, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine + measurer) accepts them', () => {
    const r = validateKotlin(transform(FRAMES, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const PLOT = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, area, bars, line } from '@pyreon/charts/plot'
import type { Annotation } from '@pyreon/charts/plot'
interface Month { name: string; revenue: number; cost: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8 }, { name: 'Feb', revenue: 15, cost: 9 }, { name: 'Mar', revenue: 11, cost: 10 }]
const GOAL: Annotation[] = [{ y: 14, label: 'goal', color: '#b42318' }]
export function Revenue() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <PlotChart
        data={MONTHS}
        x={(d) => d.name}
        marks={[bars((d) => d.revenue, { label: 'Revenue', color: '#0f766e' }), line((d) => d.cost, { label: 'Cost', width: 3 })]}
        annotations={GOAL}
        showGrid={false}
        height={180}
        title="Revenue by month"
        onSelect={(i: number) => picked.set(i)}
        data-testid="revenue"
      />
      <PlotChart data={MONTHS} marks={[area((d, i) => d.cost + i)]} width={240} height={120} />
    </Stack>
  )
}`

describe('chart hosts — <PlotChart marks> (the cartesian family)', () => {
  it('Swift: each mark becomes a Series over an inlined accessor; the spec is built inline; onSelect taps plotHitBars', () => {
    const r = transform(PLOT, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonValues0: [Double] = MONTHS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.revenue) }')
    expect(r.code).toContain('let pyreonValues1: [Double] = MONTHS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.cost) }')
    expect(r.code).toContain(
      'let pyreonSeries: [Series] = [Series(kind: "bars", values: pyreonValues0, color: "#0f766e", width: 2.0, radius: 3.0, label: "Revenue", showValues: false), Series(kind: "line", values: pyreonValues1, color: "#b45309", width: 3.0, radius: 3.0, label: "Cost", showValues: false)]',
    )
    expect(r.code).toContain('let pyreonCats: [String] = MONTHS.enumerated().map { (pyreonI, pyreonD) in pyreonD.name }')
    expect(r.code).toContain(
      'let pyreonSpec: ChartSpec = ChartSpec(width: Double(pyreonGeo.size.width), height: 180.0, series: pyreonSeries, categories: pyreonCats, theme: ChartTheme(axis: "#8496a5", grid: "rgba(132,150,165,0.18)", label: "#5a6b7a", fontSize: 11.0), showXAxis: true, showYAxis: true, showGrid: false, annotations: GOAL)',
    )
    expect(r.code).toContain('PyreonChartCanvas(cmds: renderChart(pyreonSpec, pyreonChartMeasure))')
    expect(r.code).toContain('let i = plotHitBars(pyreonSpec, pyreonChartMeasure, Double(pyreonTap.location.x), Double(pyreonTap.location.y))')
    expect(r.code).toContain('.accessibilityLabel("Revenue by month")')
    expect(r.code).toContain('.accessibilityIdentifier("revenue")')
    // The second chart: an index-using accessor, no x, a given width (Group, no reader).
    expect(r.code).toContain('let pyreonValues0: [Double] = MONTHS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.cost + pyreonI) }')
    expect(r.code).toContain('let pyreonCats: [String] = []')
    expect(r.code).toContain('Series(kind: "area", values: pyreonValues0, color: "#0f766e", width: 2.0, radius: 3.0, label: "Series 1", showValues: false)')
    expect(r.code).toContain('ChartSpec(width: 240.0, height: 120.0, series: pyreonSeries, categories: pyreonCats,')
  })
  it('Kotlin: the same series and spec as named-argument data classes', () => {
    const r = transform(PLOT, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonValues0: List<Double> = MONTHS.mapIndexed { pyreonI, pyreonD -> (pyreonD.revenue).toDouble() }')
    expect(r.code).toContain(
      'val pyreonSeries: List<Series> = listOf(Series(kind = "bars", values = pyreonValues0, color = "#0f766e", width = 2.0, radius = 3.0, label = "Revenue", showValues = false), Series(kind = "line", values = pyreonValues1, color = "#b45309", width = 3.0, radius = 3.0, label = "Cost", showValues = false))',
    )
    expect(r.code).toContain(
      'val pyreonSpec: ChartSpec = ChartSpec(width = pyreonW, height = 180.0, series = pyreonSeries, categories = pyreonCats, theme = ChartTheme(axis = "#8496a5", grid = "rgba(132,150,165,0.18)", label = "#5a6b7a", fontSize = 11.0), showXAxis = true, showYAxis = true, showGrid = false, annotations = GOAL)',
    )
    expect(r.code).toContain('PyreonChartCanvas(cmds = renderChart(pyreonSpec, ::pyreonChartMeasure)')
    expect(r.code).toContain('val i = plotHitBars(pyreonSpec, ::pyreonChartMeasure, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble())')
    expect(r.code).toContain('.testTag("revenue")')
    expect(r.code).toContain('Series(kind = "area", values = pyreonValues0, color = "#0f766e", width = 2.0, radius = 3.0, label = "Series 1", showValues = false)')
  })
  it('a curve option and a non-literal marks array are reported by name; a bubble mark lowers; brush (every prop now) stays quiet', () => {
    const r = transform(
      `import { PlotChart, bubble, line, monotoneCurve } from '@pyreon/charts/plot'
interface Row { n: string; v: number; r: number }
const ROWS: Row[] = [{ n: 'a', v: 1, r: 2 }]
const MARKS = [line((d: Row) => d.v)]
export function C() { return (<><PlotChart data={ROWS} marks={[bubble((d) => d.v, (d) => d.r)]} /><PlotChart data={ROWS} marks={[line((d) => d.v, { curve: monotoneCurve })]} showLegend={true} brush={true} /><PlotChart data={ROWS} marks={MARKS} /></>) }`,
      { target: 'swift' },
    )
    const w = r.warnings.join('\n')
    expect(w).not.toContain('bubble')
    expect(w).toContain('<PlotChart> mark 1: a `curve` callback is not lowered')
    // Every PlotChart prop lowers now; the by-name warning list is empty and must stay silent.
    expect(w).not.toContain('is not lowered on native yet')
    expect(w).toContain('<PlotChart marks>: must be an inline array of mark calls')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine + measurer) accepts the plot emit', () => {
    const r = validateSwiftWithStubs(transform(PLOT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(PLOT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine + measurer) accepts it', () => {
    const r = validateKotlin(transform(PLOT, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const CHROME = `import { Stack } from '@pyreon/primitives'
import { PieChart, PlotChart, RadarChart, bars, line } from '@pyreon/charts/plot'
import type { RadarAxis } from '@pyreon/charts/plot'
interface Month { name: string; revenue: number; cost: number }
interface Team { name: string; scores: number[]; share: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8 }, { name: 'Feb', revenue: 15, cost: 9 }]
const TEAMS: Team[] = [{ name: 'A', scores: [3, 4, 5], share: 60 }, { name: 'B', scores: [5, 2, 4], share: 40 }]
const AXES: RadarAxis[] = [{ label: 'x', max: 5 }, { label: 'y', max: 5 }, { label: 'z', max: 5 }]
export function Chrome() {
  return (
    <Stack>
      <PlotChart data={MONTHS} x={(d) => d.name} marks={[bars((d) => d.revenue, { label: 'Revenue' }), line((d) => d.cost, { label: 'Cost' })]} showLegend={true} showTitle={true} title="Revenue" subtitle="by month" legendMaxRows={2} height={220} onSelect={(i: number) => console.log(i)} />
      <PieChart data={TEAMS} value={(d) => d.share} label={(d) => d.name} showLegend={true} width={240} height={200} onSelect={(i: number) => console.log(i)} />
      <RadarChart data={TEAMS} axes={AXES} values={(d) => d.scores} label={(d) => d.name} showLegend={true} height={240} />
    </Stack>
  )
}`

describe('chart hosts — legend + title chrome (Plot / Pie / Radar)', () => {
  it('Swift: the title block, then the legend, then the plot shifted down by both; the tap subtracts the same offset', () => {
    const r = transform(CHROME, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonTitle: TitleLayout = renderTitle("Revenue", "by month", PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 220.0), TitleOptions(fontSize: 15.0, color: "#5a6b7a", align: "start"))')
    expect(r.code).toContain('let pyreonLegend: LegendLayout = renderLegend(pyreonSeriesAll.enumerated().map { (pyreonI, pyreonS) in LegendEntry(label: pyreonS.label, color: pyreonS.color, muted: pyreonHidden.contains(pyreonI)) }, PyreonChartRect(x: 0.0, y: pyreonTitle.height, w: Double(pyreonGeo.size.width), h: 220.0 - pyreonTitle.height), LegendOptions(fontSize: 11.0, labelColor: "#5a6b7a", swatch: 10.0, gap: 12.0, orientation: "horizontal", maxRows: 2.0, page: pyreonLegendPage), pyreonChartMeasure)')
    expect(r.code).toContain('let pyreonTop: Double = pyreonTitle.height + pyreonLegend.height')
    expect(r.code).toContain('ChartSpec(width: Double(pyreonGeo.size.width), height: 220.0 - pyreonTop, series: pyreonSeries')
    expect(r.code).toContain('PyreonChartCanvas(cmds: pyreonTitle.cmds + pyreonLegend.cmds + pyreonShiftCmds(renderChart(pyreonSpec, pyreonChartMeasure), pyreonTop))')
    expect(r.code).toContain('plotHitBars(pyreonSpec, pyreonChartMeasure, Double(pyreonTap.location.x), Double(pyreonTap.location.y) - pyreonTop)')
    // Pie: slices hoisted so the legend and the arcs share one list; no title block (the pie has no showTitle).
    expect(r.code).toContain('let pyreonItems: [Slice] = TEAMS.enumerated().map { (pyreonI, pyreonD) in Slice(value: Double(pyreonD.share), label: pyreonD.name, color:')
    expect(r.code).toContain('let pyreonTitle: TitleLayout = TitleLayout(cmds: [], height: 0.0)')
    expect(r.code).toContain('renderLegend(pyreonItems.map { LegendEntry(label: $0.label, color: $0.color) }, PyreonChartRect(x: 0.0, y: pyreonTitle.height, w: 240.0, h: 200.0 - pyreonTitle.height)')
    expect(r.code).toContain('pyreonShiftCmds(renderPie(pyreonItems, PyreonChartRect(x: 0.0, y: 0.0, w: 240.0, h: 200.0 - pyreonTop), PieOptions(')
    expect(r.code).toContain('fitCircle(PyreonChartRect(x: 0.0, y: 0.0, w: 240.0, h: 200.0 - pyreonTop)).radius * 0.0, PyreonChartPt(x: Double(pyreonTap.location.x), y: Double(pyreonTap.location.y) - pyreonTop))')
    // Radar: legend entries from the label accessor and the same palette the series use.
    expect(r.code).toContain('renderLegend(TEAMS.enumerated().map { (pyreonI, pyreonD) in LegendEntry(label: pyreonD.name, color: ["#0f766e", "#b45309", "#1d4ed8", "#b42318", "#15803d", "#7c3aed"][pyreonI % 6]) }')
    expect(r.code).toContain('pyreonShiftCmds(renderRadar(AXES, pyreonSeries, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 240.0 - pyreonTop), RadarOptions(')
  })
  it('Kotlin: the same chrome with the runtime shift', () => {
    const r = transform(CHROME, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonTitle: TitleLayout = renderTitle("Revenue", "by month", PyreonChartRect(0.0, 0.0, pyreonW, 220.0), TitleOptions(fontSize = 15.0, color = "#5a6b7a", align = "start"))')
    expect(r.code).toContain('val pyreonLegend: LegendLayout = renderLegend(pyreonSeriesAll.mapIndexed { pyreonI, pyreonS -> LegendEntry(label = pyreonS.label, color = pyreonS.color, muted = pyreonHidden.contains(pyreonI)) }, PyreonChartRect(0.0, pyreonTitle.height, pyreonW, 220.0 - pyreonTitle.height), LegendOptions(fontSize = 11.0, labelColor = "#5a6b7a", swatch = 10.0, gap = 12.0, orientation = "horizontal", maxRows = 2.0, page = pyreonLegendPage), ::pyreonChartMeasure)')
    expect(r.code).toContain('PyreonChartCanvas(cmds = pyreonTitle.cmds + pyreonLegend.cmds + pyreonShiftCmds(renderChart(pyreonSpec, ::pyreonChartMeasure), pyreonTop)')
    expect(r.code).toContain('plotHitBars(pyreonSpec, ::pyreonChartMeasure, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble() - pyreonTop)')
    expect(r.code).toContain('val pyreonItems: List<Slice> = TEAMS.mapIndexed { pyreonI, pyreonD -> Slice(')
    expect(r.code).toContain('pyreonShiftCmds(renderPie(pyreonItems, PyreonChartRect(0.0, 0.0, 240.0, 200.0 - pyreonTop), PieOptions(')
    expect(r.code).toContain('pyreonShiftCmds(renderRadar(AXES, pyreonSeries, PyreonChartRect(0.0, 0.0, pyreonW, 240.0 - pyreonTop), RadarOptions(')
  })
  it('without the flags the hosts emit exactly what they did before (no lets, no shift)', () => {
    const r = transform(PLOT, { target: 'swift' })
    expect(r.code).not.toContain('pyreonShiftCmds')
    expect(r.code).not.toContain('pyreonTop')
    const p = transform(ACCESSOR, { target: 'swift' })
    expect(p.code).not.toContain('pyreonItems')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine + shift) accepts the chrome emits', () => {
    const r = validateSwiftWithStubs(transform(CHROME, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts them', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(CHROME, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine + shift) accepts them', () => {
    const r = validateKotlin(transform(CHROME, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const PROPS = `import { Stack } from '@pyreon/primitives'
import { CandlestickChart, PlotChart, bubble, bars, compact, fixed, plain } from '@pyreon/charts/plot'
interface City { name: string; pop: number; area: number; growth: number }
interface Bar { day: string; o: number; h: number; l: number; c: number }
const CITIES: City[] = [{ name: 'A', pop: 8, area: 100, growth: 3 }, { name: 'B', pop: 3, area: 40, growth: -1 }]
const BARS: Bar[] = [{ day: 'Mon', o: 10, h: 12, l: 9, c: 11 }]
export function Props() {
  return (
    <Stack>
      <PlotChart data={CITIES} x={(d) => d.name} marks={[bars((d) => d.pop, { label: 'Population' }), bubble((d) => d.growth, (d) => d.area, { label: 'Area', minRadius: 4, maxRadius: 20, axis: 'right' })]} theme={{ label: '#222222', fontSize: 12 }} format={compact} xFormat={fixed(1)} y2Format={(v) => plain(v) + '%'} height={200} />
      <CandlestickChart data={BARS} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} theme={{ grid: '#eeeeee' }} height={160} />
    </Stack>
  )
}`

describe('chart hosts — theme overrides, formatters and bubble marks', () => {
  it('Swift: a literal theme merges over the default; formatters lower by name, factory call or closure; a bubble mark carries area-mapped radii', () => {
    const r = transform(PROPS, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('theme: ChartTheme(axis: "#8496a5", grid: "rgba(132,150,165,0.18)", label: "#222222", fontSize: 12.0), showXAxis: true, showYAxis: true, showGrid: true, yFormat: compact, xFormat: fixed(1), y2Format: { v in plain(v) + "%" })')
    expect(r.code).toContain('let pyreonRadii1: [Double] = bubbleRadii(CITIES.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.area) }, 4.0, 20.0)')
    expect(r.code).toContain('Series(kind: "points", values: pyreonValues1, color: "#b45309", width: 2.0, radius: 3.0, label: "Area", showValues: false, radii: pyreonRadii1, axis: "right")')
    expect(r.code).toContain('let pyreonTheme: ChartTheme = ChartTheme(axis: "#8496a5", grid: "#eeeeee", label: "#5a6b7a", fontSize: 11.0)')
    expect(r.code).toContain('renderCandlestickChart(pyreonCandles, Double(pyreonGeo.size.width), 160.0, pyreonCats, pyreonTheme, nil, pyreonChartMeasure)')
  })
  it('Kotlin: the same, with a bare formatter as a function reference', () => {
    const r = transform(PROPS, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('theme = ChartTheme(axis = "#8496a5", grid = "rgba(132,150,165,0.18)", label = "#222222", fontSize = 12.0), showXAxis = true, showYAxis = true, showGrid = true, yFormat = ::compact, xFormat = fixed(1), y2Format = { v -> plain(v) + "%" })')
    expect(r.code).toContain('val pyreonRadii1: List<Double> = bubbleRadii(CITIES.mapIndexed { pyreonI, pyreonD -> (pyreonD.area).toDouble() }, 4.0, 20.0)')
    expect(r.code).toContain('Series(kind = "points", values = pyreonValues1, color = "#b45309", width = 2.0, radius = 3.0, label = "Area", showValues = false, radii = pyreonRadii1, axis = "right")')
    expect(r.code).toContain('val pyreonTheme: ChartTheme = ChartTheme(axis = "#8496a5", grid = "#eeeeee", label = "#5a6b7a", fontSize = 11.0)')
  })
  it('a non-literal theme keeps the default and says so', () => {
    const r = transform(
      `import { PlotChart, bars } from '@pyreon/charts/plot'
interface Row { v: number }
const ROWS: Row[] = [{ v: 1 }]
const DARK = { label: '#fff' }
export function C() { return <PlotChart data={ROWS} marks={[bars((d) => d.v)]} theme={DARK} /> }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('<PlotChart theme>: only an object literal with literal fields lowers on native')
    expect(r.code).toContain('theme: ChartTheme(axis: "#8496a5", grid: "rgba(132,150,165,0.18)", label: "#5a6b7a", fontSize: 11.0)')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts the theme, formatter and bubble emits', () => {
    const r = validateSwiftWithStubs(transform(PROPS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts them', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(PROPS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts them', () => {
    const r = validateKotlin(transform(PROPS, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const ZOOM = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, bars, line } from '@pyreon/charts/plot'
interface Day { label: string; hits: number; avg: number }
const DAYS: Day[] = [{ label: 'Mon', hits: 3, avg: 2 }, { label: 'Tue', hits: 5, avg: 3 }, { label: 'Wed', hits: 2, avg: 3 }, { label: 'Thu', hits: 7, avg: 4 }]
export function Traffic() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <PlotChart data={DAYS} x={(d) => d.label} marks={[bars((d) => d.hits), line((d, i) => d.avg + i)]} dataZoom={true} height={200} onSelect={(i: number) => picked.set(i)} />
    </Stack>
  )
}`

describe('chart hosts — <PlotChart dataZoom> as pinch + pan over a fraction window', () => {
  it('Swift: the host registers two @State windows on the component, slices the rows, keeps GLOBAL indices, and adds the gestures', () => {
    const r = transform(ZOOM, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var pyreonZoom: ZoomWindow = ZoomWindow(start: 0.0, end: 1.0)')
    expect(r.code).toContain('@State private var pyreonZoomAnchor: ZoomWindow = ZoomWindow(start: 0.0, end: 1.0)')
    // The state sits on the struct, before `var body` — not inside the builder.
    expect(r.code.indexOf('@State private var pyreonZoom')).toBeLessThan(r.code.indexOf('var body: some View'))
    expect(r.code).toContain('let pyreonRange: SliceRange = sliceRange(pyreonZoom, DAYS.count)')
    expect(r.code).toContain('let pyreonRows = Array(DAYS[pyreonRange.from..<pyreonRange.to])')
    expect(r.code).toContain('let pyreonValues1: [Double] = pyreonRows.enumerated().map { (pyreonJ, pyreonD) -> Double in let pyreonI = pyreonJ + pyreonRange.from; return pyreonChartDouble(pyreonD.avg + pyreonI) }')
    expect(r.code).toContain('let pyreonCats: [String] = pyreonRows.enumerated().map { (_, pyreonD) -> String in pyreonD.label }')
    expect(r.code).toContain('.simultaneousGesture(MagnificationGesture().onChanged { pyreonScale in pyreonZoom = zoomWindow(pyreonZoomAnchor, 1.0 / Double(pyreonScale), 0.5) }.onEnded { _ in pyreonZoomAnchor = pyreonZoom })')
    expect(r.code).toContain('.simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { pyreonDrag in pyreonZoom = panWindow(pyreonZoomAnchor, -Double(pyreonDrag.translation.width) / Double(pyreonGeo.size.width)) }.onEnded { _ in pyreonZoomAnchor = pyreonZoom })')
    expect(r.code).toContain('if abs(pyreonTap.translation.width) < 6.0 && abs(pyreonTap.translation.height) < 6.0 { let i = { () -> Int in let pyreonHit = plotHitBars(pyreonSpec, pyreonChartMeasure, Double(pyreonTap.location.x), Double(pyreonTap.location.y)); return pyreonHit < 0 ? -1 : pyreonHit + pyreonRange.from }()')
  })
  it('Kotlin: the window is remembered in the host, the rows are a subList, and detectTransformGestures drives pan + zoom incrementally', () => {
    const r = transform(ZOOM, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var pyreonZoom by remember { mutableStateOf(ZoomWindow(start = 0.0, end = 1.0)) }')
    expect(r.code).toContain('val pyreonRange: SliceRange = sliceRange(pyreonZoom, DAYS.size)')
    expect(r.code).toContain('val pyreonRows = DAYS.subList(pyreonRange.from, pyreonRange.to)')
    expect(r.code).toContain('val pyreonValues1: List<Double> = pyreonRows.mapIndexed { pyreonJ, pyreonD -> val pyreonI = pyreonJ + pyreonRange.from; (pyreonD.avg + pyreonI).toDouble() }')
    expect(r.code).toContain('.pointerInput(Unit) { detectTransformGestures { _, pyreonPan, pyreonZoomBy, _ -> pyreonZoom = panWindow(zoomWindow(pyreonZoom, 1.0 / pyreonZoomBy.toDouble(), 0.5), -(pyreonPan.x / pyreonDensity).toDouble() / pyreonW) } }')
    expect(r.code).toContain('run { val pyreonHit = plotHitBars(pyreonSpec, ::pyreonChartMeasure, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble()); if (pyreonHit < 0) -1 else pyreonHit + pyreonRange.from }')
  })
  it('without dataZoom the plot host emits exactly what it did before (no state, no slice, no gestures)', () => {
    const r = transform(PLOT, { target: 'swift' })
    expect(r.code).not.toContain('pyreonZoom')
    expect(r.code).not.toContain('pyreonRange')
    expect(r.code).not.toContain('MagnificationGesture')
    const k = transform(PLOT, { target: 'kotlin' })
    expect(k.code).not.toContain('detectTransformGestures')
  })
  it('two zoomed hosts in one component get one pair of state properties each (the collector drains per component)', () => {
    const r = transform(ZOOM.replace('<PlotChart data', '<PlotChart data={DAYS} marks={[bars((d) => d.hits)]} dataZoom={true} height={100} /><PlotChart data'), { target: 'swift' })
    expect(r.code.split('@State private var pyreonZoom:').length - 1).toBe(2)
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine + gestures) accepts the dataZoom emit', () => {
    const r = validateSwiftWithStubs(transform(ZOOM, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(ZOOM, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine + gestures) accepts it', () => {
    const r = validateKotlin(transform(ZOOM, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const PRESETS = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/plot'
interface Day { label: string; hits: number }
const DAYS: Day[] = [{ label: 'Mon', hits: 3 }, { label: 'Tue', hits: 5 }, { label: 'Wed', hits: 2 }, { label: 'Thu', hits: 7 }]
export function Traffic() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <PlotChart data={DAYS} x={(d) => d.label} marks={[bars((d) => d.hits)]} zoomPresets={[{ label: 'last 2', count: 2 }, { label: 'all', count: 0 }]} height={200} onSelect={(i: number) => picked.set(i)} />
    </Stack>
  )
}`

const PRESETS_NO_SELECT = PRESETS.replace(' onSelect={(i: number) => picked.set(i)}', '')
const PRESETS_ZOOMED = PRESETS.replace('zoomPresets={', 'dataZoom={true} zoomPresets={')
const PRESETS_BY_REF = PRESETS.replace("zoomPresets={[{ label: 'last 2', count: 2 }, { label: 'all', count: 0 }]}", 'zoomPresets={RANGES}').replace(
  'export function Traffic()',
  "const RANGES = [{ label: 'last 2', count: 2 }]\nexport function Traffic()",
)

describe('chart hosts — <PlotChart zoomPresets> as the engine-laid-out preset strip', () => {
  it('Swift: the strip is renderPresets over the host window; a tap that lands on a button writes presetWindow, anything else selects', () => {
    const r = transform(PRESETS, { target: 'swift' })
    expect(r.warnings).toEqual([])
    // Presets bring the window state (no gesture anchor — there is no pinch).
    expect(r.code).toContain('@State private var pyreonZoom: ZoomWindow = ZoomWindow(start: 0.0, end: 1.0)')
    expect(r.code).not.toContain('pyreonZoomAnchor')
    expect(r.code).toContain('let pyreonRange: SliceRange = sliceRange(pyreonZoom, DAYS.count)')
    expect(r.code).toContain('let pyreonPresets: [ZoomPreset] = [ZoomPreset(label: "last 2", count: 2), ZoomPreset(label: "all", count: 0)]')
    expect(r.code).toContain(
      'let pyreonPresetStrip: PresetLayout = renderPresets(pyreonPresets, DAYS.count, pyreonZoom, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 200.0), PresetOptions(fontSize: 11.0, padX: 8.0, padY: 3.0, gap: 6.0, inset: 8.0, activeFill: pyreonTheme.axis, idleFill: pyreonTheme.grid, activeText: "#ffffff", idleText: pyreonTheme.label), pyreonChartMeasure)',
    )
    // The plot gives the strip its height; the strip's commands ride behind the plot's.
    expect(r.code).toContain('height: 200.0 - pyreonPresetStrip.height')
    expect(r.code).toContain('PyreonChartCanvas(cmds: renderChart(pyreonSpec, pyreonChartMeasure) + pyreonPresetStrip.cmds)')
    expect(r.code).toContain(
      'let pyreonPreset = presetHit(pyreonPresetStrip.boxes, Double(pyreonTap.location.x), Double(pyreonTap.location.y)); if pyreonPreset >= 0 { pyreonZoom = presetWindow(pyreonPresets[pyreonPreset].count, DAYS.count) } else {',
    )
    expect(r.code).not.toContain('MagnificationGesture')
  })
  it('Kotlin: the same strip over the remembered window; the tap branches on presetHit', () => {
    const r = transform(PRESETS, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var pyreonZoom by remember { mutableStateOf(ZoomWindow(start = 0.0, end = 1.0)) }')
    expect(r.code).toContain('val pyreonPresets: List<ZoomPreset> = listOf(ZoomPreset(label = "last 2", count = 2), ZoomPreset(label = "all", count = 0))')
    expect(r.code).toContain(
      'val pyreonPresetStrip: PresetLayout = renderPresets(pyreonPresets, DAYS.size, pyreonZoom, PyreonChartRect(0.0, 0.0, pyreonW, 200.0), PresetOptions(fontSize = 11.0, padX = 8.0, padY = 3.0, gap = 6.0, inset = 8.0, activeFill = pyreonTheme.axis, idleFill = pyreonTheme.grid, activeText = "#ffffff", idleText = pyreonTheme.label), ::pyreonChartMeasure)',
    )
    expect(r.code).toContain('height = 200.0 - pyreonPresetStrip.height')
    expect(r.code).toContain(
      'val pyreonPreset = presetHit(pyreonPresetStrip.boxes, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble()); if (pyreonPreset >= 0) { pyreonZoom = presetWindow(pyreonPresets[pyreonPreset].count, DAYS.size) } else {',
    )
    expect(r.code).not.toContain('detectTransformGestures')
  })
  it('presets without onSelect still get a tap (there is a button to press) and no selection branch', () => {
    const s = transform(PRESETS_NO_SELECT, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('DragGesture(minimumDistance: 0).onEnded { pyreonTap in let pyreonPreset = presetHit(')
    expect(s.code).not.toContain(' else {')
    const k = transform(PRESETS_NO_SELECT, { target: 'kotlin' })
    expect(k.warnings).toEqual([])
    expect(k.code).toContain('detectTapGestures { pyreonTap -> val pyreonPreset = presetHit(')
    expect(k.code).not.toContain(' else {')
  })
  it('with dataZoom too, a preset tap re-anchors the pinch window and the gestures stay', () => {
    const s = transform(PRESETS_ZOOMED, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('pyreonZoom = presetWindow(pyreonPresets[pyreonPreset].count, DAYS.count); pyreonZoomAnchor = pyreonZoom }')
    expect(s.code).toContain('MagnificationGesture()')
    const k = transform(PRESETS_ZOOMED, { target: 'kotlin' })
    expect(k.warnings).toEqual([])
    expect(k.code).toContain('detectTransformGestures')
  })
  it('a non-literal zoomPresets value warns BY NAME and renders the chart without the strip', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PRESETS_BY_REF, { target })
      expect(r.warnings).toEqual(['<PlotChart zoomPresets>: must be an inline array of `{ label, count }` literals on native; the chart renders without the preset strip.'])
      expect(r.code).not.toContain('pyreonPreset')
      expect(r.code).toContain('plotHitBars(pyreonSpec, ')
    }
  })
  it('without zoomPresets the plot host emits exactly what it did before', () => {
    expect(transform(PLOT, { target: 'swift' }).code).not.toContain('pyreonPreset')
    expect(transform(PLOT, { target: 'kotlin' }).code).not.toContain('pyreonPreset')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts the preset-strip emit', () => {
    const r = validateSwiftWithStubs(transform(PRESETS_ZOOMED, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(PRESETS_ZOOMED, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts it', () => {
    const r = validateKotlin(transform(PRESETS_ZOOMED, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const LEGEND = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, bars, line } from '@pyreon/charts/plot'
interface Day { label: string; hits: number; avg: number }
const DAYS: Day[] = [{ label: 'Mon', hits: 3, avg: 2 }, { label: 'Tue', hits: 5, avg: 3 }, { label: 'Wed', hits: 2, avg: 3 }, { label: 'Thu', hits: 7, avg: 4 }]
export function Traffic() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <PlotChart data={DAYS} x={(d) => d.label} marks={[bars((d) => d.hits, { label: 'Hits' }), line((d) => d.avg, { label: 'Avg' })]} showLegend={true} legendMaxRows={1} height={200} onSelect={(i: number) => picked.set(i)} />
    </Stack>
  )
}`

const LEGEND_NO_TOGGLE = LEGEND.replace('showLegend={true}', 'showLegend={true} legendToggle={false}')
const LEGEND_NO_PAGING = LEGEND.replace(' legendMaxRows={1}', '')
const LEGEND_WITH_PRESETS = LEGEND.replace('showLegend={true}', "showLegend={true} zoomPresets={[{ label: 'last 2', count: 2 }, { label: 'all', count: 0 }]}")

describe('chart hosts — <PlotChart showLegend> legend tap toggle + paging', () => {
  it('Swift: the hidden set and the page are host state; the plot draws what hideHiddenSeries leaves; entries render muted; the tap checks the pager, then the entries, then selects', () => {
    const r = transform(LEGEND, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var pyreonHidden: [Int] = []')
    expect(r.code).toContain('@State private var pyreonLegendPage: Double = 0.0')
    expect(r.code.indexOf('@State private var pyreonHidden')).toBeLessThan(r.code.indexOf('var body: some View'))
    expect(r.code).toContain('let pyreonSeriesAll: [Series] = [Series(kind: "bars", values: pyreonValues0, ')
    expect(r.code).toContain('let pyreonSeries: [Series] = hideHiddenSeries(pyreonSeriesAll, pyreonHidden)')
    expect(r.code).toContain(
      'renderLegend(pyreonSeriesAll.enumerated().map { (pyreonI, pyreonS) in LegendEntry(label: pyreonS.label, color: pyreonS.color, muted: pyreonHidden.contains(pyreonI)) }, PyreonChartRect(x: 0.0, y: pyreonTitle.height, w: Double(pyreonGeo.size.width), h: 200.0 - pyreonTitle.height), LegendOptions(fontSize: 11.0, labelColor: "#5a6b7a", swatch: 10.0, gap: 12.0, orientation: "horizontal", maxRows: 1.0, page: pyreonLegendPage), pyreonChartMeasure)',
    )
    expect(r.code).toContain(
      'let pyreonPageDelta: Double = pyreonLegend.pager.map { pagerHit($0, Double(pyreonTap.location.x), Double(pyreonTap.location.y)) } ?? 0.0; let pyreonLegendHit = legendHitIndex(pyreonLegend.boxes, Double(pyreonTap.location.x), Double(pyreonTap.location.y)); if pyreonPageDelta != 0.0 { pyreonLegendPage = (pyreonLegend.pager?.page ?? 0.0) + pyreonPageDelta } else if pyreonLegendHit >= 0 { pyreonHidden = legendToggle(pyreonHidden, pyreonLegendHit) } else {',
    )
    // The plot is still hit-tested in PLOT space (under the chrome).
    expect(r.code).toContain('plotHitBars(pyreonSpec, pyreonChartMeasure, Double(pyreonTap.location.x), Double(pyreonTap.location.y) - pyreonTop)')
  })
  it('Kotlin: the same shape over remembered state', () => {
    const r = transform(LEGEND, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var pyreonHidden by remember { mutableStateOf(listOf<Int>()) }')
    expect(r.code).toContain('var pyreonLegendPage by remember { mutableStateOf(0.0) }')
    expect(r.code).toContain('val pyreonSeriesAll: List<Series> = listOf(Series(kind = "bars", values = pyreonValues0, ')
    expect(r.code).toContain('val pyreonSeries: List<Series> = hideHiddenSeries(pyreonSeriesAll, pyreonHidden)')
    expect(r.code).toContain('renderLegend(pyreonSeriesAll.mapIndexed { pyreonI, pyreonS -> LegendEntry(label = pyreonS.label, color = pyreonS.color, muted = pyreonHidden.contains(pyreonI)) }, ')
    expect(r.code).toContain('orientation = "horizontal", maxRows = 1.0, page = pyreonLegendPage), ::pyreonChartMeasure)')
    expect(r.code).toContain(
      'val pyreonPageDelta = pyreonLegend.pager?.let { pagerHit(it, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble()) } ?: 0.0; val pyreonLegendHit = legendHitIndex(pyreonLegend.boxes, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble()); if (pyreonPageDelta != 0.0) { pyreonLegendPage = (pyreonLegend.pager?.page ?: 0.0) + pyreonPageDelta } else if (pyreonLegendHit >= 0) { pyreonHidden = legendToggle(pyreonHidden, pyreonLegendHit) } else {',
    )
  })
  it('legendToggle={false} keeps the legend inert: no hidden set, no toggle branch — paging stays', () => {
    const s = transform(LEGEND_NO_TOGGLE, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).not.toContain('pyreonHidden')
    expect(s.code).toContain('let pyreonSeries: [Series] = [Series(kind: "bars"')
    expect(s.code).toContain('pyreonLegendPage')
    const k = transform(LEGEND_NO_TOGGLE, { target: 'kotlin' })
    expect(k.code).not.toContain('pyreonHidden')
    expect(k.code).toContain('pyreonLegendPage')
  })
  it('without legendMaxRows there is no page state and no pager branch — the toggle stays', () => {
    const s = transform(LEGEND_NO_PAGING, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).not.toContain('pyreonLegendPage')
    expect(s.code).not.toContain('pagerHit')
    expect(s.code).toContain('let pyreonLegendHit = legendHitIndex(pyreonLegend.boxes, Double(pyreonTap.location.x), Double(pyreonTap.location.y)); if pyreonLegendHit >= 0 { pyreonHidden = legendToggle(pyreonHidden, pyreonLegendHit) } else {')
    const k = transform(LEGEND_NO_PAGING, { target: 'kotlin' })
    expect(k.code).not.toContain('pyreonLegendPage')
    expect(k.code).toContain('if (pyreonLegendHit >= 0) { pyreonHidden = legendToggle(pyreonHidden, pyreonLegendHit) } else {')
  })
  it('with presets too, the tap order is pager → legend entry → preset → selection', () => {
    const s = transform(LEGEND_WITH_PRESETS, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('} else if pyreonLegendHit >= 0 { pyreonHidden = legendToggle(pyreonHidden, pyreonLegendHit) } else if pyreonPreset >= 0 { pyreonZoom = presetWindow(pyreonPresets[pyreonPreset].count, DAYS.count) } else {')
    const k = transform(LEGEND_WITH_PRESETS, { target: 'kotlin' })
    expect(k.warnings).toEqual([])
    expect(k.code).toContain('} else if (pyreonLegendHit >= 0) { pyreonHidden = legendToggle(pyreonHidden, pyreonLegendHit) } else if (pyreonPreset >= 0) { pyreonZoom = presetWindow(pyreonPresets[pyreonPreset].count, DAYS.size) } else {')
  })
  it('a plot without a legend gets none of it', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PRESETS, { target })
      expect(r.code).not.toContain('pyreonHidden')
      expect(r.code).not.toContain('pyreonLegendPage')
      expect(r.code).not.toContain('legendHitIndex')
    }
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts the legend-interaction emit', () => {
    const r = validateSwiftWithStubs(transform(LEGEND_WITH_PRESETS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(LEGEND_WITH_PRESETS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts it', () => {
    const r = validateKotlin(transform(LEGEND_WITH_PRESETS, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const NAV = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, line } from '@pyreon/charts/plot'
interface Day { label: string; hits: number }
const DAYS: Day[] = [{ label: 'Mon', hits: 3 }, { label: 'Tue', hits: 5 }, { label: 'Wed', hits: 2 }, { label: 'Thu', hits: 7 }]
export function Traffic() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <PlotChart data={DAYS} x={(d) => d.label} marks={[line((d) => d.hits)]} navigator={true} height={240} onSelect={(i: number) => picked.set(i)} />
    </Stack>
  )
}`
const NAV_ZOOMED = NAV.replace('navigator={true}', 'navigator={true} dataZoom={true}')
const NAV_PRESETS = NAV.replace('navigator={true}', "navigator={true} zoomPresets={[{ label: 'last 2', count: 2 }, { label: 'all', count: 0 }]}")
const NAV_NO_MARKS = NAV.replace('marks={[line((d) => d.hits)]}', 'marks={[]}')

describe('chart hosts — <PlotChart navigator> as the engine-laid-out slider strip with its own drag overlay', () => {
  it('Swift: the strip is renderNavigator over the first mark across ALL rows; the drag rides a clear overlay above the strip', () => {
    const r = transform(NAV, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var pyreonZoom: ZoomWindow = ZoomWindow(start: 0.0, end: 1.0)')
    expect(r.code).toContain('@State private var pyreonNavKind: Int = 0')
    expect(r.code).toContain('@State private var pyreonNavAnchor: ZoomWindow = ZoomWindow(start: 0.0, end: 1.0)')
    // The window slices the rows the PLOT draws; the navigator sees every row.
    expect(r.code).toContain('let pyreonValues0: [Double] = pyreonRows.enumerated().map { (_, pyreonD) -> Double in pyreonChartDouble(pyreonD.hits) }')
    expect(r.code).toContain('let pyreonNavValues: [Double] = DAYS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.hits) }')
    expect(r.code).toContain('let pyreonNavigator: NavigatorLayout = renderNavigator(pyreonNavValues, pyreonSeries[0].color, pyreonZoom, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 240.0), pyreonTheme.grid)')
    expect(r.code).toContain('height: 240.0 - pyreonNavigator.height')
    expect(r.code).toContain('PyreonChartCanvas(cmds: renderChart(pyreonSpec, pyreonChartMeasure) + pyreonNavigator.cmds)')
    expect(r.code).toContain('ZStack(alignment: .bottom) { PyreonChartCanvas(')
    expect(r.code).toContain(
      'Color.clear.contentShape(Rectangle()).frame(height: pyreonNavigator.height).gesture(DragGesture(minimumDistance: 0).onChanged { pyreonNav in if pyreonNavKind == 0 { pyreonNavAnchor = pyreonZoom; pyreonNavKind = navigatorHit(pyreonNavigator.strip, pyreonZoom, Double(pyreonNav.startLocation.x)) }; pyreonZoom = navigatorDrag(pyreonNavKind, pyreonNavAnchor, Double(pyreonNav.translation.width) / pyreonNavigator.strip.w) }.onEnded { _ in pyreonNavKind = 0 })',
    )
    expect(r.code).not.toContain('MagnificationGesture')
  })
  it('Kotlin: the same strip over remembered state; the drag is a Box laid over the strip with detectDragGestures', () => {
    const r = transform(NAV, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var pyreonNavKind by remember { mutableStateOf(0) }')
    expect(r.code).toContain('var pyreonNavAnchor by remember { mutableStateOf(ZoomWindow(start = 0.0, end = 1.0)) }')
    expect(r.code).toContain('val pyreonNavValues: List<Double> = DAYS.mapIndexed { pyreonI, pyreonD -> (pyreonD.hits).toDouble() }')
    expect(r.code).toContain('val pyreonNavigator: NavigatorLayout = renderNavigator(pyreonNavValues, pyreonSeries[0].color, pyreonZoom, PyreonChartRect(0.0, 0.0, pyreonW, 240.0), pyreonTheme.grid)')
    expect(r.code).toContain('height = 240.0 - pyreonNavigator.height')
    expect(r.code).toContain('Box(modifier = Modifier.fillMaxWidth().height((240.0).dp)')
    expect(r.code).toContain('PyreonChartCanvas(cmds = renderChart(pyreonSpec, ::pyreonChartMeasure) + pyreonNavigator.cmds, modifier = Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures {')
    expect(r.code).toContain(
      'Box(modifier = Modifier.fillMaxWidth().offset(y = ((240.0) - pyreonNavigator.height).dp).height((pyreonNavigator.height).dp).pointerInput(Unit) { detectDragGestures(onDragStart = { pyreonStart -> pyreonNavAnchor = pyreonZoom; pyreonNavDx = 0.0; pyreonNavKind = navigatorHit(pyreonNavigator.strip, pyreonZoom, (pyreonStart.x / pyreonDensity).toDouble()) }, onDragEnd = { pyreonNavKind = 0 }, onDrag = { pyreonChange, pyreonDrag -> pyreonChange.consume(); pyreonNavDx = pyreonNavDx + (pyreonDrag.x / pyreonDensity).toDouble(); pyreonZoom = navigatorDrag(pyreonNavKind, pyreonNavAnchor, pyreonNavDx / pyreonNavigator.strip.w) }) })',
    )
  })
  it('with presets too, the navigator sits ABOVE the preset strip and the plot gives up both', () => {
    const s = transform(NAV_PRESETS, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 240.0 - pyreonPresetStrip.height), pyreonTheme.grid)')
    expect(s.code).toContain('height: 240.0 - pyreonPresetStrip.height - pyreonNavigator.height')
    expect(s.code).toContain('+ pyreonNavigator.cmds + pyreonPresetStrip.cmds)')
    expect(s.code).toContain('.frame(height: pyreonNavigator.height).padding(.bottom, pyreonPresetStrip.height).gesture(')
    const k = transform(NAV_PRESETS, { target: 'kotlin' })
    expect(k.warnings).toEqual([])
    expect(k.code).toContain('.offset(y = ((240.0) - pyreonPresetStrip.height - pyreonNavigator.height).dp)')
  })
  it('with dataZoom too, a navigator drag re-anchors the pinch window and the plot keeps its gestures', () => {
    const s = transform(NAV_ZOOMED, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('.onEnded { _ in pyreonNavKind = 0; pyreonZoomAnchor = pyreonZoom })')
    expect(s.code).toContain('MagnificationGesture()')
    const k = transform(NAV_ZOOMED, { target: 'kotlin' })
    expect(k.code).toContain('detectTransformGestures')
    expect(k.code).toContain('detectDragGestures(')
  })
  it('a navigator with no marks warns BY NAME and renders the chart without it', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(NAV_NO_MARKS, { target })
      expect(r.warnings).toEqual(['<PlotChart navigator>: needs at least one mark (the strip shows the first one); the chart renders without the navigator.'])
      expect(r.code).not.toContain('pyreonNavigator')
    }
  })
  it('a plot without a navigator gets none of it, and the frame host emit is unchanged', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PRESETS, { target })
      expect(r.code).not.toContain('pyreonNavigator')
      expect(r.code).not.toContain('pyreonNavKind')
    }
    expect(transform(PRESETS, { target: 'kotlin' }).code).toContain('PyreonChartCanvas(cmds = renderChart(pyreonSpec, ::pyreonChartMeasure) + pyreonPresetStrip.cmds, modifier = Modifier.fillMaxWidth().height((200.0).dp).pointerInput(Unit) {')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts the navigator emit', () => {
    const r = validateSwiftWithStubs(transform(NAV_PRESETS.replace('navigator={true}', 'navigator={true} dataZoom={true}'), { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(NAV_PRESETS.replace('navigator={true}', 'navigator={true} dataZoom={true}'), { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts it', () => {
    const r = validateKotlin(transform(NAV_PRESETS.replace('navigator={true}', 'navigator={true} dataZoom={true}'), { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const BRUSH = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/plot'
import type { BrushRange } from '@pyreon/charts/plot'
interface Day { label: string; hits: number }
const DAYS: Day[] = [{ label: 'Mon', hits: 3 }, { label: 'Tue', hits: 5 }, { label: 'Wed', hits: 2 }, { label: 'Thu', hits: 7 }]
export function Traffic() {
  const picked = signal(-1)
  const sel = signal('')
  const onBrush = (r: BrushRange | null) => {
    if (r === null) {
      sel.set('')
    } else {
      sel.set(String(r.start) + '-' + String(r.end))
    }
  }
  return (
    <Stack>
      <Text>{picked()}</Text>
      <Text>{sel()}</Text>
      <PlotChart data={DAYS} x={(d) => d.label} marks={[bars((d) => d.hits)]} brush={true} height={200} onBrush={onBrush} onSelect={(i: number) => picked.set(i)} />
    </Stack>
  )
}`
const BRUSH_NO_HANDLER = BRUSH.replace(' onBrush={onBrush}', '')
const BRUSH_INLINE = BRUSH.replace('onBrush={onBrush}', "onBrush={(r: BrushRange | null) => sel.set(r === null ? '' : String(r.start))}")
const BRUSH_ZOOMED = BRUSH.replace('brush={true}', 'brush={true} dataZoom={true}')
const BRUSH_PRESETS = BRUSH.replace('brush={true}', "brush={true} zoomPresets={[{ label: 'last 2', count: 2 }, { label: 'all', count: 0 }]}")

describe('chart hosts — <PlotChart brush onBrush> as a plain drag over the engine\'s range mapping', () => {
  it('Swift: the committed range and the live span are host state; the band rides inside the chrome wrap; a drag selects through brushRange and a plain tap clears', () => {
    const r = transform(BRUSH, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var pyreonBrushStart: Int = -1')
    expect(r.code).toContain('@State private var pyreonBrushEnd: Int = -1')
    expect(r.code).toContain('@State private var pyreonBrushA: Double = -1.0')
    expect(r.code).toContain('@State private var pyreonBrushB: Double = -1.0')
    expect(r.code).not.toContain('pyreonZoom')
    expect(r.code).toContain('let pyreonPlot: PyreonChartRect = layoutChart(pyreonSpec, pyreonChartMeasure).plot')
    expect(r.code).toContain(
      'let pyreonBrushCmds: [PyreonDrawCmd] = pyreonBrushA >= 0.0 ? renderBrushBand(pyreonPlot, min(pyreonBrushA, pyreonBrushB), max(pyreonBrushA, pyreonBrushB), pyreonSpec.theme.axis) : pyreonBrushStart >= 0 ? { () -> [PyreonDrawCmd] in let pyreonBand = brushBand(pyreonPlot, BrushRange(start: pyreonBrushStart, end: pyreonBrushEnd), ZoomWindow(start: 0.0, end: 1.0), DAYS.count); return pyreonBand.visible ? renderBrushBand(pyreonPlot, pyreonBand.lo, pyreonBand.hi, pyreonSpec.theme.axis) : [] }() : []',
    )
    expect(r.code).toContain('PyreonChartCanvas(cmds: renderChart(pyreonSpec, pyreonChartMeasure) + pyreonBrushCmds)')
    expect(r.code).toContain('if abs(pyreonTap.translation.width) < 6.0 && abs(pyreonTap.translation.height) < 6.0 { if pyreonBrushStart >= 0 { pyreonBrushStart = -1; pyreonBrushEnd = -1; onBrush(nil) } else {')
    expect(r.code).toContain(
      '.simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { pyreonBrushDrag in pyreonBrushA = Double(pyreonBrushDrag.startLocation.x); pyreonBrushB = Double(pyreonBrushDrag.location.x) }.onEnded { pyreonBrushDrag in let pyreonSel: BrushRange = brushRange(pyreonPlot.x, pyreonPlot.w, Double(pyreonBrushDrag.startLocation.x), Double(pyreonBrushDrag.location.x), ZoomWindow(start: 0.0, end: 1.0), DAYS.count); pyreonBrushStart = pyreonSel.start; pyreonBrushEnd = pyreonSel.end; pyreonBrushA = -1.0; pyreonBrushB = -1.0; onBrush(pyreonSel) })',
    )
    // The named handler narrows its optional through the null compare.
    expect(r.code).toContain('private func onBrush(_ r: BrushRange?) {\n    if let r {')
  })
  it('Kotlin: remembered state, the band in the wrap, detectDragGestures selects, the tap clears', () => {
    const r = transform(BRUSH, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var pyreonBrushStart by remember { mutableStateOf(-1) }')
    expect(r.code).toContain('val pyreonPlot: PyreonChartRect = layoutChart(pyreonSpec, ::pyreonChartMeasure).plot')
    expect(r.code).toContain('renderChart(pyreonSpec, ::pyreonChartMeasure) + pyreonBrushCmds')
    expect(r.code).toContain('if (pyreonBrushStart >= 0) { pyreonBrushStart = -1; pyreonBrushEnd = -1; onBrush(null) } else {')
    expect(r.code).toContain(
      '.pointerInput(Unit) { detectDragGestures(onDragStart = { pyreonStart -> pyreonBrushA = (pyreonStart.x / pyreonDensity).toDouble(); pyreonBrushB = pyreonBrushA }, onDragEnd = { val pyreonSel: BrushRange = brushRange(pyreonPlot.x, pyreonPlot.w, pyreonBrushA, pyreonBrushB, ZoomWindow(start = 0.0, end = 1.0), DAYS.size); pyreonBrushStart = pyreonSel.start; pyreonBrushEnd = pyreonSel.end; pyreonBrushA = -1.0; pyreonBrushB = -1.0; onBrush(pyreonSel) }, onDrag = { pyreonChange, pyreonDrag -> pyreonChange.consume(); pyreonBrushB = pyreonBrushB + (pyreonDrag.x / pyreonDensity).toDouble() }) }',
    )
    expect(r.code).toContain('fun onBrush(r: BrushRange?) {\n    if (r == null) {')
  })
  it('without onBrush the brush still selects and draws; nothing is called', () => {
    const s = transform(BRUSH_NO_HANDLER, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('pyreonBrushA = -1.0; pyreonBrushB = -1.0 })')
    expect(s.code).toContain('{ pyreonBrushStart = -1; pyreonBrushEnd = -1 } else {')
    const k = transform(BRUSH_NO_HANDLER, { target: 'kotlin' })
    expect(k.warnings).toEqual([])
    expect(k.code).toContain('pyreonBrushA = -1.0; pyreonBrushB = -1.0 }, onDrag')
  })
  it('an inline onBrush arrow warns BY NAME on both targets; the brush still selects', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(BRUSH_INLINE, { target })
      expect(r.warnings).toEqual(['<PlotChart onBrush>: must be a NAMED handler (`const onBrush = (r: BrushRange | null) => …`) on native — an inline arrow is not lowered; the brush still selects, without the callback.'])
      expect(r.code).toContain('brushRange(pyreonPlot.x, pyreonPlot.w')
    }
  })
  it('brush + dataZoom warns BY NAME (the web needs Shift there) and renders without the brush', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(BRUSH_ZOOMED, { target })
      expect(r.warnings).toEqual(['<PlotChart brush>: with `dataZoom` the web brushes on Shift+drag, which touch has not — on native the plain drag pans, so the brush stays web-only in that combination; the chart renders without it.'])
      expect(r.code).not.toContain('pyreonBrush')
    }
  })
  it('with presets the brush maps through the host window and the tap order is preset → brush clear → selection', () => {
    const s = transform(BRUSH_PRESETS, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('brushRange(pyreonPlot.x, pyreonPlot.w, Double(pyreonBrushDrag.startLocation.x), Double(pyreonBrushDrag.location.x), pyreonZoom, DAYS.count)')
    expect(s.code).toContain('} else if pyreonBrushStart >= 0 { pyreonBrushStart = -1; pyreonBrushEnd = -1; onBrush(nil) } else {')
    const k = transform(BRUSH_PRESETS, { target: 'kotlin' })
    expect(k.code).toContain('} else if (pyreonBrushStart >= 0) { pyreonBrushStart = -1; pyreonBrushEnd = -1; onBrush(null) } else {')
  })
  it('a plot without brush gets none of it', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PRESETS, { target })
      expect(r.code).not.toContain('pyreonBrush')
      expect(r.code).not.toContain('layoutChart(pyreonSpec')
    }
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts the brush emit', () => {
    const r = validateSwiftWithStubs(transform(BRUSH_PRESETS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(BRUSH_PRESETS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts it', () => {
    const r = validateKotlin(transform(BRUSH_PRESETS, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})


const EVENTS_MODEL = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/plot'
interface Row { k: string; v: number }
const ROWS: Row[] = [{ k: 'a', v: 3 }, { k: 'b', v: 5 }]
export function Picks() {
  const hovered = signal(-1)
  return (
    <Stack>
      <Text>{hovered()}</Text>
      <PlotChart data={ROWS} x={(d) => d.k} marks={[bars((d) => d.v)]} height={200} selectedMode="single" onHighlight={(i: number) => hovered.set(i)} />
    </Stack>
  )
}
`

describe('PlotChart events/actions props on native', () => {
  it('warn BY NAME — attrs AND event props — and the chart still lowers', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(EVENTS_MODEL, { target })
      expect(r.warnings.some((w) => w.includes('`selectedMode`, `onHighlight` are not lowered on native yet'))).toBe(true)
      expect(r.code).toContain('renderChart(')
    }
  })
})
