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
