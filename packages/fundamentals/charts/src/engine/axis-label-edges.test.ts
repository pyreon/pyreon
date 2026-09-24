// A remaining edge of the render, on the draw list: a band with a gap.
import { describe, expect, it } from 'vitest'
import { defaultTheme, renderChart } from './render'
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
