// RTL on native: `<PlotChart rtl>` mirrors the FINISHED draw list about the
// canvas centreline and mirrors every tap back before it is hit tested, on
// both targets — and a family that does not lower `rtl` NAMES it rather than
// dropping it silently.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { chartChromeUnlowered } from '../chart-hosts'
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

  it('every host built through the chrome seam lowers `rtl`', () => {
    // The seam is what makes this cheap: `mirror` and `tapX` live on the
    // chrome, so a family host gets both halves by construction instead of
    // each emitter remembering to take them.
    for (const tag of ['PlotChart', 'TreemapChart', 'PieChart', 'SankeyChart', 'PolarChart', 'GanttChart', 'RadarChart']) {
      expect(chartChromeUnlowered(tag), `${tag} should lower rtl`).not.toContain('rtl')
    }
    const out = transform(`import { TreemapChart } from '@pyreon/charts'
export function App() {
  return <TreemapChart data={[{ name: 'a', value: 1 }]} rtl />
}
`, { target: 'swift' })
    expect(out.code).toContain('pyreonMirrorCmds(')
    expect(out.warnings.filter((w) => w.includes('`rtl`'))).toEqual([])
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

  it('a host whose emitter BYPASSES the chrome seam names `rtl` rather than dropping it', () => {
    // Gauge, Candlestick and Heatmap build their canvas without the chrome,
    // so they get neither half — and say so. A prop added to FAMILY_CHROME
    // must never silently claim a host whose emitter never reads it, which is
    // why those three carry explicit lists.
    for (const tag of ['GaugeChart', 'CandlestickChart', 'HeatmapChart']) {
      expect(chartChromeUnlowered(tag), `${tag} should NOT claim rtl`).toContain('rtl')
    }
    const out = transform(`import { GaugeChart } from '@pyreon/charts'
export function App() {
  return <GaugeChart value={0.4} rtl />
}
`, { target: 'swift' })
    expect(out.warnings.some((w) => w.includes('`rtl`'))).toBe(true)
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
