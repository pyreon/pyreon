// sqrt / symlog / log scales on native: `yScale` and `xScale` are literal
// ChartSpec fields and the view (transform, ticks) is the generated engine's,
// the same code the web draws with.
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

const SRC = `import { Axis, Bar, Chart, Line, Scale, log, sqrt, symlog } from '@pyreon/charts'
interface Row { m: string; a: number }
interface Pt { x: number; y: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3 }, { m: 'Feb', a: 40 }]
const PTS: Pt[] = [{ x: 2, y: 3 }, { x: 300, y: 5 }]
export function App() {
  return (
    <>
      <Chart<Row> data={ROWS} x="m" height={200}>
        <Bar<Row> y="a" />
        <Axis y scale={sqrt()} />
      </Chart>
      <Chart<Pt> data={PTS} xValue="x" height={200}>
        <Line<Pt> y="y" />
        <Scale x={log()} y={symlog({ constant: 10 })} />
      </Chart>
    </>
  )
}
`

describe.each(['swift', 'kotlin'] as const)('scale views on %s', (target) => {
  const eq = target === 'swift' ? ': ' : ' = '
  it('a scale descriptor becomes the engine ScaleView built from its compile-time literal', () => {
    const r = transform(SRC, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`yView${eq}ScaleView(`)
    expect(r.code).toContain('applyScaleView(s, a, "sqrt", 1.0)')
    expect(r.code).toContain('applyScaleView(s, a, "symlog", 10.0)')
    expect(r.code).toContain('viewTicks("log"')
  })
  it('the spoken description names a non-linear scale, as on the web', () => {
    const r = transform(SRC, { target })
    expect(r.code).toContain('The value axis is on a sqrt scale.')
    expect(r.code).toContain('The x axis is on a log scale.')
  })
  it('a linear chart emits none of it (byte-stable)', () => {
    const r = transform(SRC.replace('<Axis y scale={sqrt()} />', '').replace('<Scale x={log()} y={symlog({ constant: 10 })} />', ''), { target })
    expect(r.code).not.toMatch(/ScaleView|applyScaleView|scale\./)
  })
  it('a non-literal constant is named and the axis stays linear', () => {
    const r = transform(SRC.replace('symlog({ constant: 10 })', 'symlog({ constant: ROWS.length })'), { target })
    expect(r.warnings.some((w) => w.includes('needs a literal'))).toBe(true)
  })
})

describe('the scale note and an inline-arrow formatter share the description expression', () => {
  const WITH_FORMAT = SRC.replace('<Axis y scale={sqrt()} />', "<Axis y scale={sqrt()} format={(v) => v.toFixed(1) + ' kg'} />")
  it.each(['swift', 'kotlin'] as const)('%s: the formatter\'s own `+` is not mistaken for the note', (target) => {
    const r = transform(WITH_FORMAT, { target })
    expect(r.code).toContain('The value axis is on a sqrt scale.')
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})

describe('the emit compiles', () => {
  it.skipIf(!isSwiftUIAvailable())('swiftc accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts it', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
