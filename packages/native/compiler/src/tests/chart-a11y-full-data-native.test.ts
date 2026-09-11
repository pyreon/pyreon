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

const SRC = `import { PlotChart, band, bars, bubble } from '@pyreon/charts/plot'
interface Row { label: string; value: number; low: number; high: number; radius: number }
const ROWS: Row[] = [
  { label: 'A', value: 1, low: 0, high: 2, radius: 4 },
  { label: 'B', value: 9, low: 7, high: 10, radius: 8 },
  { label: 'C', value: 2, low: 1, high: 4, radius: 5 },
  { label: 'D', value: 7, low: 6, high: 8, radius: 9 },
  { label: 'E', value: 3, low: 2, high: 5, radius: 6 },
]
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.label} marks={[
    bars((d) => d.value, { errorLow: (d) => d.low, errorHigh: (d) => d.high }),
    bubble((d) => d.value, (d) => d.radius),
    band((d) => d.low, (d) => d.high),
  ]} seriesLabels={['Bars', 'Bubbles', 'Band']} showLegend legendToggle dataZoom maxPoints={3} height={200} />
}`

const BOLLINGER = `import { PlotChart, bollinger } from '@pyreon/charts/plot'
interface Row { label: string; value: number }
const ROWS: Row[] = [{ label: 'A', value: 1 }, { label: 'B', value: 9 }, { label: 'C', value: 2 }, { label: 'D', value: 7 }]
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.label} marks={[...bollinger((d) => d.value, 2)]} seriesLabels={['Range', 'Average']} maxPoints={3} />
}`

describe('native PlotChart accessibility uses the complete source data', () => {
  it('Swift keeps paint thinning separate from the VoiceOver series and categories', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonRows = pyreonKeep.map { pyreonSourceRows[$0] }')
    expect(r.code).toContain('let pyreonA11yValues0: [Double] = ROWS.enumerated().map')
    expect(r.code).toContain('let pyreonA11yErrLow0: [Double] = ROWS.enumerated().map')
    expect(r.code).toContain('let pyreonA11yRRaw1: [Double] = ROWS.enumerated().map')
    expect(r.code).toContain('let pyreonA11yLow2: [Double] = ROWS.enumerated().map')
    expect(r.code).toContain('let pyreonA11yCats: [String] = ROWS.enumerated().map')
    expect(r.code).toContain('categories: pyreonA11yCats, series: pyreonA11ySeriesSource.enumerated().map')
    expect(r.code).not.toContain('pyreonA11ySeriesSource.enumerated().filter')
  })

  it('Kotlin keeps the same full-data TalkBack summary', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonRows = pyreonKeep.map { pyreonSourceRows[it] }')
    expect(r.code).toContain('val pyreonA11yValues0: List<Double> = ROWS.mapIndexed')
    expect(r.code).toContain('val pyreonA11yErrLow0: List<Double> = ROWS.mapIndexed')
    expect(r.code).toContain('val pyreonA11yRRaw1: List<Double> = ROWS.mapIndexed')
    expect(r.code).toContain('val pyreonA11yLow2: List<Double> = ROWS.mapIndexed')
    expect(r.code).toContain('val pyreonA11yCats: List<String> = ROWS.mapIndexed')
    expect(r.code).toContain('categories = pyreonA11yCats, series = pyreonA11ySeriesSource.mapIndexed')
    expect(r.code).not.toContain('pyreonA11ySeriesSource.mapIndexedNotNull')
  })

  it('expanded Bollinger bands also resolve their spoken range and middle line over every row', () => {
    const swift = transform(BOLLINGER, { target: 'swift' })
    const kotlin = transform(BOLLINGER, { target: 'kotlin' })
    expect(swift.warnings).toEqual([
      '<PlotChart maxPoints>: the first mark is a spread indicator, whose derived values are not available until after mark expansion on native; row thinning is skipped.',
    ])
    expect(kotlin.warnings).toEqual(swift.warnings)
    expect(swift.code).toContain('let pyreonA11yRaw0: [Double] = ROWS.enumerated().map')
    expect(swift.code).toContain('values: pyreonA11yUpper0')
    expect(swift.code).toContain('values: pyreonA11yMid0')
    expect(kotlin.code).toContain('val pyreonA11yRaw0: List<Double> = ROWS.mapIndexed')
    expect(kotlin.code).toContain('values = pyreonA11yUpper0')
    expect(kotlin.code).toContain('values = pyreonA11yMid0')
  })

  it.skipIf(!isSwiftUIAvailable())('swiftc accepts the full-data accessibility emit against the real runtime', () => {
    const r = transform(SRC, { target: 'swift' })
    const v = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the full-data accessibility emit', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})
