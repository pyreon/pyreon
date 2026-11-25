// A native FAMILY chart writes its numbers in the chart's locale (#4832).
//
// The cartesian plot already lowers `locale` to the platform number formatter
// (`NumberFormatter` / `java.text.NumberFormat`). The family hosts printed every
// number through the engine's `plain`: a Czech gauge read `72.5`, a pie's
// tooltip `3.5 (78%)`, a candlestick's axis `12.5`. With `locale` they now pass
// `pyreonLocaleNumberFormatter(tag)` into each engine call that prints a number:
// the tooltip builders, the gauge's value, the candlestick and boxplot axes, the
// polar / parallel / single-axis ticks and the visualMap strip.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './charts-plugin'
import { isKotlincAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const APP = `import { Stack } from '@pyreon/primitives'
import { CalendarChart, ParallelChart, PolarChart, TreemapChart } from '@pyreon/charts'
import type { ParallelAxis, PolarSeries, TreeNode } from '@pyreon/charts'
import { BoxplotChart, CandlestickChart, GaugeChart, HeatmapChart, PieChart, visualMap } from '@pyreon/charts/engine'
import type { PolarAxes } from '@pyreon/charts/engine'
interface S { label: string; v: number }
interface Bar { day: string; o: number; h: number; l: number; c: number }
interface Cell { d: string; hour: string; n: number }
interface Box { x: string; vals: number[] }
const BOXES: Box[] = [{ x: 'po', vals: [1, 2, 3, 4] }]
const SL: S[] = [{ label: 'a', v: 3.5 }, { label: 'b', v: 1 }]
const BARS: Bar[] = [{ day: 'po', o: 10.5, h: 12.5, l: 9.5, c: 11.5 }, { day: 'út', o: 11.5, h: 13.5, l: 10.5, c: 12.5 }]
const CELLS: Cell[] = [{ d: 'po', hour: '09', n: 3.5 }, { d: 'po', hour: '10', n: 5 }, { d: 'út', hour: '09', n: 1 }]
const DATA: TreeNode[] = [{ name: 'src', value: 50.5 }, { name: 'docs', value: 30 }]
const PAXES: PolarAxes = { categories: ['x', 'y'] }
const PSERIES: PolarSeries[] = [{ name: 'a', kind: 'bar', values: [3.5, 4.5] }]
const AXES: ParallelAxis[] = [{ name: 'Cyl', type: 'category', categories: ['4', '6', '8'] }, { name: 'MPG' }]
export function App() {
  return (
    <Stack>
      <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} tooltip locale="cs-CZ" width={240} height={200} />
      <GaugeChart value={72.5} max={100} locale="cs-CZ" height={120} />
      <CandlestickChart data={BARS} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} x={(d) => d.day} locale="cs-CZ" height={180} onSelect={(i: number) => console.log(i)} />
      <BoxplotChart data={BOXES} values={(d) => d.vals} x={(d) => d.x} locale="cs-CZ" width={300} height={160} onSelect={(i: number) => console.log(i)} />
      <HeatmapChart animate={false} data={CELLS} x={(d) => d.hour} y={(d) => d.d} value={(d) => d.n} visualMap={visualMap({ domain: [0, 6], calculable: true, range: [1, 5] })} locale="cs-CZ" width={240} height={160} />
      <TreemapChart animate={false} data={DATA} tooltip locale="cs-CZ" height={200} />
      <PolarChart axes={PAXES} series={PSERIES} tooltip locale="cs-CZ" height={240} />
      <ParallelChart animate={false} axes={AXES} rows={[['4', 30.5], ['8', 22]]} locale="cs-CZ" height={260} />
      <CalendarChart animate={false} start="2026-01-01" end="2026-01-31" values={{ '2026-01-05': 3.5 }} visualMap={visualMap({ domain: [0, 10] })} tooltip locale="cs-CZ" height={160} />
    </Stack>
  )
}
`

const FMT_SWIFT = 'pyreonLocaleNumberFormatter("cs-CZ")'
const FMT_KOTLIN = 'pyreonLocaleNumberFormatter("cs-CZ")'

const cases: [string, RegExp][] = [
  ['the pie tooltip', /pieTip\([^\n]*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the gauge value', /formatNumber\(Double\(72\.5\), pyreonLocaleNumberFormatter\("cs-CZ"\)\)|formatNumber\(\(72\.5\)\.toDouble\(\), pyreonLocaleNumberFormatter\("cs-CZ"\)\)|formatNumber\([^\n]*72\.5[^\n]*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the candlestick axis and its hit', /renderCandlestickChart\([^\n]*Measure, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the boxplot axis', /renderBoxplotChart\([^\n]*Measure, pyreonLocaleNumberFormatter\("cs-CZ"\), pyreonEntrance\)/],
  ['the boxplot hit (the same frame)', /hitBoxplotChart\([^\n]*pyreonBoxes, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the heatmap strip', /renderVisualStrip\([^\n]*pyreonVmSelected\w*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the treemap tooltip', /treemapTip\([^\n]*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the polar ticks and tooltip', /layoutPolar\([^\n]*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the parallel ticks', /layoutParallel\([^\n]*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the calendar tooltip', /calendarTip\([^\n]*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
  ['the calendar strip (the generic host)', /renderCalendar\([^\n]*renderVisualStrip\([^\n]*pyreonVmSelected\w*, pyreonLocaleNumberFormatter\("cs-CZ"\)\)/],
]

describe('family charts with `locale` print numbers with the platform formatter — Swift', () => {
  const r = transform(APP, { target: 'swift' })
  it('emits with no warnings', () => {
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(FMT_SWIFT)
  })
  for (const [what, re] of cases) {
    it(what, () => {
      expect(r.code).toMatch(re)
    })
  }
  it('a family chart without `locale` keeps the engine\'s plain digits', () => {
    const plain = transform(APP.replaceAll(' locale="cs-CZ"', ''), { target: 'swift' })
    expect(plain.code).not.toContain('pyreonLocaleNumberFormatter')
    expect(plain.code).toContain('plain(')
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts the emit', () => {
    const v = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('family charts with `locale` print numbers with the platform formatter — Kotlin', () => {
  const r = transform(APP, { target: 'kotlin' })
  it('emits with no warnings', () => {
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(FMT_KOTLIN)
  })
  for (const [what, re] of cases) {
    it(what, () => {
      expect(r.code).toMatch(re)
    })
  }
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the emit', () => {
    const v = validateKotlin(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})
