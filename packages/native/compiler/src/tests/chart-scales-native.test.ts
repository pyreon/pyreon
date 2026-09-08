// Batch 2 on native: the spec switches (log view, time y, 100% stack, axis
// titles, label mode) lower as literals on both targets, `<Scale>` /
// `<Axis title labels scale time>` desugar, the waterfall mark lowers, and
// the web-only pieces (error accessors, `<Histogram>`, `locale`, `facet`)
// are NAMED rather than dropped — then the real toolchains compile the emit.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const SPEC = `import { PlotChart, bars, line, waterfall } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number; d: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10, d: 4 }, { m: 'Feb', v: 100, d: -2 }, { m: 'Mar', v: 1000, d: 7 }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { label: 'Value' }), line((d) => d.v)]} yScale="log" xTitle="Month" yTitle="Value" xLabels="rotate" height={220} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[waterfall((d) => d.d, { negativeColor: '#f43f5e', showValues: true })]} stackNormalize={false} yTime={false} height={200} />
    </Stack>
  )
}
`

const GRAMMAR = `import { Axis, Bar, Plot, Scale } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 4, b: 1 }]
export function App() {
  return (
    <Stack>
      <Plot data={ROWS} x="m" height={200}>
        <Scale y="log" normalize />
        <Axis x title="Month" labels="thin" />
        <Axis y title="Share" />
        <Bar y="a" stack />
        <Bar y="b" stack />
      </Plot>
      <Plot data={ROWS} x="m" height={160}>
        <Scale y="time" x="time" />
        <Bar y="a" waterfall negativeColor="#f00" />
      </Plot>
    </Stack>
  )
}
`

describe('batch-2 spec switches lower as literals', () => {
  it('Swift: yScale / titles / xLabels land on ChartSpec; a waterfall mark lowers with its negative colour', () => {
    const r = transform(SPEC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('yScale: "log"')
    expect(r.code).toContain('xTitle: "Month"')
    expect(r.code).toContain('yTitle: "Value"')
    expect(r.code).toContain('xLabels: "rotate"')
    expect(r.code).toContain('stackNormalize: false')
    expect(r.code).toContain('yTime: false')
    expect(r.code).toContain('kind: "waterfall"')
    expect(r.code).toContain('negativeColor: "#f43f5e"')
  })
  it('Kotlin: the same switches with the named-argument spelling', () => {
    const r = transform(SPEC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('yScale = "log"')
    expect(r.code).toContain('xTitle = "Month"')
    expect(r.code).toContain('xLabels = "rotate"')
    expect(r.code).toContain('kind = "waterfall"')
    expect(r.code).toContain('negativeColor = "#f43f5e"')
  })
  it('a non-literal switch warns by name and is left off the spec', () => {
    // A signal read is the shape the compiler cannot fold into a literal.
    const src = SPEC.replace('yScale="log"', 'yScale={mode()}').replace("import { Stack }", "import { signal } from '@pyreon/reactivity'\nimport { Stack }").replace('const ROWS', 'const mode = signal("log")\nconst ROWS')
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('`yScale` must be a string literal on native'))).toBe(true)
    expect(r.code).not.toContain('yScale:')
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts the emit', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(SPEC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the emit', () => {
    const r = validateKotlin(transform(SPEC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('<Scale> and the widened <Axis> desugar; <Bar waterfall> picks the waterfall mark', () => {
  it('Swift: the grammar reaches the same spec fields the props do', () => {
    const r = transform(GRAMMAR, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('yScale: "log"')
    expect(r.code).toContain('stackNormalize: true')
    expect(r.code).toContain('xTitle: "Month"')
    expect(r.code).toContain('xLabels: "thin"')
    expect(r.code).toContain('yTitle: "Share"')
    expect(r.code).toContain('yTime: true')
    expect(r.code).toContain('xTime: true')
    expect(r.code).toContain('kind: "waterfall"')
    expect(r.code).toContain('negativeColor: "#f00"')
    // Byte-identical to the props form for the same chart.
    const props = `import { PlotChart, stackedBars } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 4, b: 1 }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} height={200} marks={[stackedBars((d) => d.a), stackedBars((d) => d.b)]} xTitle="Month" xLabels="thin" yTitle="Share" yScale="log" stackNormalize />
    </Stack>
  )
}
`
    const one = transform(GRAMMAR.replace(/<Plot data=\{ROWS\} x="m" height=\{160\}>[\s\S]*?<\/Plot>\n/, ''), { target: 'swift' }).code
    expect(one).toBe(transform(props, { target: 'swift' }).code)
  })
  it('Kotlin: the same desugar', () => {
    const r = transform(GRAMMAR, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('yScale = "log"')
    expect(r.code).toContain('stackNormalize = true')
    expect(r.code).toContain('kind = "waterfall"')
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc accepts the grammar emit', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(GRAMMAR, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the grammar emit', () => {
    const r = validateKotlin(transform(GRAMMAR, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('the web-only pieces are named, never dropped silently', () => {
  it('error accessors on a mark, <Histogram>, locale and facet each warn by name on both targets', () => {
    const src = `import { Bar, Histogram, Plot, PlotChart, bars } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number; lo: number; hi: number; r: string }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 8, hi: 12, r: 'eu' }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { errorLow: (d) => d.lo, errorHigh: (d) => d.hi })]} locale="de-DE" />
      <Plot data={ROWS} facet="r" facetColumns={2}>
        <Histogram x="v" bins={5} />
        <Bar y="v" />
      </Plot>
    </Stack>
  )
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      const all = r.warnings.join('\n')
      // `errorLow` / `errorHigh` LOWER now (see the error-bar block below) —
      // what stays web-only here is the row reshape, Intl and the panel grid.
      expect(all, target).not.toContain('is a per-row accessor')
      expect(all, target).toContain('`locale`')
      expect(all, target).toContain('<Histogram> bins the rows on the web only')
      expect(all, target).toContain('`facet`')
    }
  })
})

