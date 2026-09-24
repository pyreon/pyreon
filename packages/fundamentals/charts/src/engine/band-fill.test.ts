// A band is drawn UNDER the lines it frames — a Bollinger envelope under its
// price, a confidence interval under its estimate — so its fill is
// translucent by default, like `area`'s. An opaque fill in a palette colour
// hid the lines; `area` had been fixed for exactly that and the band branch
// was not.
import { describe, expect, it } from 'vitest'
import { withAlpha } from './radar'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, Double, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const band = (extra: Partial<Series> = {}): Series => ({
  kind: 'band', values: [5, 6, 7, 6], values2: [1, 2, 3, 2] as Double[], color: '#0f766e', width: 1.0, radius: 2.0, label: 'Band', ...extra,
})
const spec = (s: Series): ChartSpec => ({
  width: 400.0, height: 200.0, series: [s], categories: ['a', 'b', 'c', 'd'],
  theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true,
})
const bandFills = (cmds: DrawCmd[]): string[] =>
  cmds.flatMap((c) => (c.kind === 'polygon' && typeof (c as { fill?: unknown }).fill === 'string' ? [(c as { fill: string }).fill] : []))

describe('band fill', () => {
  it('is translucent by default', () => {
    const fills = bandFills(renderChart(spec(band()), measure))
    expect(fills).toEqual([withAlpha('#0f766e', 0.3)])
  })

  it('honours areaOpacity', () => {
    expect(bandFills(renderChart(spec(band({ areaOpacity: 0.6 })), measure))).toEqual([withAlpha('#0f766e', 0.6)])
  })
})
