import { describe, expect, it } from 'vitest'
import { compileOption } from '@pyreon/charts/plot'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' large-data keys cross the OptionChart natively: `sampling`,
 * `large` / `largeThreshold` and `progressive` / `progressiveThreshold` thin
 * the literal rows at COMPILE time through the web facade's own decimation
 * (`@pyreon/charts/option-layer`), against the option's static `width` (or
 * the web's own 640 default), so the native chart carries the datums the web
 * draws. An unknown `sampling` is named and leaves the series unthinned.
 */
const values = (n: number): number[] => Array.from({ length: n }, (_, i) => Math.round(Math.sin(i / 7) * 100) + (i % 13))
const labels = (n: number): string[] => Array.from({ length: n }, (_, i) => 'c' + String(i))
const app = (series: string, width = '', n = 200): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart${width} option={{ xAxis: { type: 'category', data: ${JSON.stringify(labels(n))} }, yAxis: {}, series: [${series}] }} />
}`

// The row literals appear more than once in an emit (the a11y table carries
// the full rows), so count DISTINCT category labels rather than occurrences.
const rowCount = (code: string): number => new Set(code.match(/"c\d+"/g) ?? []).size

describe.each(['swift', 'kotlin'] as const)('large data on %s', (target) => {
  it('sampling: "lttb" thins the rows to the static width, keeping the same datums the web keeps, with zero warnings, and compiles', () => {
    const r = transform(app(`{ type: 'line', sampling: 'lttb', data: ${JSON.stringify(values(200))} }`, ' width={40}'), { target })
    expect(r.warnings).toEqual([])
    expect(rowCount(r.code)).toBe(40)
    // The web, at the same width, keeps exactly these rows.
    const web = compileOption({ xAxis: { type: 'category', data: labels(200) }, yAxis: {}, series: [{ type: 'line', sampling: 'lttb', data: values(200) }] }, { width: 40 }).spec
    expect(web.categories.length).toBe(40)
    for (const c of web.categories) expect(r.code).toContain(`"${c}"`)
    expect(r.code).toContain('"c199"')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('without a width the web default (640) applies, so 200 rows stay whole; large + largeThreshold bounds them', () => {
    const whole = transform(app(`{ type: 'line', sampling: 'lttb', data: ${JSON.stringify(values(200))} }`), { target })
    expect(whole.warnings).toEqual([])
    expect(rowCount(whole.code)).toBe(200)
    const large = transform(app(`{ type: 'scatter', large: true, largeThreshold: 50, data: ${JSON.stringify(values(200))} }`), { target })
    expect(large.warnings).toEqual([])
    expect(rowCount(large.code)).toBe(50)
    const progressive = transform(app(`{ type: 'line', progressive: 400, progressiveThreshold: 25, data: ${JSON.stringify(values(200))} }`), { target })
    expect(progressive.warnings).toEqual([])
    expect(rowCount(progressive.code)).toBe(25)
  })

  it('bucket methods aggregate every aligned series on the same rows, like the web', () => {
    const r = transform(app(`{ type: 'bar', sampling: 'max', data: [1, 5, 2, 8, 6, 4, 7, 3] }, { type: 'bar', data: [10, 50, 20, 80, 60, 40, 70, 30] }`, ' width={4}', 8), { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(rowCount(r.code)).toBe(4)
    for (const v of [5, 8, 6, 7]) expect(r.code).toContain(`s0${sep}${v}`)
    for (const v of [50, 80, 60, 70]) expect(r.code).toContain(`s1${sep}${v}`)
    expect(r.code).toContain('"c0"')
    expect(r.code).toContain('"c6"')
    expect(r.code).not.toContain('"c1"')
  })

  it('an unknown sampling method is named and the series stays whole', () => {
    const r = transform(app(`{ type: 'line', sampling: 'median', data: ${JSON.stringify(values(200))} }`, ' width={40}'), { target })
    expect(r.warnings).toEqual([expect.stringContaining('option.series[0].sampling>: sampling "median" is not supported')])
    expect(rowCount(r.code)).toBe(200)
  })
})