describe('error bars cross — the bounds ride the same row map the values do', () => {
  const ERR = `import { PlotChart, bars, points } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number; lo: number; hi: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 8, hi: 12 }, { m: 'Feb', v: 30, lo: 25, hi: 34 }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { label: 'V', errorLow: (d) => d.lo, errorHigh: (d) => d.hi })]} height={200} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[points((d) => d.v, { errorLow: (d) => d.lo, errorHigh: (d) => d.hi })]} height={200} />
    </Stack>
  )
}
`
  it('Swift: two row maps per mark, appended to the Series as errLow / errHigh, no warning', () => {
    const r = transform(ERR, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonErrLow0: [Double] = ROWS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.lo) }')
    expect(r.code).toContain('let pyreonErrHigh0: [Double] = ROWS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.hi) }')
    // LAST in the Series init on both targets, so they append — Swift requires
    // call-site argument order to match the declaration.
    expect(r.code).toContain('label: "V", showValues: false, errLow: pyreonErrLow0, errHigh: pyreonErrHigh0)')
  })
  it('Kotlin: the same, in the named-argument spelling', () => {
    const r = transform(ERR, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonErrLow0: List<Double> = ROWS.mapIndexed { pyreonI, pyreonD -> (pyreonD.lo).toDouble() }')
    expect(r.code).toContain('errLow = pyreonErrLow0, errHigh = pyreonErrHigh0)')
  })
  it('ONE bound alone is named and dropped — a whisker has no extent without both (as on the web)', () => {
    const half = `import { PlotChart, bars } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number; lo: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 8 }]
export function App() {
  return (<Stack><PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { errorLow: (d) => d.lo })]} height={200} /></Stack>)
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(half, { target })
      expect(r.warnings.join('\n'), target).toContain('an error bar needs BOTH `errorLow` and `errorHigh`')
      expect(r.code, target).not.toContain('errLow')
    }
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts the bounds', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(ERR, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the bounds', () => {
    const r = validateKotlin(transform(ERR, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
