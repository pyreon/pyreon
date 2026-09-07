// The entrance tween crosses: every host whose engine takes a `progress`
// (the same set the web canvas host tweens) renders inside `PyreonChartEntrance`
// on both targets, which hands the cubic ease-out progress down as
// `pyreonEntrance` — into `ChartSpec.progress` on the plot host, into a copy
// of the user's `XOptions` on the family hosts, and as the wrapper's extra
// argument on the heatmap. `animate={false}` is the web host's own opt-out,
// so it emits exactly what the host emitted before; an engine with no
// entrance (Pie) names `animate` as inert on EVERY target rather than "not
// lowered yet". Both legs compile against the real generated engine.
//
// The same PR fixed what the copy exposed: an inline options literal
// (`tree={{ symbolSize: 8 }}`) used to lower to a synthesized `__Obj0` that
// swiftc rejected against `TreeOptions`, and a non-nil options value was
// read with `?.` — an error on a non-optional in Swift.
import { describe, expect, it } from 'vitest'
import { chartChromeUnlowered, chartHostAnimates } from '../chart-hosts'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const TREEMAP = `import { TreemapChart } from '@pyreon/charts/plot'
import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'src', children: [{ name: 'core', value: 50 }] }, { name: 'docs', value: 30 }]
export function Files() {
  return <TreemapChart data={DATA} treemap={{ padding: 2 }} tooltip height={200} />
}`

const TREEMAP_PLAIN = `import { TreemapChart } from '@pyreon/charts/plot'
import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'docs', value: 30 }]
export function Files() { return <TreemapChart data={DATA} height={200} /> }`

const FUNNEL = `import { FunnelChart } from '@pyreon/charts/plot'
interface S { label: string; v: number }
const SL: S[] = [{ label: 'a', v: 3 }, { label: 'b', v: 1 }]
export function Steps() {
  return <FunnelChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} width={240} height={200} />
}`

const PLOT = `import { PlotChart, bars } from '@pyreon/charts/plot'
interface M { name: string; v: number }
const ROWS: M[] = [{ name: 'a', v: 1 }, { name: 'b', v: 2 }]
export function Sales() {
  return <PlotChart data={ROWS} x={(d: M) => d.name} marks={[bars((d: M) => d.v)]} height={200} />
}`

const HEAT = `import { HeatmapChart } from '@pyreon/charts/plot'
interface C { hour: string; d: string; n: number }
const CELLS: C[] = [{ hour: '1', d: 'Mon', n: 2 }]
export function Heat() {
  return <HeatmapChart data={CELLS} x={(d: C) => d.hour} y={(d: C) => d.d} value={(d: C) => d.n} width={240} height={160} />
}`

const TREE_OPTIONS = `import { TreeChart } from '@pyreon/charts/plot'
import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'root', children: [{ name: 'a', value: 1 }] }]
export function T() {
  return <TreeChart data={DATA} tree={{ symbolSize: 8 }} tooltip height={200} />
}`

const PIE = `import { PieChart } from '@pyreon/charts/plot'
interface S { label: string; v: number }
const SL: S[] = [{ label: 'a', v: 3 }]
export function Share() {
  return <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} animate width={240} height={200} />
}`

