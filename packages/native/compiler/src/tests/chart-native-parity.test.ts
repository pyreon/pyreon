// Native parity for the plot hosts — what the 2026-09 audit found silently
// DIVERGING between the web and the native emit, each closed here:
//   - a bare host (no theme, no provider) follows the runtime colour scheme
//     on native as it does on the web (it was hard-wired light, silently);
//   - `<BoxplotChart>` lowers (five-number summaries reduced natively over the
//     generated `boxplot-chart` frame) with an entrance;
//   - `<RadarChart>` gets a tap on both targets (it had none — both callbacks
//     vanished with zero warnings);
//   - a rich-hit `onSelect` on a table-driven host WARNS instead of vanishing;
//   - `<ParallelChart tooltip>` and `<MapChart>` warn instead of passing as lowered;
//   - the Kotlin frame hosts key their tap on the vals it captures.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck, validateSwiftWithStubs } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const BOXPLOT = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { BoxplotChart } from '@pyreon/charts/plot'
interface Row { team: string; samples: number[] }
const ROWS: Row[] = [{ team: 'A', samples: [3, 4, 5, 9] }, { team: 'B', samples: [1, 2, 2, 8] }]
export function Spread() {
  const picked = signal(-1)
  return (
    <Stack>
      <BoxplotChart data={ROWS} values={(d) => d.samples} x={(d) => d.team} height={220} title="Spread" data-testid="spread" onSelectIndex={(i: number) => picked.set(i)} />
      <Text>{String(picked())}</Text>
    </Stack>
  )
}`

const RADAR_TAP = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { RadarChart } from '@pyreon/charts/plot'
import type { RadarAxis, RadarHitIndex } from '@pyreon/charts/plot'
interface Team { name: string; scores: number[] }
const TEAMS: Team[] = [{ name: 'A', scores: [3, 4, 5] }]
const AXES: RadarAxis[] = [{ label: 'x', max: 5 }, { label: 'y', max: 5 }, { label: 'z', max: 5 }]
export function Skills() {
  const hit = signal(-1)
  return (
    <Stack>
      <RadarChart data={TEAMS} axes={AXES} values={(d) => d.scores} label={(d) => d.name} showLegend height={220} title="Skills" onSelectIndex={(h: RadarHitIndex) => hit.set(h.series)} />
      <Text>{String(hit())}</Text>
    </Stack>
  )
}`

const RICH_SELECT = `import { Stack } from '@pyreon/primitives'
import { TreemapChart, ParallelChart, MapChart } from '@pyreon/charts/plot'
import type { TreeNode, TreemapCell, ParallelAxis } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'root', value: 10 }]
const AXES: ParallelAxis[] = [{ name: 'a' }, { name: 'b' }]
export function Rich() {
  return (
    <Stack>
      <TreemapChart animate={false} data={DATA} height={200} onSelect={(c: TreemapCell | null) => console.log(c)} />
      <ParallelChart animate={false} axes={AXES} rows={[[1, 2], [3, 4]]} height={200} tooltip />
      <MapChart map="world" values={{}} height={200} />
    </Stack>
  )
}`

const THEMED = `import { Stack } from '@pyreon/primitives'
import { PieChart, ChartThemeProvider, chartThemes } from '@pyreon/charts/plot'
interface S { n: string; v: number }
const SLICES: S[] = [{ n: 'a', v: 1 }, { n: 'b', v: 2 }]
export function Themed() {
  return (
    <Stack>
      <PieChart data={SLICES} value={(d) => d.v} label={(d) => d.n} theme={chartThemes.dark} height={200} />
      <ChartThemeProvider mode="light">
        <PieChart data={SLICES} value={(d) => d.v} label={(d) => d.n} height={200} />
      </ChartThemeProvider>
    </Stack>
  )
}`

const HEAT_KEYED = `import { Stack } from '@pyreon/primitives'
import { HeatmapChart } from '@pyreon/charts/plot'
interface Cell { d: string; hour: string; n: number }
const CELLS: Cell[] = [{ d: 'Mon', hour: '09', n: 3 }]
export function Heat() {
  return (<Stack><HeatmapChart animate={false} data={CELLS} x={(d) => d.hour} y={(d) => d.d} value={(d) => d.n} height={160} onSelectIndex={(i: number) => console.log(i)} /></Stack>)
}`

