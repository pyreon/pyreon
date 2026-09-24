// The chart's DATA for screen readers on native — the twin of the web host's
// hidden table. The description (`describeChart`) was already the canvas's
// label; this adds the per-point access:
//   iOS: `.accessibilityChartDescriptor(PyreonChartDescriptor(input))` — the
//        Audio Graph and VoiceOver's data explorer.
//   Android: `PyreonChartPoints(input, plot, …)` — one TalkBack node per
//        visible category over the plot.
// Both read the SAME A11yInput the description does.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwift } from '../validate'

const head = `import { PlotChart, bars, line } from '@pyreon/charts/engine'
interface Row { m: string; v: number; w: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10, w: 4 }, { m: 'Feb', v: 30, w: 8 }, { m: 'Mar', v: 20, w: 6 }]
`
const plain = `${head}export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { label: 'Sales' }), line((d) => d.w, { label: 'Cost' })]} title="Q1" height={200} />
}
`
const zoomed = `${head}export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v)]} dataZoom navigator height={200} />
}
`
const decimated = `${head}export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[line((d) => d.v)]} maxPoints={2} height={200} />
}
`
const continuous = `${head}export function App() {
  return <PlotChart data={ROWS} xValue={(d) => d.v} marks={[line((d) => d.w)]} height={200} />
}
`

describe('native chart data for screen readers', () => {
  it('iOS: the plot host carries an AXChartDescriptor over the description\'s input', () => {
    const code = transform(plain, { target: 'swift' }).code
    expect(code).toContain('.accessibilityChartDescriptor(PyreonChartDescriptor(A11yInput(')
  })

  it('Android: one TalkBack node per category, from the same input', () => {
    const code = transform(plain, { target: 'kotlin' }).code
    expect(code).toMatch(/PyreonChartPoints\(A11yInput\(title = "Q1", categories = pyreonCats, [^\n]*layoutChart\(pyreonSpec, ::pyreonChartMeasure\)\.plot, pyreonCats\.size, 0, false/)
  })

  it('Android: a zoomed chart labels its visible rows from the full data', () => {
    const code = transform(zoomed, { target: 'kotlin' }).code
    expect(code).toMatch(/PyreonChartPoints\(A11yInput\([^\n]*categories = pyreonA11yCats[^\n]*pyreonCats\.size, pyreonRange\.from,/)
  })

  it('Android: decimated and continuous-x charts keep the description only (no evenly spaced columns)', () => {
    expect(transform(decimated, { target: 'kotlin' }).code).not.toContain('PyreonChartPoints(')
    expect(transform(continuous, { target: 'kotlin' }).code).not.toContain('PyreonChartPoints(')
  })

  it.skipIf(!isSwiftcAvailable())('swiftc accepts the emit', () => {
    for (const s of [plain, zoomed]) {
      const r = validateSwift(transform(s, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the emit', () => {
    for (const s of [plain, zoomed]) {
      const r = validateKotlin(transform(s, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  }, 900_000)
})
