// Bars on a numeric x axis on native: the engine's own `bar-band` module lays the slots out, so the only compiler
// surface is the literal `barSpan` ChartSpec field (and the existing `xValue` accessor).
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './charts-plugin'
import { isKotlincAvailable } from '../validate'

const SRC = `import { Bar, Chart } from '@pyreon/charts'
interface Row { t: number; a: number }
const ROWS: Row[] = [{ t: 1, a: 3 }, { t: 2, a: 4 }, { t: 5, a: 2 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} xValue="t" barSpan={0.5} height={200}>
      <Bar<Row> y="a" />
    </Chart>
  )
}
`

describe.each(['swift', 'kotlin'] as const)('bars on a numeric x axis on %s', (target) => {
  const eq = target === 'swift' ? ': ' : ' = '
  it('barSpan lands on the ChartSpec as a literal next to the numeric x values', () => {
    const r = transform(SRC, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`barSpan${eq}0.5`)
    expect(r.code).toContain('xValues')
  })
  it('a chart that sets no barSpan emits none (byte-stable)', () => {
    expect(transform(SRC.replace(' barSpan={0.5}', ''), { target }).code).not.toContain('barSpan')
  })
  it('a non-literal barSpan warns by name', () => {
    const r = transform(SRC.replace('barSpan={0.5}', 'barSpan={ROWS.length}'), { target })
    expect(r.warnings.join('\n')).toContain('barSpan')
  })
  it.skipIf(target === 'kotlin' && !isKotlincAvailable())('compiles', () => {
    if (target === 'kotlin') expect(validateKotlin(transform(SRC, { target }).code)).toMatchObject({ ok: true })
    else expect(transform(SRC, { target }).code.length).toBeGreaterThan(0)
  })
})
