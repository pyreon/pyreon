// `tooltip` on `<PlotChart>` (and `<Tip>` in the grammar) was the last chrome
// prop still named "not lowered on native". It is a TAP here, as on the
// family hosts: the tap that selects reads the crossing `tooltipAt` /
// `tooltipLines` over the sliced series and categories with the LOCAL hit,
// the box is drawn by the crossing `renderTooltip` over the theme, and a tap
// on nothing clears it. A named `tooltipFormatter` lowers; an inline one is
// reported. `crosshair` (a hover concept) is named as web-only.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const HEAD = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
`
const DATA = `interface Month { name: string; revenue: number; cost: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8 }, { name: 'Feb', revenue: 15, cost: 9 }]
`
const TIP = `${HEAD}import { PlotChart, bars, line, compact } from '@pyreon/charts/plot'
${DATA}export function Revenue() {
  const picked = signal(-1)
  return (<Stack><Text>{picked()}</Text><PlotChart data={MONTHS} x={(d) => d.name} marks={[bars((d) => d.revenue, { label: 'Revenue' }), line((d) => d.cost, { label: 'Cost' })]} format={compact} tooltip height={200} onSelect={(i: number) => picked.set(i)} /></Stack>)
}
`
const TIP_ONLY = `${HEAD}import { PlotChart, bars } from '@pyreon/charts/plot'
${DATA}export function Revenue() {
  return (<Stack><PlotChart data={MONTHS} x={(d) => d.name} marks={[bars((d) => d.revenue)]} tooltip height={200} /></Stack>)
}
`
const WINDOWED = `${HEAD}import { PlotChart, bars } from '@pyreon/charts/plot'
${DATA}export function Revenue() {
  const picked = signal(-1)
  return (<Stack><PlotChart data={MONTHS} x={(d) => d.name} marks={[bars((d) => d.revenue)]} tooltip dataZoom height={200} onSelect={(i: number) => picked.set(i)} /></Stack>)
}
`
const FORMATTED = `${HEAD}import { PlotChart, bars } from '@pyreon/charts/plot'
import type { TooltipContent } from '@pyreon/charts/plot'
${DATA}function describe(c: TooltipContent): string {
  return c.title
}
export function Revenue() {
  return (<Stack><PlotChart data={MONTHS} x={(d) => d.name} marks={[bars((d) => d.revenue)]} tooltip tooltipFormatter={describe} height={200} /></Stack>)
}
`
const GRAMMAR = `${HEAD}import { Plot, Bar, Tip } from '@pyreon/charts/plot'
${DATA}export function Revenue() {
  return (<Stack><Plot data={MONTHS} x="name" height={200}><Bar y="revenue" /><Tip crosshair /></Plot></Stack>)
}
`
const PLAIN = TIP_ONLY.replace(' tooltip height', ' height')

describe('<PlotChart tooltip> — a tap tooltip on both targets', () => {
  it('Swift: the tap binds the local hit once, reads the crossing lines over the sliced series (the y formatter applied), and the select still speaks the same index', () => {
    const r = transform(TIP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var pyreonTip: [String] = []')
    expect(r.code).toContain('let pyreonLocal = plotHitBars(pyreonSpec, pyreonChartMeasure, Double(pyreonTap.location.x), Double(pyreonTap.location.y)); pyreonTip = pyreonLocal < 0 ? [] : tooltipLines(tooltipAt(pyreonLocal, pyreonCats, pyreonSeries.map { TooltipSeries(label: $0.label, values: $0.values, color: $0.color) }), compact); pyreonTipAt = PyreonChartPt(x: Double(pyreonTap.location.x), y: Double(pyreonTap.location.y)); let i = pyreonLocal')
    expect(r.code).toContain('+ renderTooltip(pyreonTip, pyreonTipAt, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 200.0), TooltipOptions(fontSize: 11.0, fill: "#ffffff", border: "rgba(132,150,165,0.18)", text: "#1f2937", pad: 8.0, radius: 4.0), pyreonChartMeasure)')
  })
  it('Kotlin: the same, with remembered state and the density-scaled tap', () => {
    const r = transform(TIP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var pyreonTip by remember { mutableStateOf(listOf<String>()) }')
    expect(r.code).toContain('val pyreonLocal = plotHitBars(pyreonSpec, ::pyreonChartMeasure, (pyreonTap.x / pyreonDensity).toDouble(), (pyreonTap.y / pyreonDensity).toDouble()); pyreonTip = if (pyreonLocal < 0) listOf() else tooltipLines(tooltipAt(pyreonLocal, pyreonCats, pyreonSeries.map { TooltipSeries(label = it.label, values = it.values, color = it.color) }), ::compact); pyreonTipAt = PyreonChartPt(')
    expect(r.code).toContain('+ renderTooltip(pyreonTip, pyreonTipAt, PyreonChartRect(0.0, 0.0, pyreonW, 200.0), TooltipOptions(fontSize = 11.0, fill = "#ffffff", border = "rgba(132,150,165,0.18)", text = "#1f2937", pad = 8.0, radius = 4.0), ::pyreonChartMeasure)')
  })
  it('a tooltip alone installs the tap; under a window the select maps the local hit to the global index', () => {
    const s = transform(TIP_ONLY, { target: 'swift' })
    expect(s.code).toContain('.contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onEnded { pyreonTap in let pyreonLocal =')
    const w = transform(WINDOWED, { target: 'swift' })
    expect(w.code).toContain('let i = (pyreonLocal < 0 ? -1 : pyreonLocal + pyreonRange.from)')
    const k = transform(WINDOWED, { target: 'kotlin' })
    expect(k.code).toContain('val i = (if (pyreonLocal < 0) -1 else pyreonLocal + pyreonRange.from)')
  })
  it('a named tooltipFormatter lowers (its string split on newlines); the grammar\'s <Tip> draws too and names crosshair as web-only', () => {
    const f = transform(FORMATTED, { target: 'swift' })
    expect(f.warnings).toEqual([])
    expect(f.code).toContain('pyreonTip = pyreonLocal < 0 ? [] : describe(tooltipAt(pyreonLocal, pyreonCats, pyreonSeries.map { TooltipSeries(label: $0.label, values: $0.values, color: $0.color) })).components(separatedBy: "\\n")')
    expect(transform(FORMATTED, { target: 'kotlin' }).code).toContain(').split("\\n")')
    const inline = transform(FORMATTED.replace('tooltipFormatter={describe}', 'tooltipFormatter={(c: TooltipContent) => c.title}'), { target: 'swift' })
    expect(inline.warnings).toEqual(['<PlotChart tooltipFormatter>: must be a NAMED function on native — an inline arrow is not lowered; the default lines apply.'])
    const g = transform(GRAMMAR, { target: 'kotlin' })
    expect(g.warnings).toEqual(['<PlotChart>: `crosshair` is not lowered on native; the chart renders without.'])
    expect(g.code).toContain('renderTooltip(pyreonTip, pyreonTipAt,')
  })
  it('without tooltip the plot host emits exactly as before', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PLAIN, { target })
      expect(r.code).not.toContain('pyreonTip')
      expect(r.code).not.toContain('pyreonLocal')
    }
  })
  const fixtures = { TIP, TIP_ONLY, WINDOWED, FORMATTED, GRAMMAR }
  it('swiftc accepts the tooltip emit', { skip: !isSwiftcAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
  it('kotlinc accepts the tooltip emit', { skip: !isKotlincAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
})
