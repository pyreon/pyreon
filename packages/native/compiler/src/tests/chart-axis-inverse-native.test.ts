// A reversed value axis on native: yInverse / y2Inverse are literal ChartSpec
// fields the generated engine reads (`Domain.inverse` in `scaleLinear`), the
// same code the web draws with. A reversed x axis is named, not guessed at.
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

const SRC = `import { Axis, Bar, Chart, Line } from '@pyreon/charts'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 4, b: 1 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" />
      <Line<Row> y="b" axis="right" />
      <Axis y inverse />
      <Axis y2 inverse />
    </Chart>
  )
}
`

describe.each(['swift', 'kotlin'] as const)('axis inverse on %s', (target) => {
  const eq = target === 'swift' ? ': ' : ' = '
  it('yInverse and y2Inverse land on the ChartSpec as literals, in declaration order', () => {
    const r = transform(SRC, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`yInverse${eq}true`)
    expect(r.code).toContain(`y2Inverse${eq}true`)
    expect(r.code.indexOf('yInverse')).toBeLessThan(r.code.indexOf('y2Inverse'))
  })
  it('only the axis that asks for it is emitted (byte-stable otherwise)', () => {
    const one = transform(SRC.replace('<Axis y2 inverse />', ''), { target })
    expect(one.code).toContain(`yInverse${eq}true`)
    expect(one.code).not.toContain('y2Inverse')
    const none = transform(SRC.replace('<Axis y inverse />', '').replace('<Axis y2 inverse />', ''), { target })
    expect(none.code).not.toContain('Inverse')
  })
  it('a reversed x axis lowers as xInverse and hands the engine its rows reversed through the keep map', () => {
    const r = transform(SRC.replace('<Axis y inverse />', '<Axis x inverse />'), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`xInverse${eq}true`)
    expect(r.code).toContain('pyreonKeep')
    expect(r.code).toMatch(/reversed\(\)/)
  })
  it('without xInverse there is no keep map (byte-stable)', () => {
    expect(transform(SRC, { target }).code).not.toContain('pyreonKeep')
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

const XSRC = SRC.replace('<Axis y inverse />', '<Axis x inverse />')

describe('the x-inverse emit compiles', () => {
  it.skipIf(!isSwiftUIAvailable())('swiftc accepts it', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(XSRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts it', () => {
    const r = validateKotlin(transform(XSRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