describe('a bare host follows the runtime colour scheme on native, as on the web', () => {
  it('Swift: every field the two built-in themes disagree on is a colorScheme conditional; the view gains the environment read', () => {
    const r = transform(BOXPLOT, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@Environment(\\.colorScheme) private var pyreonColorScheme: ColorScheme')
    expect(r.code).toContain('background: (pyreonColorScheme == .dark ? "#141821" : "")')
    expect(r.code).toContain('text: (pyreonColorScheme == .dark ? "#e6eaf2" : "#1f2937")')
    // Sizes and timings agree across the themes, so they stay literals.
    expect(r.code).toContain('fontSize: 11.0, titleSize: 15.0, radius: 3.0, enterMs: 700.0, updateMs: 350.0')
    expect(r.code).toContain('palette: (pyreonColorScheme == .dark ? ["#7b9bff"')
  })
  it('Kotlin: the same fields switch on isSystemInDarkTheme()', () => {
    const r = transform(BOXPLOT, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('background = (if (isSystemInDarkTheme()) "#141821" else "")')
    expect(r.code).toContain('palette = (if (isSystemInDarkTheme()) listOf("#7b9bff"')
  })
  it('a named theme or a provider scope pins the scheme — no runtime conditional', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(THEMED, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('colorScheme == .dark')
      expect(r.code).not.toContain('isSystemInDarkTheme()')
    }
  })
})

describe('<BoxplotChart> lowers', () => {
  it('Swift: the samples reduce through the engine\'s fiveNumber into the shared frame, with the tap and the entrance', () => {
    const r = transform(BOXPLOT, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonBoxes: [FiveNumber] = ROWS.enumerated().map { (pyreonI, pyreonD) in fiveNumber((pyreonD.samples).map { pyreonChartDouble($0) }) }')
    expect(r.code).toContain('let pyreonCats: [String] = ROWS.enumerated().map { (pyreonI, pyreonD) in pyreonD.team }')
    expect(r.code).toContain('PyreonChartEntrance(durationMs: 700.0) { pyreonEntrance in')
    expect(r.code).toContain('renderBoxplotChart(pyreonBoxes, Double(pyreonGeo.size.width), 220.0, pyreonCats, pyreonTheme, BoxplotOptions(), pyreonChartMeasure, nil, pyreonEntrance)')
    expect(r.code).toContain('hitBoxplotChart(pyreonBoxes.count, Double(pyreonGeo.size.width), 220.0, pyreonCats, pyreonTheme.fontSize, pyreonChartMeasure, Double(pyreonTap.location.x), Double(pyreonTap.location.y), pyreonBoxes)')
    expect(r.code).toContain('.accessibilityIdentifier("spread")')
  })
  it('Kotlin: the mirror, keyed on the vals the tap captures', () => {
    const r = transform(BOXPLOT, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonBoxes: List<FiveNumber> = ROWS.mapIndexed { pyreonI, pyreonD -> fiveNumber((pyreonD.samples).map { it.toDouble() }) }')
    expect(r.code).toContain('renderBoxplotChart(pyreonBoxes, pyreonW, 220.0, pyreonCats, pyreonTheme, BoxplotOptions(), ::pyreonChartMeasure, null, pyreonEntrance)')
    expect(r.code).toContain('.pointerInput(pyreonBoxes, pyreonCats, pyreonTheme) { detectTapGestures')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts it', () => {
    const r = validateSwiftWithStubs(transform(BOXPLOT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + the real canvas + engine accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(BOXPLOT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts it', () => {
    const r = validateKotlin(transform(BOXPLOT, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('<RadarChart> has a tap on both targets', () => {
  it('Swift: hitRadarIndex against the painted box, the legend height off the y', () => {
    const r = transform(RADAR_TAP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.gesture(DragGesture(minimumDistance: 0).onEnded { pyreonTap in')
    expect(r.code).toContain('hitRadarIndex(AXES, pyreonSeries, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 220.0 - pyreonTop), RadarOptions(')
    expect(r.code).toContain('Double(pyreonTap.location.y) - pyreonTop, 8.0)')
  })
  it('Kotlin: the mirror', () => {
    const r = transform(RADAR_TAP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('detectTapGestures')
    expect(r.code).toContain('hitRadarIndex(AXES, pyreonSeries, PyreonChartRect(0.0, 0.0, pyreonW, 220.0 - pyreonTop), RadarOptions(')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts it', () => {
    const r = validateSwiftWithStubs(transform(RADAR_TAP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts it', () => {
    const r = validateKotlin(transform(RADAR_TAP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('what does not cross says so by name', () => {
  it('a rich-hit onSelect, a Parallel tooltip and the Map host each warn on both targets (they used to vanish)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(RICH_SELECT, { target })
      expect(r.warnings.some((w) => w.includes('<TreemapChart onSelect>') && w.includes('onSelectIndex'))).toBe(true)
      expect(r.warnings.some((w) => w.includes('<ParallelChart>') && w.includes('`tooltip`'))).toBe(true)
      expect(r.warnings.some((w) => w.startsWith('<MapChart> has no native lowering yet'))).toBe(true)
      expect(r.code).not.toContain('MapChart(')
    }
  })
  it('the Kotlin heat host keys its tap on the grid it captures, not Unit', () => {
    const r = transform(HEAT_KEYED, { target: 'kotlin' })
    expect(r.code).toContain('.pointerInput(pyreonXs, pyreonYs, pyreonVals, pyreonGrid, pyreonTheme) { detectTapGestures')
    expect(r.code).not.toContain('.pointerInput(Unit) { detectTapGestures')
  })
})
