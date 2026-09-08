// `band` and `stackedArea` on native.
//
// `stackedArea` is an ordinary kind string. `band` is not: it is the one mark
// whose channels read in the OPPOSITE order to every other — `band(low, high)`
// puts the series value second — and the one that carries a second value
// channel through to `Series.values2`. Both of those are places an emitter
// can be quietly wrong in a way only a real compile catches.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const HEAD = `import { PlotChart, stackedArea, band, line } from '@pyreon/charts/plot'
interface Row { m: string; a: number; b: number; lo: number; hi: number; v: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 4, lo: 2, hi: 8, v: 5 }]
export function App() {
  return (
`
const STACKED = `${HEAD}    <PlotChart data={ROWS} x={(d) => d.m} marks={[stackedArea((d) => d.a), stackedArea((d) => d.b)]} height={200} />
  )
}
`
const BAND = `${HEAD}    <PlotChart data={ROWS} x={(d) => d.m} marks={[band((d) => d.lo, (d) => d.hi), line((d) => d.v)]} height={200} />
  )
}
`

describe('<PlotChart> band / stackedArea on native', () => {
  it('stackedArea lowers as its own kind, on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(STACKED, { target })
      expect(r.warnings, target).toEqual([])
      expect(r.code).toContain('"stackedArea"')
    }
  })

  it('band takes its SERIES value from the second argument and its lower bound from the first', () => {
    // The ordering is the whole risk. `band(low, high)` must emit `values`
    // from `high` and `values2` from `low`; swapping them draws the region
    // upside down and no type would object.
    const sw = transform(BAND, { target: 'swift' })
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('pyreonChartDouble(pyreonD.hi)')
    expect(sw.code).toMatch(/let pyreonLow0: \[Double\][^\n]*pyreonD\.lo/)
    expect(sw.code).toContain('values2: pyreonLow0')

    const kt = transform(BAND, { target: 'kotlin' })
    expect(kt.warnings).toEqual([])
    expect(kt.code).toMatch(/val pyreonLow0: List<Double>[^\n]*pyreonD\.lo/)
    expect(kt.code).toContain('values2 = pyreonLow0')
  })

  it('a band without its lower bound is reported, not emitted half-formed', () => {
    const oneArg = BAND.replace('band((d) => d.lo, (d) => d.hi)', 'band((d) => d.lo)')
    const r = transform(oneArg, { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('band'))).toBe(true)
  })

  it('the GRAMMAR forms desugar to the same marks the array form builds', () => {
    // `<Plot><Layer/><Band/></Plot>` is the other spelling of the same spec.
    // `<Band>` is the one mark with no `y` — a region has two bounds and no
    // single value — so it needs its own desugar branch, and without it the
    // generic path rejected it as "needs a `y` channel".
    const src = `import { Plot, Layer, Band } from '@pyreon/charts/plot'
interface Row { m: string; a: number; lo: number; hi: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, lo: 1, hi: 5 }]
export function App() {
  return <Plot data={ROWS} x="m" height={200}><Layer y="a" /><Band low="lo" high="hi" /></Plot>
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings, target).toEqual([])
      expect(r.code, target).toContain('"stackedArea"')
      expect(r.code, target).toContain('"band"')
    }
  })

  it('a <Band> missing a bound is named, not reported as a missing `y`', () => {
    const src = `import { Plot, Band } from '@pyreon/charts/plot'
interface Row { m: string; lo: number }
const ROWS: Row[] = [{ m: 'Jan', lo: 1 }]
export function App() {
  return <Plot data={ROWS} x="m"><Band low="lo" /></Plot>
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('`low` and a `high`'))).toBe(true)
  })

  it.skipIf(!isSwiftUIAvailable())('swiftc accepts both emits', () => {
    for (const src of [STACKED, BAND]) {
      const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(src, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts both emits', () => {
    for (const src of [STACKED, BAND]) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})
