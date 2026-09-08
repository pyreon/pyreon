// RTL on native: `<PlotChart rtl>` mirrors the FINISHED draw list about the
// canvas centreline and mirrors every tap back before it is hit tested, on
// both targets — and a family that does not lower `rtl` NAMES it rather than
// dropping it silently.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { ACCESSOR_CHART_HOSTS, CHART_HOSTS, FRAME_CHART_HOSTS, chartChromeUnlowered } from '../chart-hosts'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const RTL = `import { PlotChart, bars } from '@pyreon/charts/plot'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 40 }, { m: 'Mar', v: 25 }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v)]} rtl height={220} onSelect={(i) => console.log(i)} />
    </Stack>
  )
}
`

const LTR = RTL.replace(' rtl height', ' height')

describe('<PlotChart rtl> on native', () => {
  it('Swift mirrors the painted list and the tap', () => {
    const out = transform(RTL, { target: 'swift' })
    expect(out.code).toContain('pyreonMirrorCmds(')
    // The tap is mirrored back for the hit test — the pair that has to agree.
    expect(out.code).toContain(' - Double(pyreonTap.location.x))')
    expect(out.warnings.filter((w) => w.includes('rtl'))).toEqual([])
  })

  it('Kotlin mirrors the painted list and the tap', () => {
    const out = transform(RTL, { target: 'kotlin' })
    expect(out.code).toContain('pyreonMirrorCmds(')
    expect(out.code).toContain(' - (pyreonTap.x / pyreonDensity).toDouble())')
    expect(out.warnings.filter((w) => w.includes('rtl'))).toEqual([])
  })

  it('without `rtl` the emit is byte-identical to before — the flag is the only difference', () => {
    // The property that keeps this from being a risk to every existing chart:
    // an LTR emit must not move at all.
    for (const target of ['swift', 'kotlin'] as const) {
      const off = transform(LTR, { target })
      expect(off.code).not.toContain('pyreonMirrorCmds')
      expect(off.code).not.toContain(' - Double(pyreonTap.location.x)')
      expect(off.code).not.toContain(' - (pyreonTap.x / pyreonDensity)')
    }
  })

  it('EVERY native chart host lowers `rtl` — asserted over the registry, not a list', () => {
    // Totality on purpose. A hand-written list of tags passes forever while a
    // host added next month silently ignores the prop; asking the registry
    // means a new host has to answer the question. `rtl` reaches the family
    // and accessor hosts through the chrome seam and the three frame hosts
    // (gauge, candlestick, heatmap) through `swiftRtl` / `kotlinRtl`.
    const tags = [...Object.keys(CHART_HOSTS), ...Object.keys(ACCESSOR_CHART_HOSTS), ...Object.keys(FRAME_CHART_HOSTS)]
    expect(tags.length).toBeGreaterThan(10)
    const unlowered = tags.filter((t) => chartChromeUnlowered(t).includes('rtl'))
    expect(unlowered, 'these hosts would drop `rtl` silently').toEqual([])
  })

  it('the three hosts that bypass the chrome seam still mirror, on both targets', () => {
    // They build their canvas directly, so they were the ones that could have
    // been left behind — and a gauge is the case with no tap at all, where
    // only the paint half exists to get wrong.
    const cases: [string, string][] = [
      ['GaugeChart', `<GaugeChart value={0.4} rtl />`],
      ['CandlestickChart', `<CandlestickChart data={[{ o: 1, h: 3, l: 0, c: 2, d: 'Mon' }]} open={(r) => r.o} high={(r) => r.h} low={(r) => r.l} close={(r) => r.c} x={(r) => r.d} rtl />`],
      ['HeatmapChart', `<HeatmapChart data={[{ r: 'a', c: 'b', v: 1 }]} x={(d) => d.r} y={(d) => d.c} value={(d) => d.v} rtl />`],
    ]
    for (const [tag, jsx] of cases) {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(`import { ${tag} } from '@pyreon/charts'
export function App() {
  return ${jsx}
}
`, { target })
        expect(out.code, `${tag} on ${target} must mirror`).toContain('pyreonMirrorCmds(')
        expect(out.warnings.filter((w) => w.includes('`rtl`')), `${tag} on ${target}`).toEqual([])
      }
    }
  })

  it('a FAMILY host mirrors its tap too, on both targets', () => {
    // The paint half is easy to add and easy to add ALONE. This asserts the
    // pair on a host that is not the plot: a treemap that painted mirrored
    // and hit-tested raw would report the cell on the opposite side.
    const src = (rtl: string): string => `import { TreemapChart } from '@pyreon/charts'
export function App() {
  return <TreemapChart data={[{ name: 'a', value: 1 }]}${rtl} onSelectIndex={(i) => console.log(i)} />
}
`
    const sw = transform(src(' rtl'), { target: 'swift' })
    expect(sw.code).toContain('pyreonMirrorCmds(')
    expect(sw.code).toContain('- Double(pyreonTap.location.x))')

    const kt = transform(src(' rtl'), { target: 'kotlin' })
    expect(kt.code).toContain('pyreonMirrorCmds(')
    expect(kt.code).toContain('- (pyreonTap.x / pyreonDensity).toDouble())')

    // And an LTR family emit is untouched.
    for (const target of ['swift', 'kotlin'] as const) {
      const off = transform(src(''), { target })
      expect(off.code).not.toContain('pyreonMirrorCmds')
    }
  })

  it('mirrors EXACTLY once per host — a double mirror is the identity, and silent', () => {
    // The bug this pins shipped green: `kotlinFrameHostLets` mirrors what it
    // is handed, and the Kotlin radar ALSO pre-mirrored, so `<RadarChart rtl>`
    // rendered left-to-right on Android while every structural check passed —
    // a mirror is its own inverse, so applying it twice looks like applying it
    // never. Counting is the only assertion that can tell those apart.
    const src = (tag: string, props: string, rtl: string): string => `import { ${tag} } from '@pyreon/charts'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'x', a: 1, b: 2 }]
export function App() {
  return <${tag} ${props}${rtl} />
}
`
    const cases: [string, string][] = [
      ['RadarChart', `data={ROWS} axes={[{ label: 'a', max: 3 }, { label: 'b', max: 3 }]} values={(d) => [d.a, d.b]} label={(d) => d.m}`],
      ['PieChart', `data={ROWS} value={(d) => d.a} label={(d) => d.m}`],
      ['GaugeChart', `value={0.4}`],
    ]
    for (const [tag, props] of cases) {
      for (const target of ['swift', 'kotlin'] as const) {
        const on = transform(src(tag, props, ' rtl'), { target }).code
        const off = transform(src(tag, props, ''), { target }).code
        expect((on.match(/pyreonMirrorCmds/g) ?? []).length, `${tag} on ${target} must mirror exactly once`).toBe(1)
        expect((off.match(/pyreonMirrorCmds/g) ?? []).length, `${tag} on ${target} must not mirror when LTR`).toBe(0)
      }
    }
  })

  it.skipIf(!isSwiftUIAvailable())('the RTL emit type-checks against the real SwiftUI SDK', () => {
    const r = validateSwiftTypecheck(
      read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(RTL, { target: 'swift' }).code,
    )
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the RTL emit compiles with the real kotlinc', () => {
    const r = validateKotlin(transform(RTL, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
