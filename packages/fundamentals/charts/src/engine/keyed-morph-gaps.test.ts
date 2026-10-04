import { keyedGeometry, keyedMorphCmds } from './keyed-morph'
import { defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec, Series } from './render'

const measure = (s: string, size: number): number => s.length * size * 0.6

describe('keyed morphs preserve non-finite gaps', () => {
  for (const kind of ['line', 'bars', 'stacked', 'grouped'] as const) {
    it(`${kind}: Infinity and NaN have no geometry or index`, () => {
      const values = [1, 2, Infinity, 3, 4, -Infinity, 5, NaN]
      const keys = values.map((_, i) => String(i))
      const series: Series = { kind, values, color: '#f00', width: 2, radius: 3, label: 's' }
      const spec: ChartSpec = {
        width: 400,
        height: 240,
        categories: keys,
        series: [series],
        theme: defaultTheme,
        showXAxis: false,
        showYAxis: false,
        showGrid: false,
        yDomain: { min: 0, max: 5 },
      }
      const geo = keyedGeometry(spec, layoutChart(spec, measure), keys)
      for (const i of [2, 5, 7]) {
        expect(geo[0]!.index.has(keys[i]!)).toBe(false)
        expect(geo[0]!.points.has(keys[i]!)).toBe(false)
        expect(geo[0]!.rects.has(keys[i]!)).toBe(false)
      }
      expect(geo[0]!.index.size).toBe(5)
      if (kind === 'line') {
        const lines = keyedMorphCmds(geo, geo, 1).filter((c) => c.kind === 'polyline')
        const rendered = renderChart(spec, measure).filter((c) => c.kind === 'polyline')
        expect(lines.map((c) => c.points)).toEqual(rendered.map((c) => c.points))
        expect(lines).toHaveLength(2)
      }
    })
  }
})
