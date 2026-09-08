// `<ChartThemeProvider mode theme>` provides a theme through context on the
// web; natively it was TRANSPARENT (a dark-mode app rendered light charts on
// the phone, with a warning telling the author to theme every chart by hand).
// It is now a compile-time scope: the emitter resolves mode → provider
// overrides while it emits the children, and a chart host without its own
// `theme` reads that scope — the same three layers the web resolves at
// runtime, in the same order (a chart's own `theme` still wins). What cannot
// be read at compile time is named: a reactive or absent `mode` (the web
// follows the system scheme; natively the light theme applies).
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const HEAD = `import { Stack } from '@pyreon/primitives'
import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'src', children: [{ name: 'core', value: 50 }] }, { name: 'docs', value: 30 }]
interface S { label: string; v: number }
const SL: S[] = [{ label: 'a', v: 3 }, { label: 'b', v: 1 }]
`
const PROVIDED = `import { ChartThemeProvider, TreemapChart, PieChart } from '@pyreon/charts/plot'
${HEAD}export function Dash() {
  return (
    <Stack>
      <ChartThemeProvider mode="dark">
        <TreemapChart data={DATA} title="Files" showTitle showLegend tooltip height={200} />
        <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} showLegend width={240} height={200} />
      </ChartThemeProvider>
      <TreemapChart data={DATA} showLegend height={200} />
    </Stack>
  )
}`
const OWN = `import { chartThemes, TreemapChart, PieChart } from '@pyreon/charts/plot'
${HEAD}export function Dash() {
  return (
    <Stack>
      <Stack>
        <TreemapChart data={DATA} theme={chartThemes.dark} title="Files" showTitle showLegend tooltip height={200} />
        <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} theme={chartThemes.dark} showLegend width={240} height={200} />
      </Stack>
      <TreemapChart data={DATA} showLegend height={200} />
    </Stack>
  )
}`
const LAYERED = `import { ChartThemeProvider, TreemapChart, palettes } from '@pyreon/charts/plot'
${HEAD}export function Dash() {
  return (
    <ChartThemeProvider mode="dark" theme={{ palette: palettes.okabeIto, radius: 6 }}>
      <ChartThemeProvider theme={{ text: '#ffffff' }}>
        <TreemapChart data={DATA} theme={{ background: '#000000' }} title="Files" showTitle showLegend tooltip height={200} />
      </ChartThemeProvider>
    </ChartThemeProvider>
  )
}`
const REACTIVE = `import { ChartThemeProvider, TreemapChart } from '@pyreon/charts/plot'
import { signal } from '@pyreon/reactivity'
${HEAD}export function Dash() {
  const mode = signal<'light' | 'dark'>('dark')
  return (
    <ChartThemeProvider mode={mode()}>
      <TreemapChart data={DATA} showLegend height={200} />
    </ChartThemeProvider>
  )
}`
const SYSTEM = `import { ChartThemeProvider, TreemapChart } from '@pyreon/charts/plot'
${HEAD}export function Dash() {
  return (<ChartThemeProvider><TreemapChart data={DATA} showLegend height={200} /></ChartThemeProvider>)
}`

/** The chart lines only — the provider wraps its children in a Group / Box, so whole-file equality would differ by that wrapper and its indentation. */
const chartLines = (code: string): string[] => code.split('\n').map((l) => l.trim()).filter((l) => /pyreon(Options|Title|Legend|Tip|Items|Layout|Probe|Opts)|PyreonChartCanvas|pyreonChartColor|PyreonChartEntrance/.test(l))

describe('<ChartThemeProvider> — a compile-time theme scope on both targets', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: the provider's children emit exactly what they would with their own theme={chartThemes.dark}; a sibling outside stays unthemed`, () => {
      const p = transform(PROVIDED, { target })
      const o = transform(OWN, { target })
      expect(p.warnings).toEqual([])
      expect(o.warnings).toEqual([])
      expect(chartLines(p.code)).toEqual(chartLines(o.code))
      // The outside sibling follows the runtime scheme (its own ground, switched), so three grounds now.
      expect(p.code.split('pyreonChartColor').length).toBe(4)
      expect(p.code).toContain(target === 'swift' ? 'pyreonColorScheme == .dark' : 'isSystemInDarkTheme()')
    })
  }
  it('layers: mode → outer provider overrides → inner provider → the chart\'s own theme, each over the last', () => {
    const r = transform(LAYERED, { target: 'swift' })
    expect(r.warnings).toEqual([])
    // The chart's own literal wins for background; the inner provider's text; the outer's okabeIto palette and radius; the mode's surface and label.
    expect(r.code).toContain('.background(pyreonChartColor("#000000"))')
    expect(r.code).toContain('TitleOptions(fontSize: 15.0, color: "#ffffff", align: "start")')
    expect(r.code).toContain('LegendOptions(fontSize: 11.0, labelColor: "#9aa5b5",')
    expect(r.code).toContain('let pyreonOptions: TreemapOptions = TreemapOptions(palette: ["#e69f00", "#56b4e9", "#009e73", "#f0e442", "#0072b2", "#d55e00", "#cc79a7", "#000000"])')
    expect(r.code).toContain('fill: "#1c2230"')
    expect(r.code).toContain('radius: 6.0)')
  })
  it('a reactive mode cannot be read at compile time and says so; an absent mode names the system-scheme gap once', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(REACTIVE, { target })
      expect(r.warnings).toEqual(['<ChartThemeProvider mode>: only the literal "light" / "dark" lowers on native (a reactive mode cannot be read at compile time); the light theme applies.'])
      expect(r.code).not.toContain('pyreonChartColor(')
      const s = transform(SYSTEM, { target })
      expect(s.warnings).toEqual(['<ChartThemeProvider>: without a literal `mode` the web follows the system scheme; natively the light theme applies — pin `mode="dark"` (or give each chart its own `theme`).'])
    }
  })
  const fixtures = { PROVIDED, LAYERED }
  it('swiftc accepts the provided hosts', { skip: !isSwiftcAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
  it('kotlinc accepts the provided hosts', { skip: !isKotlincAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
})
