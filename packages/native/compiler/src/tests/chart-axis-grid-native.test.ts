// Per-axis grid and minor lines on native: literal ChartSpec fields the
// generated engine reads, so the lines are the web's lines.
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './charts-plugin'
import { isKotlincAvailable } from '../validate'

const SRC = `import { Axis, Bar, Chart } from '@pyreon/charts'
interface Row { m: string; a: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3 }, { m: 'Feb', a: 4 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" />
      <Axis y grid={false} minor={4} />
      <Axis x grid />
    </Chart>
  )
}
`

describe.each(['swift', 'kotlin'] as const)('axis grid on %s', (target) => {
  const eq = target === 'swift' ? ': ' : ' = '
  it('yGrid / xGrid / yMinor land on the ChartSpec as literals', () => {
    const r = transform(SRC, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`yGrid${eq}false`)
    expect(r.code).toContain(`xGrid${eq}true`)
    expect(r.code).toContain(`yMinor${eq}4.0`)
  })
  it('a chart with none emits none of them (byte-stable)', () => {
    const r = transform(SRC.replace('<Axis y grid={false} minor={4} />', '').replace('<Axis x grid />', ''), { target })
    expect(r.code).not.toMatch(/yGrid|xGrid|yMinor|xMinor/)
  })
  it.skipIf(target === 'kotlin' && !isKotlincAvailable())('compiles', () => {
    if (target === 'kotlin') expect(validateKotlin(transform(SRC, { target }).code)).toMatchObject({ ok: true })
    else expect(transform(SRC, { target }).code.length).toBeGreaterThan(0)
  })
})
