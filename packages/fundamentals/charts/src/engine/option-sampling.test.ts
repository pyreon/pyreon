import { describe, expect, it } from 'vitest'
import { compileOption } from './option'

/**
 * `sampling` / `large` / `progressive` — ECharts' large-data keys — resolve to
 * this engine's one large-data mechanism: decimation to a bounded point count
 * with every series and the category axis thinned on the SAME rows.
 */
const points = (n: number): number[] => Array.from({ length: n }, (_, i) => Math.sin(i / 7) * 100 + (i % 13))
const labels = (n: number): string[] => Array.from({ length: n }, (_, i) => 'c' + String(i))

describe('large data', () => {
  it('sampling: "lttb" thins a series past the pixel width, keeping the category axis aligned', () => {
    const n = 5000
    const { spec, warnings } = compileOption({ xAxis: { type: 'category', data: labels(n) }, yAxis: {}, series: [{ type: 'line', sampling: 'lttb', data: points(n) }] }, { width: 640 })
    expect(warnings).toEqual([])
    expect(spec.series[0]!.values.length).toBe(640)
    expect(spec.categories.length).toBe(640)
    // The first and last rows survive (LTTB anchors), and every kept row is a real datum.
    expect(spec.categories[0]).toBe('c0')
    expect(spec.categories[639]).toBe('c' + String(n - 1))
    expect(spec.series[0]!.values[0]).toBe(points(n)[0])
  })

  it('every aligned series is thinned on the same rows; a continuous x is thinned with them', () => {
    const n = 4000
    const xs = Array.from({ length: n }, (_, i) => i * 2)
    const a = points(n)
    const b = points(n).map((v) => -v)
    const { spec } = compileOption({ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', sampling: 'lttb', data: a.map((v, i) => [xs[i], v]) }, { type: 'line', data: b.map((v, i) => [xs[i], v]) }] }, { width: 400 })
    expect(spec.series[0]!.values.length).toBe(400)
    expect(spec.series[1]!.values.length).toBe(400)
    expect(spec.xValues!.length).toBe(400)
    for (let i = 0; i < 400; i++) {
      const at = spec.xValues![i]! / 2
      expect(spec.series[0]!.values[i]).toBe(a[at])
      expect(spec.series[1]!.values[i]).toBe(b[at])
    }
  })

  it('aggregate sampling buckets by max / min / average / sum and skips gaps', () => {
    const data = [1, 5, 2, 8, NaN, 4, 7, 3]
    const run = (sampling: string) => compileOption({ xAxis: { type: 'category', data: labels(8) }, yAxis: {}, series: [{ type: 'bar', sampling, data: data.map((v) => (Number.isNaN(v) ? null : v)) }] }, { width: 4 }).spec
    expect(run('max').series[0]!.values).toEqual([5, 8, 4, 7])
    expect(run('min').series[0]!.values).toEqual([1, 2, 4, 3])
    expect(run('average').series[0]!.values).toEqual([3, 5, 4, 5])
    expect(run('sum').series[0]!.values).toEqual([6, 10, 4, 10])
    expect(run('max').categories).toEqual(['c0', 'c2', 'c4', 'c6'])
  })

  it('large + largeThreshold and progressive + progressiveThreshold bound the point count; below the threshold nothing changes', () => {
    const n = 2500
    const large = compileOption({ xAxis: { type: 'category', data: labels(n) }, yAxis: {}, series: [{ type: 'line', large: true, data: points(n) }] }).spec
    expect(large.series[0]!.values.length).toBe(2000)
    const custom = compileOption({ xAxis: { type: 'category', data: labels(n) }, yAxis: {}, series: [{ type: 'line', large: true, largeThreshold: 500, data: points(n) }] }).spec
    expect(custom.series[0]!.values.length).toBe(500)
    const progressive = compileOption({ xAxis: { type: 'category', data: labels(n) }, yAxis: {}, series: [{ type: 'scatter', progressive: 400, progressiveThreshold: 1000, data: points(n) }] }).spec
    expect(progressive.series[0]!.values.length).toBe(1000)
    const small = compileOption({ xAxis: { type: 'category', data: labels(100) }, yAxis: {}, series: [{ type: 'line', large: true, sampling: 'lttb', data: points(100) }] }, { width: 640 }).spec
    expect(small.series[0]!.values.length).toBe(100)
  })

  it('series of different lengths are never thinned (it would misalign the shared x); an unknown sampling warns by name', () => {
    const mixed = compileOption({ xAxis: { type: 'category', data: labels(3000) }, yAxis: {}, series: [{ type: 'line', sampling: 'lttb', data: points(3000) }, { type: 'line', data: points(10) }] }, { width: 100 })
    expect(mixed.spec.series[0]!.values.length).toBe(3000)
    expect(mixed.spec.series[1]!.values.length).toBe(10)
    const unknown = compileOption({ xAxis: { type: 'category', data: labels(3000) }, yAxis: {}, series: [{ type: 'line', sampling: 'median', data: points(3000) }] }, { width: 100 })
    expect(unknown.warnings.map((w) => w.code + ' ' + w.path)).toEqual(['series-option-unsupported series[0].sampling'])
    expect(unknown.spec.series[0]!.values.length).toBe(3000)
  })
})
