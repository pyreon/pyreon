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
  it('an accessor-prop host (PlotChart) warns by name instead of naming a view that does not exist', () => {
    const r = transform(
      `import { PlotChart, bars } from '@pyreon/charts/plot'
export function C() { const rows = [{ v: 1 }]; return <PlotChart data={rows} marks={[bars((d) => d.v)]} /> }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('<PlotChart> has no native lowering yet')
    expect(r.code).not.toContain('PlotChart(')
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
  it('a block-bodied accessor and a pie legend are reported by name', () => {
    const r = transform(
      `import { FunnelChart, PieChart } from '@pyreon/charts/plot'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function C() { return (<><FunnelChart data={ROWS} value={(d) => { const twice = d.v * 2; return twice }} label={(d) => d.n} /><PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} showLegend={true} /></>) }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('<FunnelChart value>: only a single-expression arrow')
    expect(r.warnings.join('\n')).toContain('<PieChart showLegend>: the legend is not lowered')
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
