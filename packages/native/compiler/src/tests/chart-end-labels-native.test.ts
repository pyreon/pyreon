// `<Legend direct />` on iOS and Android: the spec carries `endLabels`, so the
// generated engine draws the same direct labels the web does.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = (legend: string) => `import { Chart, Legend, Line } from '@pyreon/charts'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 1, b: 2 }, { m: 'Feb', a: 3, b: 1 }]
export function C() { return <Chart data={ROWS} x="m"><Line y="a" label="Alpha" /><Line y="b" label="Beta" />${legend}</Chart> }
`

describe('<Legend direct /> lowers to endLabels', () => {
  it('swift: endLabels in the spec, no legend box', () => {
    const r = transform(src('<Legend direct />'), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('showGrid: true, endLabels: true')
    expect(r.code).not.toContain('showLegend: true')
  })

  it('kotlin: endLabels in the spec, no legend box', () => {
    const r = transform(src('<Legend direct />'), { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('endLabels = true')
    expect(r.code).not.toContain('showLegend = true')
  })

  it('a plain <Legend /> keeps the box and no endLabels', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src('<Legend />'), { target })
      expect(r.code).not.toContain('endLabels')
    }
  })

  it('compiles on both targets', () => {
    const s = validateSwiftWithStubs(transform(src('<Legend direct />'), { target: 'swift' }).code)
    if (!s.skipped) expect(s.ok, s.error).toBe(true)
    const k = validateKotlin(transform(src('<Legend direct />'), { target: 'kotlin' }).code)
    if (!k.skipped) expect(k.ok, k.error).toBe(true)
  })
})
