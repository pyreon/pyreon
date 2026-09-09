// The indicator marks lower to their crossing arithmetic.
//
// `sma`/`ema`/`trend` are DERIVED marks: the accessor gives the raw series and
// a named engine function turns it into the drawn one, the same shape as
// `bubble` → `bubbleRadii`. Their arithmetic lives in `indicator-values.ts`,
// which is in ENGINE_FILES — the generic mark constructors beside it are not,
// because PMTC cannot represent a type parameter and the generator REFUSES an
// emit with warnings, so one generic function would take the whole file
// web-only.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8')

const SRC = `import { PlotChart, line, sma, ema, trend } from '@pyreon/charts/plot'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 14 }]
export function App() {
  return (
    <PlotChart
      data={ROWS}
      x={(d) => d.m}
      height={200}
      marks={[line((d) => d.v), sma((d) => d.v, 3), ema((d) => d.v, 5), trend((d) => d.v)]}
    />
  )
}
`

const BB = `import { PlotChart, bollinger } from '@pyreon/charts/plot'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 14 }, { m: 'Mar', v: 9 }]
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[...bollinger((d) => d.v, 3)]} height={200} />
}
`

describe('indicator marks lower to the crossing arithmetic', () => {
  it('Swift: each derived mark calls its engine function over the mapped rows', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    const rowMap = 'ROWS.enumerated().map { (pyreonI, pyreonD) in pyreonChartDouble(pyreonD.v) }'
    // The plain line is the control: it maps the rows and stops there.
    expect(r.code).toContain(`let pyreonValues0: [Double] = ${rowMap}`)
    expect(r.code).toContain(`let pyreonValues1: [Double] = smaValues(${rowMap}, 3)`)
    expect(r.code).toContain(`let pyreonValues2: [Double] = emaValues(${rowMap}, 5)`)
    // `trend` takes no window, so its options are args[1], not args[2].
    expect(r.code).toContain(`let pyreonValues3: [Double] = trendValues(${rowMap})`)
    // All four draw as lines.
    expect(r.code.match(/Series\(kind: "line"/g) ?? []).toHaveLength(4)
  })

  it('Kotlin: the same through mapIndexed', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    const rowMap = 'ROWS.mapIndexed { pyreonI, pyreonD -> (pyreonD.v).toDouble() }'
    expect(r.code).toContain(`val pyreonValues1: List<Double> = smaValues(${rowMap}, 3)`)
    expect(r.code).toContain(`val pyreonValues2: List<Double> = emaValues(${rowMap}, 5)`)
    expect(r.code).toContain(`val pyreonValues3: List<Double> = trendValues(${rowMap})`)
  })

  it("a non-literal window is NAMED, not lowered to something it isn't", () => {
    const dyn = SRC.replace('sma((d) => d.v, 3)', 'sma((d) => d.v, WINDOW)').replace(
      'const ROWS',
      'const WINDOW = 3\nconst ROWS',
    )
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(dyn, { target })
      expect(r.warnings.join('\n'), target).toContain('needs a NUMERIC LITERAL window')
    }
  })

  it('a bollinger SPREAD expands to the two Series it names', () => {
    // It returns an ARRAY of marks, so it arrives as a spread element rather
    // than a call — the envelope as a band (upper in `values`, lower in
    // `values2`) plus the middle line, which is exactly the web shape.
    const r = transform(BB, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonUpper0: [Double] = bollingerEdge(pyreonRaw0, 3, 2.0, 1.0)')
    expect(r.code).toContain('let pyreonLower0: [Double] = bollingerEdge(pyreonRaw0, 3, 2.0, -1.0)')
    expect(r.code).toContain('let pyreonMid0: [Double] = smaValues(pyreonRaw0, 3)')
    expect(r.code).toContain('Series(kind: "band", values: pyreonUpper0')
    expect(r.code).toContain('values2: pyreonLower0)')
    expect(r.code).toContain('Series(kind: "line", values: pyreonMid0')
  })

  it('Kotlin: the spread expands the same way', () => {
    const r = transform(BB, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonUpper0: List<Double> = bollingerEdge(pyreonRaw0, 3, 2.0, 1.0)')
    expect(r.code).toContain('val pyreonLower0: List<Double> = bollingerEdge(pyreonRaw0, 3, 2.0, -1.0)')
    expect(r.code).toContain('Series(kind = "band", values = pyreonUpper0')
    expect(r.code).toContain('values2 = pyreonLower0)')
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the expanded spread', () => {
    const r = validateKotlin(transform(BB, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftUIAvailable())('swiftc accepts the expanded spread', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(BB, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it('an explicit width lowers; a non-literal one is NAMED', () => {
    const withK = BB.replace('bollinger((d) => d.v, 3)', 'bollinger((d) => d.v, 3, 1.5)')
    expect(transform(withK, { target: 'swift' }).code).toContain('bollingerEdge(pyreonRaw0, 3, 1.5, 1.0)')
    const dynK = BB.replace('bollinger((d) => d.v, 3)', 'bollinger((d) => d.v, 3, K)').replace('const ROWS', 'const K = 1.5\nconst ROWS')
    expect(transform(dynK, { target: 'swift' }).warnings.join('\n')).toContain('width must be a numeric literal')
  })

  it('a spread of anything ELSE is named rather than guessed at', () => {
    const other = BB.replace('...bollinger((d) => d.v, 3)', '...someMarks')
      .replace('const ROWS', 'const someMarks: never[] = []\nconst ROWS')
    expect(transform(other, { target: 'swift' }).warnings.join('\n')).toContain('only `...bollinger(')
  })

  it.skipIf(!isSwiftUIAvailable())('swiftc accepts the emitted indicator calls', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts them too', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