describe('chart entrance — the web tween crosses to both targets', () => {
  it('classifies hosts by whether their engine takes a progress, exactly like the web canvas host', () => {
    for (const t of ['TreemapChart', 'SankeyChart', 'GraphChart', 'SunburstChart', 'TreeChart', 'RiverChart', 'GanttChart', 'PolarChart', 'CalendarChart', 'ParallelChart', 'FunnelChart', 'HeatmapChart', 'PlotChart']) {
      expect(chartHostAnimates(t), t).toBe(true)
      expect(chartChromeUnlowered(t), t).not.toContain('animate')
    }
    for (const t of ['PieChart', 'RadarChart', 'CandlestickChart', 'GaugeChart']) {
      expect(chartHostAnimates(t), t).toBe(false)
      expect(chartChromeUnlowered(t), t).toContain('animate')
    }
  })
  it('Swift: a family host renders inside PyreonChartEntrance; the entrance reaches the RENDER through a copy of the options, never the layout / hit / tooltip', () => {
    const r = transform(TREEMAP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonChartEntrance(durationMs: 700.0) { pyreonEntrance in')
    // The literal is steered to the engine struct (no `__Obj0`), and the copy sets only `progress`.
    expect(r.code).toContain('let pyreonOpts: TreemapOptions = { () -> TreemapOptions in var pyreonO = TreemapOptions(padding: Double(2)); pyreonO.progress = pyreonEntrance; return pyreonO }()')
    expect(r.code).toContain('renderTreemap(pyreonLayout, pyreonOpts)')
    expect(r.code).toContain('let pyreonLayout = layoutTreemap(DATA, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 200.0), TreemapOptions(padding: Double(2)))')
    expect(r.code).not.toContain('__Obj')
    // Absent options: the struct is constructed with the progress alone.
    expect(transform(TREEMAP_PLAIN, { target: 'swift' }).code).toContain('let pyreonOpts: TreemapOptions = TreemapOptions(progress: pyreonEntrance)')
  })
  it('Kotlin: the same shape through data-class copy', () => {
    const r = transform(TREEMAP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonChartEntrance(700.0) { pyreonEntrance ->')
    expect(r.code).toContain('val pyreonOpts: TreemapOptions = (TreemapOptions(padding = (2).toDouble())).copy(progress = pyreonEntrance)')
    expect(r.code).toContain('renderTreemap(pyreonLayout, pyreonOpts)')
    expect(transform(TREEMAP_PLAIN, { target: 'kotlin' }).code).toContain('val pyreonOpts: TreemapOptions = TreemapOptions(progress = pyreonEntrance)')
  })
  it('the accessor host (Funnel), the plot host (ChartSpec.progress) and the heatmap wrapper all take the entrance', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const f = transform(FUNNEL, { target })
      expect(f.warnings).toEqual([])
      expect(f.code).toContain(target === 'swift' ? 'let pyreonOpts: FunnelOptions = FunnelOptions(progress: pyreonEntrance)' : 'val pyreonOpts: FunnelOptions = FunnelOptions(progress = pyreonEntrance)')
      expect(f.code).toContain('renderFunnel(pyreonItems, ')
      expect(f.code).toContain(', pyreonOpts)')
      const p = transform(PLOT, { target })
      expect(p.warnings).toEqual([])
      expect(p.code).toContain(target === 'swift' ? 'progress: pyreonEntrance)' : 'progress = pyreonEntrance)')
      const h = transform(HEAT, { target })
      expect(h.warnings).toEqual([])
      expect(h.code).toContain(target === 'swift' ? 'pyreonChartMeasure, pyreonEntrance))' : '::pyreonChartMeasure, pyreonEntrance)')
    }
  })
  it('the duration is the theme\'s enterMs: a literal field, a named theme, else the default', () => {
    const lit = TREEMAP_PLAIN.replace('height={200}', 'theme={{ enterMs: 300 }} height={200}')
    const named = TREEMAP_PLAIN.replace("import { TreemapChart }", 'import { TreemapChart, chartThemes }').replace('height={200}', 'theme={chartThemes.dark} height={200}')
    expect(transform(lit, { target: 'swift' }).code).toContain('PyreonChartEntrance(durationMs: 300.0)')
    expect(transform(named, { target: 'kotlin' }).code).toContain('PyreonChartEntrance(700.0)')
  })
  it('animate={false} emits exactly the pre-entrance host on both targets — the web host\'s own opt-out', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const off = transform(TREEMAP.replace('tooltip height', 'animate={false} tooltip height'), { target })
      expect(off.warnings).toEqual([])
      expect(off.code).not.toContain('PyreonChartEntrance')
      expect(off.code).not.toContain('pyreonOpts')
      expect(off.code).not.toContain('progress')
    }
  })
  it('an engine with no entrance names `animate` as inert on every target, not as a native gap', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PIE, { target })
      expect(r.warnings).toEqual(['<PieChart>: `animate` has no effect on any target — its engine draws fully formed; the prop is ignored.'])
      expect(r.code).not.toContain('PyreonChartEntrance')
    }
  })
  it('an inline options literal steers to the engine struct and a non-nil options value is read without optional chaining (the tooltip path)', () => {
    const s = transform(TREE_OPTIONS, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).not.toContain('__Obj')
    expect(s.code).toContain('treeTip(pyreonLayout, Double(pyreonTap.location.x), Double(pyreonTap.location.y), (TreeOptions(symbolSize: Double(8))).symbolSize)')
    const k = transform(TREE_OPTIONS, { target: 'kotlin' })
    expect(k.code).toContain('(TreeOptions(symbolSize = (8).toDouble())).symbolSize')
  })
  // One compile per fixture: two of them declare the same `DATA` / `Files`.
  const sources = { TREEMAP, TREEMAP_PLAIN, FUNNEL, PLOT, HEAT, TREE_OPTIONS }
  it.skipIf(!isSwiftcAvailable())('swiftc: PyreonChartEntrance, the options copies and the extra heatmap argument resolve against the real engine', () => {
    for (const [name, src] of Object.entries(sources)) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.error ?? '', name).toBe('')
      expect(r.ok, name).toBe(true)
    }
  })
  it.skipIf(!isKotlincAvailable())('kotlinc: the same', () => {
    for (const [name, src] of Object.entries(sources)) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.error ?? '', name).toBe('')
      expect(r.ok, name).toBe(true)
    }
  })
})
