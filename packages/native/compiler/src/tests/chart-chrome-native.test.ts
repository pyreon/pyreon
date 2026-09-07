// Native chrome parity for the family hosts: the title block, the legend and
// a TAP tooltip on every generic and accessor host, all three read from the
// crossing `chrome.ts` — the same functions the web canvas host calls. The
// emit is asserted structurally on both targets and compiled against the
// real generated engine (the stub bundle links it when a chart host is
// present), so a legend function that does not exist natively, or a tooltip
// options struct whose fields drifted, fails here rather than on a device.
import { describe, expect, it } from 'vitest'
import { chartChromeUnlowered } from '../chart-hosts'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const TREEMAP = `import { TreemapChart } from '@pyreon/charts/plot'
import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'src', children: [{ name: 'core', value: 50 }] }, { name: 'docs', value: 30 }]
export function Files() {
  return <TreemapChart data={DATA} height={200} title="Files" subtitle="by size" showTitle showLegend tooltip onSelectIndex={(i: number) => console.log(i)} />
}`

const PIE = `import { PieChart } from '@pyreon/charts/plot'
interface S { label: string; v: number }
const SL: S[] = [{ label: 'a', v: 3 }, { label: 'b', v: 1 }]
export function Share() {
  return <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} title="Share" showTitle showLegend tooltip width={240} height={200} />
}`

const POLAR = `import { PolarChart } from '@pyreon/charts/plot'
import type { PolarAxes, PolarSeries } from '@pyreon/charts/plot'
const AXES: PolarAxes = { categories: ['x', 'y'] }
const SERIES: PolarSeries[] = [{ name: 'a', kind: 'bar', values: [3.5, 4.5] }]
export function Rose() {
  return <PolarChart axes={AXES} series={SERIES} showLegend tooltip height={240} />
}`

const PLAIN = `import { TreemapChart } from '@pyreon/charts/plot'
import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'docs', value: 30 }]
export function Files() { return <TreemapChart data={DATA} height={200} /> }`

describe('family chrome — title, legend and tap tooltip lower on both targets', () => {
  it('Swift: a probe layout feeds the crossing legend, the plot lays out under the chrome, the tap reads the tooltip', () => {
    const r = transform(TREEMAP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonProbe = layoutTreemap(DATA, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 200.0), nil)')
    expect(r.code).toContain('renderTitle("Files", "by size",')
    expect(r.code).toContain('renderLegend(treemapLegend(pyreonProbe),')
    expect(r.code).toContain('let pyreonLayout = layoutTreemap(DATA, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 200.0 - pyreonTop), nil)')
    expect(r.code).toContain('@State private var pyreonTip: [String] = []')
    expect(r.code).toContain('+ renderTooltip(pyreonTip, pyreonTipAt, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 200.0), TooltipOptions(fontSize: 11.0, fill: "#ffffff", border: "rgba(132,150,165,0.18)", text: "#1f2937", pad: 8.0, radius: 4.0), pyreonChartMeasure)')
    expect(r.code).toContain('pyreonTip = treemapTip(pyreonLayout, Double(pyreonTap.location.x), Double(pyreonTap.location.y) - pyreonTop)')
    // The select handler shares the tap and still receives the index.
    expect(r.code).toContain('let i = hitTreemapIndex(pyreonLayout, Double(pyreonTap.location.x), Double(pyreonTap.location.y) - pyreonTop)')
  })
  it('Kotlin: the same shape with remembered tooltip state and a density-scaled tap', () => {
    const r = transform(TREEMAP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonProbe = layoutTreemap(DATA, PyreonChartRect(0.0, 0.0, pyreonW, 200.0), null)')
    expect(r.code).toContain('renderLegend(treemapLegend(pyreonProbe),')
    expect(r.code).toContain('var pyreonTip by remember { mutableStateOf(listOf<String>()) }')
    expect(r.code).toContain('pyreonTip = treemapTip(pyreonLayout, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble() - pyreonTop)')
    expect(r.code).toContain('+ renderTooltip(pyreonTip, pyreonTipAt, PyreonChartRect(0.0, 0.0, pyreonW, 200.0), TooltipOptions(fontSize = 11.0, fill = "#ffffff", border = "rgba(132,150,165,0.18)", text = "#1f2937", pad = 8.0, radius = 4.0), ::pyreonChartMeasure)')
  })
  it('an accessor host (pie) hoists its items once for the legend, the arcs and the tooltip', () => {
    const sw = transform(PIE, { target: 'swift' })
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('renderLegend(pieLegend(pyreonItems),')
    expect(sw.code).toContain('renderTitle("Share", nil,')
    // The pie's box is the plot box UNDER the chrome — the same rect renderPie drew into, so the hit and the paint agree.
    expect(sw.code).toContain('pyreonTip = pieTip(pyreonItems, PyreonChartRect(x: 0.0, y: 0.0, w: 240.0, h: 200.0 - pyreonTop), 0.0, Double(pyreonTap.location.x), Double(pyreonTap.location.y) - pyreonTop)')
    const kt = transform(PIE, { target: 'kotlin' })
    expect(kt.warnings).toEqual([])
    expect(kt.code).toContain('renderLegend(pieLegend(pyreonItems),')
    expect(kt.code).toContain('pyreonTip = pieTip(pyreonItems, PyreonChartRect(0.0, 0.0, 240.0, 200.0 - pyreonTop), 0.0,')
  })
  it('a series host (polar) reads the legend from its series + the options palette, falling back to the engine default', () => {
    const sw = transform(POLAR, { target: 'swift' })
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('renderLegend(polarLegend(SERIES, (nil ?? ["#4f7df3",')
    expect(sw.code).toContain('pyreonTip = polarTip(pyreonLayout, SERIES,')
    const kt = transform(POLAR, { target: 'kotlin' })
    expect(kt.code).toContain('polarLegend(SERIES, (null ?: listOf("#4f7df3",')
  })
  it('a host with no chrome props emits byte-identically to before (no probe, no state, inline layout)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PLAIN, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('pyreonProbe')
      expect(r.code).not.toContain('pyreonTip')
      expect(r.code).not.toContain('pyreonLayout')
      expect(r.code).toContain(target === 'swift' ? 'renderTreemap(layoutTreemap(DATA,' : 'renderTreemap(layoutTreemap(DATA,')
    }
  })
  it('only `animate` stays unlowered on the family hosts; the plot host keeps its own list', () => {
    expect(chartChromeUnlowered('TreemapChart')).toEqual(['animate'])
    expect(chartChromeUnlowered('PieChart')).toEqual(['animate'])
    expect(chartChromeUnlowered('PlotChart')).toEqual(['tooltip', 'animate'])
  })
})

describe('family chrome — compile-proven against the real generated engine', () => {
  const sources = [TREEMAP, PIE, POLAR]
  it.skipIf(!isSwiftcAvailable())('swiftc: every crossing legend / tooltip function and the TooltipOptions struct resolve', () => {
    const r = validateSwiftWithStubs(sources.map((s) => transform(s, { target: 'swift' }).code).join('\n\n'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc: the same', () => {
    for (const s of sources) {
      const r = validateKotlin(transform(s, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})
