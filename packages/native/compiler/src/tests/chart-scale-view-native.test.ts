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

const SRC = `import { Axis, Bar, Chart, Line, Scale } from '@pyreon/charts'
interface Row { m: string; a: number }
interface Pt { x: number; y: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3 }, { m: 'Feb', a: 40 }]
const PTS: Pt[] = [{ x: 2, y: 3 }, { x: 300, y: 5 }]
export function App() {
  return (
    <>
      <Chart<Row> data={ROWS} x="m" height={200}>
        <Bar<Row> y="a" />
        <Axis y scale="sqrt" />
      </Chart>
      <Chart<Pt> data={PTS} xValue="x" height={200}>
        <Line<Pt> y="y" />
        <Scale x="log" y="symlog" />
      </Chart>
    </>
  )
}
`

describe.each(['swift', 'kotlin'] as const)('scale views on %s', (target) => {
  const eq = target === 'swift' ? ': ' : ' = '
  it('yScale and xScale land on the ChartSpec as literals', () => {
    const r = transform(SRC, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`yScale${eq}"sqrt"`)
    expect(r.code).toContain(`yScale${eq}"symlog"`)
    expect(r.code).toContain(`xScale${eq}"log"`)
  })
  it('a linear chart emits neither (byte-stable)', () => {
    const r = transform(SRC.replace('<Axis y scale="sqrt" />', '').replace('<Scale x="log" y="symlog" />', ''), { target })
    expect(r.code).not.toMatch(/yScale|xScale/)
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
