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

describe('<Cell visualMap> on native', () => {
  it('a derived legend (`visualMap` alone) warns by name and asks for a domain', () => {
    const r = transform(`import { Cell, Chart } from '@pyreon/charts'
interface Obs { d: string; h: string; n: number }
const ROWS: Obs[] = [{ d: 'Mon', h: '09', n: 1 }]
export function C() { return <Chart data={ROWS}><Cell x="d" y="h" value="n" visualMap /></Chart> }
`, { target: 'swift' })
    expect(r.warnings.join('\n')).toContain('visualMap({ domain: [lo, hi] })')
  })
})

describe('<Zoom window lock> on native', () => {
  const zsrc = `import { Chart, Line, Zoom } from '@pyreon/charts'
interface Row { m: string; a: number }
const ROWS: Row[] = [{ m: 'Jan', a: 1 }, { m: 'Feb', a: 3 }, { m: 'Mar', a: 2 }, { m: 'Apr', a: 5 }]
export function C() { return <Chart data={ROWS} x="m"><Line y="a" /><Zoom window={{ start: 0.5, end: 1 }} lock /></Chart> }
`
  it('lowers the opening window and the lock, same as initialZoom / zoomLimits', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(zsrc, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toMatch(/ZoomWindow\(start ?[:=] ?0\.5, end ?[:=] ?1\.0\)/)
      expect(r.code).toMatch(/ZoomLimits\(lock ?[:=] ?true/)
    }
  })
})
