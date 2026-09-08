// Every native chart canvas is NAMED, and the plot host is DESCRIBED.
//
// A canvas is one opaque node to VoiceOver / TalkBack. The web host names
// it with `describeChart` (the engine's one-paragraph summary) as the
// `aria-label` and adds an offscreen table; natively only a `title` was ever
// applied, so an untitled chart was a blank rectangle and a titled one said
// its title and nothing about its data. `a11y.ts` now crosses with the
// engine and the emitters apply, in the web host's order: an explicit
// `accessibilityLabel`, else the data description (the plot host), else
// `title`, else the family word.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { chartDefaultLabel } from '../chart-hosts'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const APP = `import { PieChart, PlotChart, TreemapChart, bars, compact } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 30 }, { m: 'Mar', v: 20 }]
const TREE = [{ name: 'docs', value: 30 }, { name: 'src', value: 70 }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { label: 'Value' })]} title="Sales" format={compact} height={200} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v)]} accessibilityLabel="Explicit name" height={200} />
      <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.m} title="Share" height={200} />
      <TreemapChart data={TREE} height={200} />
      <TreemapChart data={TREE} accessibilityLabel="Repo by size" height={200} />
    </Stack>
  )
}
`

describe('chartDefaultLabel', () => {
  it('is the family word, and plain "Chart" for the plot and option hosts', () => {
    expect(chartDefaultLabel('PieChart')).toBe('Pie chart')
    expect(chartDefaultLabel('TreemapChart')).toBe('Treemap chart')
    expect(chartDefaultLabel('PlotChart')).toBe('Chart')
    expect(chartDefaultLabel('OptionChart')).toBe('Chart')
  })
})

describe('every native chart canvas is named (Swift)', () => {
  const r = transform(APP, { target: 'swift' })
  it('emits with no warnings — `accessibilityLabel` on a chart host is lowered, not reported', () => {
    expect(r.warnings).toEqual([])
  })
  it('the plot host is DESCRIBED from its painted series and categories, through the chart format, titled', () => {
    expect(r.code).toContain('.accessibilityLabel(describeChart(A11yInput(title: "Sales", categories: pyreonCats, series: pyreonSeries.map { A11ySeries(label: $0.label, values: $0.values, kind: $0.kind, values2: $0.values2, errLow: $0.errLow, errHigh: $0.errHigh) }, format: compact)))')
  })
  it('an explicit accessibilityLabel wins over the description and over the family word', () => {
    expect(r.code).toContain('.accessibilityLabel("Explicit name")')
    expect(r.code).toContain('.accessibilityLabel("Repo by size")')
  })
  it('a titled family host is named by its title; an untitled one by the family word', () => {
    expect(r.code).toContain('.accessibilityLabel("Share")')
    expect(r.code).toContain('.accessibilityLabel("Treemap chart")')
  })
  it('the description sits INSIDE the GeometryReader, where the hoisted series live', () => {
    const i = r.code.indexOf('.accessibilityLabel(describeChart(')
    const open = r.code.lastIndexOf('GeometryReader { pyreonGeo in', i)
    const close = r.code.indexOf('}.frame(height:', i)
    expect(open).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(i)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts the labelled emit', () => {
    const v = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('every native chart canvas is named (Kotlin)', () => {
  const r = transform(APP, { target: 'kotlin' })
  it('emits with no warnings', () => {
    expect(r.warnings).toEqual([])
  })
  it('the plot host is described; explicit labels, titles and the family word follow the same precedence', () => {
    expect(r.code).toContain('.semantics { contentDescription = describeChart(A11yInput(title = "Sales", categories = pyreonCats, series = pyreonSeries.map { A11ySeries(label = it.label, values = it.values, kind = it.kind, values2 = it.values2, errLow = it.errLow, errHigh = it.errHigh) }, format = ::compact)) }')
    expect(r.code).toContain('.semantics { contentDescription = "Explicit name" }')
    expect(r.code).toContain('.semantics { contentDescription = "Repo by size" }')
    expect(r.code).toContain('.semantics { contentDescription = "Share" }')
    expect(r.code).toContain('.semantics { contentDescription = "Treemap chart" }')
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the labelled emit', () => {
    const v = validateKotlin(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('the crossed a11y engine matches the web word for word', () => {
  it('describeChart is in the generated engines, and the web spec text is the one both targets carry', () => {
    const web = read('packages/fundamentals/charts/src/engine/a11y.ts')
    expect(web).toContain('export function describeChart')
    expect(read(ENGINE_SWIFT)).toContain('public func describeChart(_ input: A11yInput) -> String')
    expect(read('packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartEngine.kt')).toContain('fun describeChart(input: A11yInput): String')
  })
})
