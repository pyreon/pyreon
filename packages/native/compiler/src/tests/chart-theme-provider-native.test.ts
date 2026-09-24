// The colour mode (`<ColorModeProvider mode>` from @pyreon/core, or
// `<PyreonUI mode>`) and `<ChartThemeProvider theme light dark>` provide
// through context on the web; natively they are compile-time scopes: the
// emitter resolves mode → provider overrides while it emits the children, and
// a chart host without its own `theme` reads that scope — the same layers the
// web resolves at runtime, in the same order (a chart's own `theme` still
// wins). What cannot be read at compile time is named: a reactive mode (the
// charts below follow the platform scheme), and a provider with no literal mode
// above it (the web follows the system scheme; natively the light theme applies).
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const HEAD = `import { Stack } from '@pyreon/primitives'
import type { TreeNode } from '@pyreon/charts'
const DATA: TreeNode[] = [{ name: 'src', children: [{ name: 'core', value: 50 }] }, { name: 'docs', value: 30 }]
interface S { label: string; v: number }
const SL: S[] = [{ label: 'a', v: 3 }, { label: 'b', v: 1 }]
`
const PROVIDED = `import { ColorModeProvider } from '@pyreon/core'
import { ChartThemeProvider, TreemapChart } from '@pyreon/charts'
import { PieChart } from '@pyreon/charts/engine'
${HEAD}export function Dash() {
  return (
    <Stack>
      <ColorModeProvider mode="dark">
        <ChartThemeProvider>
          <TreemapChart data={DATA} title="Files" showTitle showLegend tooltip height={200} />
          <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} showLegend width={240} height={200} />
        </ChartThemeProvider>
      </ColorModeProvider>
      <TreemapChart data={DATA} showLegend height={200} />
    </Stack>
  )
}`
// No chart provider at all: the colour mode alone picks the built-in theme.
const MODE_ONLY = `import { ColorModeProvider } from '@pyreon/core'
import { TreemapChart } from '@pyreon/charts'
import { PieChart } from '@pyreon/charts/engine'
${HEAD}export function Dash() {
  return (
    <Stack>
      <ColorModeProvider mode="dark">
        <TreemapChart data={DATA} title="Files" showTitle showLegend tooltip height={200} />
        <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} showLegend width={240} height={200} />
      </ColorModeProvider>
      <TreemapChart data={DATA} showLegend height={200} />
    </Stack>
  )
}`
// <PyreonUI mode> sets the same mode.
const UI_MODE = `import { PyreonUI } from '@pyreon/ui-core'
import { TreemapChart } from '@pyreon/charts'
import { PieChart } from '@pyreon/charts/engine'
${HEAD}export function Dash() {
  return (
    <Stack>
      <PyreonUI mode="dark">
        <TreemapChart data={DATA} title="Files" showTitle showLegend tooltip height={200} />
        <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} showLegend width={240} height={200} />
      </PyreonUI>
      <TreemapChart data={DATA} showLegend height={200} />
    </Stack>
  )
}`
// A mode set BELOW a provider re-resolves the provider's per-mode override.
const MODE_BELOW = `import { ColorModeProvider } from '@pyreon/core'
import { ChartThemeProvider, TreemapChart } from '@pyreon/charts'
${HEAD}export function Dash() {
  return (
    <ColorModeProvider mode="light">
      <ChartThemeProvider light={{ background: '#fafafa' }} dark={{ background: '#0b1020' }}>
        <ColorModeProvider mode="dark">
          <TreemapChart data={DATA} showLegend height={200} />
        </ColorModeProvider>
      </ChartThemeProvider>
    </ColorModeProvider>
  )
}`
const OWN = `import { chartThemes, TreemapChart } from '@pyreon/charts'
import { PieChart } from '@pyreon/charts/engine'
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
const LAYERED = `import { ColorModeProvider } from '@pyreon/core'
import { ChartThemeProvider, TreemapChart, palettes } from '@pyreon/charts'
${HEAD}export function Dash() {
  return (
    <ColorModeProvider mode="dark">
      <ChartThemeProvider theme={{ palette: palettes.okabeIto, radius: 6 }}>
        <ChartThemeProvider theme={{ text: '#ffffff' }}>
          <TreemapChart data={DATA} theme={{ background: '#000000' }} title="Files" showTitle showLegend tooltip height={200} />
        </ChartThemeProvider>
      </ChartThemeProvider>
    </ColorModeProvider>
  )
}`
const REACTIVE = `import { ColorModeProvider } from '@pyreon/core'
import { TreemapChart } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'
${HEAD}export function Dash() {
  const mode = signal<'light' | 'dark'>('dark')
  return (
    <ColorModeProvider mode={mode()}>
      <TreemapChart data={DATA} showLegend height={200} />
    </ColorModeProvider>
  )
}`
const SYSTEM = `import { ChartThemeProvider, TreemapChart } from '@pyreon/charts'
${HEAD}export function Dash() {
  return (<ChartThemeProvider><TreemapChart data={DATA} showLegend height={200} /></ChartThemeProvider>)
}`

/** The chart lines only — the provider wraps its children in a Group / Box, so whole-file equality would differ by that wrapper and its indentation. */
const chartLines = (code: string): string[] => code.split('\n').map((l) => l.trim()).filter((l) => /pyreon(Options|Title|Legend|Tip|Items|Layout|Probe|Opts)|PyreonChartCanvas|pyreonChartColor|PyreonChartEntrance/.test(l))

describe('the colour mode and <ChartThemeProvider> — compile-time scopes on both targets', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: charts under a dark mode emit exactly what they would with their own theme={chartThemes.dark}; a sibling outside stays unthemed`, () => {
      const o = transform(OWN, { target })
      expect(o.warnings).toEqual([])
      for (const [name, src] of Object.entries({ PROVIDED, MODE_ONLY, UI_MODE })) {
        const p = transform(src, { target })
        expect(p.warnings, name).toEqual([])
        expect(chartLines(p.code), name).toEqual(chartLines(o.code))
        // The outside sibling follows the runtime scheme (its own ground, switched), so three grounds.
        expect(p.code.split('pyreonChartColor').length, name).toBe(4)
        expect(p.code, name).toContain(target === 'swift' ? 'pyreonColorScheme == .dark' : 'isSystemInDarkTheme()')
      }
    })
    it(`${target}: a mode set below a provider picks that provider's override for it`, () => {
      const r = transform(MODE_BELOW, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('#0b1020')
      expect(r.code).not.toContain('#fafafa')
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
  it('a reactive mode cannot be read at compile time: it says so and the charts follow the platform scheme; a provider with no mode above it names the gap', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(REACTIVE, { target })
      expect(r.warnings).toEqual(['<ColorModeProvider mode>: only a literal "light" / "dark" / "system" lowers on native (a reactive mode cannot be read at compile time); charts below follow the platform scheme.'])
      expect(r.code).toContain(target === 'swift' ? 'pyreonColorScheme == .dark' : 'isSystemInDarkTheme()')
      const s = transform(SYSTEM, { target })
      expect(s.warnings).toEqual(['<ChartThemeProvider>: with no literal colour mode above it, the web follows the system scheme; natively the light theme applies — wrap it in `<ColorModeProvider mode="dark">` (or give each chart its own `theme`).'])
    }
  })
  const fixtures = { PROVIDED, LAYERED, MODE_BELOW }
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
