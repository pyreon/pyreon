// The remaining edges of the axis work, each on the draw list or the compiled
// spec: an inverted axis with no category names, an inverted LOG axis, value
// labels that carry their own size or fall back per datum, and two facade
// shapes (a nested-array x axis, a markLine pair whose second end is not an
// object).
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'
import { defaultTheme, invertCategories, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (over: Partial<Series> = {}): Series => ({ kind: 'bars', values: [1, 2, 3], color: '#000', width: 1, radius: 3, label: 'S', ...over })
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400,
  height: 300,
  series: [series()],
  categories: ['a', 'b', 'c'],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...over,
})
const texts = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text')

describe('inversion without category names', () => {
  it('an inverted axis with NO categories reverses the data and leaves the categories empty', () => {
    const out = invertCategories(spec({ categories: [], xInverse: true }))
    expect(out.categories).toEqual([])
    expect(out.series[0]!.values).toEqual([3, 2, 1])
  })
})

describe('an inverted log axis', () => {
  it('draws differently from the upright log axis', () => {
    const base = { yScale: 'log' as const, series: [series({ kind: 'line', values: [1, 10, 100] })] }
    const up = renderChart(spec(base), measure)
    const down = renderChart(spec({ ...base, yInverse: true }), measure)
    expect(JSON.stringify(down)).not.toBe(JSON.stringify(up))
  })
})

describe('value labels', () => {
  const labelled = (over: Partial<Series>) => renderChart(spec({ series: [series({ showValues: true, ...over })] }), measure)

  it('a per-datum label text replaces the formatted value; an EMPTY one falls back to the value', () => {
    const out = texts(labelled({ values: [5, 6, 7], labelTexts: ['', 'six', 'seven'] })).map((t) => t.text)
    expect(out).toContain('six')
    expect(out).toContain('seven')
    // The first datum's empty text fell back to its own formatted value.
    expect(out).toContain('5')
  })

  it('an explicit label size is used; otherwise the theme size', () => {
    const sized = texts(labelled({ values: [5, 6, 7], labelTexts: ['x', 'y', 'z'], labelSize: 23 })).find((t) => t.text === 'y')!
    const themed = texts(labelled({ values: [5, 6, 7], labelTexts: ['x', 'y', 'z'] })).find((t) => t.text === 'y')!
    expect(sized.size).toBe(23)
    expect(themed.size).toBe(defaultTheme.fontSize)
  })
})

describe('facade shapes', () => {
  it('a nested ARRAY as the first x axis anchors no categories, so a second axis is named', () => {
    const c = compileOption({ xAxis: [['a', 'b'], { data: ['p', 'q'] }], yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] } as EChartsOption)
    expect(c.warnings.some((w) => w.path === 'xAxis')).toBe(true)
  })

  it('a markLine pair whose SECOND end is not an object is skipped with a warning', () => {
    const c = compileOption({
      xAxis: { type: 'category', data: ['a', 'b', 'c'] },
      yAxis: {},
      series: [{ type: 'line', data: [1, 2, 3], markLine: { data: [[{ type: 'max' }, 7]] } }],
    } as EChartsOption)
    expect(c.warnings.some((w) => w.path.endsWith('markLine.data[0]'))).toBe(true)
  })
})

describe('a band with a gap', () => {
  it('fills each finite run separately and bridges nothing across the gap', () => {
    const cmds = renderChart(
      spec({
        categories: ['a', 'b', 'c', 'd', 'e'],
        series: [series({ kind: 'band', values: [5, 6, Number.NaN, 7, 8], values2: [1, 2, 3, 4, 5] })],
      }),
      measure,
    )
    // Two finite runs either side of the gap → two filled regions, not one
    // polygon spanning the missing datum.
    expect(cmds.filter((c) => c.kind === 'polygon').length).toBe(2)
  })
})
