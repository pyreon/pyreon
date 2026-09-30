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

describe('date(pattern) on native', () => {
  const dsrc = `import { Axis, Chart, Line, date } from '@pyreon/charts'
interface Row { t: number; a: number }
const ROWS: Row[] = [{ t: 1709251200000, a: 1 }, { t: 1711929600000, a: 3 }]
export function C() { return <Chart data={ROWS} xValue="t"><Line y="a" /><Axis x time format={date('MMM YYYY')} /></Chart> }
`
  it('lowers as a call into the generated engine and compiles on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(dsrc, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('date("MMM YYYY")')
    }
    const s = validateSwiftWithStubs(transform(dsrc, { target: 'swift' }).code)
    if (!s.skipped) expect(s.ok, s.error).toBe(true)
    const k = validateKotlin(transform(dsrc, { target: 'kotlin' }).code)
    if (!k.skipped) expect(k.ok, k.error).toBe(true)
  })
})

describe('a numeric x field as categories', () => {
  // The web stringifies a numeric category implicitly; \`[String]\` on iOS
  // rejected it outright ("cannot convert value of type 'Int' to closure result
  // type 'String'"), so the chart did not build.
  const nsrc = `import { Chart, Line } from '@pyreon/charts'
interface Row { year: number; a: number }
const ROWS: Row[] = [{ year: 2023, a: 1 }, { year: 2024, a: 3 }]
export function C() { return <Chart data={ROWS} x="year"><Line y="a" /></Chart> }
`
  it('coerces each category through pyreonChartString and compiles on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(nsrc, { target }).code).toContain('pyreonChartString(pyreonD.year)')
    }
    const s = validateSwiftWithStubs(transform(nsrc, { target: 'swift' }).code)
    if (!s.skipped) expect(s.ok, s.error).toBe(true)
    const k = validateKotlin(transform(nsrc, { target: 'kotlin' }).code)
    if (!k.skipped) expect(k.ok, k.error).toBe(true)
  })
})

describe('<Axis ticks> on native', () => {
  const tsrc = `import { Axis, Chart, Line } from '@pyreon/charts'
interface Row { m: string; a: number }
const ROWS: Row[] = [{ m: 'Jan', a: 1 }, { m: 'Feb', a: 3 }]
export function C() { return <Chart data={ROWS} x="m"><Line y="a" /><Axis y ticks={4} /><Axis x ticks={3} /></Chart> }
`
  it('lowers both tick targets into the spec and compiles on both targets', () => {
    const sw = transform(tsrc, { target: 'swift' })
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('xTicks: 3.0, yTicks: 4.0')
    const kt = transform(tsrc, { target: 'kotlin' })
    expect(kt.code).toContain('xTicks = 3.0')
    expect(kt.code).toContain('yTicks = 4.0')
    const s = validateSwiftWithStubs(sw.code)
    if (!s.skipped) expect(s.ok, s.error).toBe(true)
    const k = validateKotlin(kt.code)
    if (!k.skipped) expect(k.ok, k.error).toBe(true)
  })
})

describe('<Chart by> on native', () => {
  it('warns by name that keyed matching is web-only, and still lowers the chart', () => {
    const src = `import { Bar, Chart } from '@pyreon/charts'
interface Row { id: string; v: number }
const ROWS: Row[] = [{ id: 'a', v: 1 }]
export function C() { return <Chart data={ROWS} x="id" by="id"><Bar y="v" /></Chart> }
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n')).toContain('<Chart by>')
      expect(r.code).toContain('PyreonChartCanvas')
    }
  })
})
