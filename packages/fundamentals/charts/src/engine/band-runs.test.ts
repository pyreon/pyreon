import { smooth, step } from './curve'
import { defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import { scaleLinear } from './scale'
import type { Pt } from './types'

const measure = (text: string, size: number): number => text.length * size * 0.6
const specOf = (
  high: number[],
  low: number[],
  extra: Partial<ChartSpec> = {},
  curve?: Series['curve'],
): ChartSpec => ({
  width: 400,
  height: 240,
  categories: high.map((_, i) => String(i)),
  series: [
    {
      kind: 'band',
      values: high,
      values2: low,
      color: '#ff0000',
      width: 2,
      radius: 3,
      label: 'range',
      curve,
    },
  ],
  theme: defaultTheme,
  showXAxis: false,
  showYAxis: false,
  showGrid: false,
  yDomain: { min: 0, max: 10 },
  ...extra,
})

describe('band boundaries stay paired across gaps', () => {
  const cases: [string, number[], number[], number[][]][] = [
    [
      'upper NaN',
      [5, 6, NaN, 7, 8],
      [1, 2, 3, 4, 5],
      [
        [0, 1],
        [3, 4],
      ],
    ],
    [
      'lower NaN',
      [5, 6, 7, 8, 9],
      [1, 2, NaN, 4, 5],
      [
        [0, 1],
        [3, 4],
      ],
    ],
    [
      'opposite infinities',
      [5, 6, Infinity, 7, 8, 9, 8, 7],
      [1, 2, 3, 4, 5, -Infinity, 2, 1],
      [
        [0, 1],
        [3, 4],
        [6, 7],
      ],
    ],
    [
      'singleton before drawable runs',
      [5, NaN, 6, 7, NaN, 8, 9],
      [1, 2, 2, 3, 4, 5, 6],
      [
        [2, 3],
        [5, 6],
      ],
    ],
    [
      'missing trailing lower bound',
      [5, 6, NaN, 7, 8, 9],
      [1, 2, 3, 4, 5],
      [
        [0, 1],
        [3, 4],
      ],
    ],
    ['no gap control', [5, 6, 7], [1, 2, 3], [[0, 1, 2]]],
  ]
  for (const [name, high, low, runs] of cases) {
    for (const numericX of [false, true]) {
      it(`${name}, ${numericX ? 'continuous' : 'category'} x: every polygon closes on its own lower edge`, () => {
        const xs = high.map((_, i) => i * i)
        const spec = specOf(high, low, numericX ? { xValues: xs } : {})
        const l = layoutChart(spec, measure)
        const point = (i: number, value: number): Pt => ({
          x: numericX
            ? scaleLinear(l.xDomainUsed, l.plot.x, l.plot.x + l.plot.w, xs[i]!)
            : l.plot.x + (l.plot.w / high.length) * (i + 0.5),
          y: scaleLinear(spec.yDomain!, l.plot.y + l.plot.h, l.plot.y, value),
        })
        const polygons = renderChart(spec, measure).filter((c) => c.kind === 'polygon')
        expect(polygons).toHaveLength(runs.length)
        for (let r = 0; r < runs.length; r++) {
          const indices = runs[r]!
          expect(polygons[r]!.points).toEqual([
            ...indices.map((i) => point(i, high[i]!)),
            ...indices.toReversed().map((i) => point(i, low[i]!)),
          ])
        }
      })
    }
  }

  for (const [name, curve] of [
    ['smooth', smooth],
    ['step', step],
  ] as const) {
    it(`${name}: a leading singleton cannot shift the curved lower-edge pairing`, () => {
      const high = [5, NaN, 6, 7, 8, NaN, 7, 8, 9]
      const low = [1, 2, 2, 3, 4, 5, 3, 4, 5]
      const spec = specOf(high, low, {}, curve)
      const l = layoutChart(spec, measure)
      const point = (i: number, v: number): Pt => ({
        x: l.plot.x + (l.plot.w / high.length) * (i + 0.5),
        y: scaleLinear(spec.yDomain!, l.plot.y + l.plot.h, l.plot.y, v),
      })
      const polygons = renderChart(spec, measure).filter((c) => c.kind === 'polygon')
      expect(polygons).toHaveLength(2)
      for (const [r, indices] of [
        [2, 3, 4],
        [6, 7, 8],
      ].entries()) {
        expect(polygons[r]!.points).toEqual([
          ...curve(indices.map((i) => point(i, high[i]!))),
          ...curve(indices.map((i) => point(i, low[i]!))).toReversed(),
        ])
      }
    })
  }

  it('many finite regions read the lower channel a bounded number of times per row', () => {
    const high = Array.from({ length: 1500 }, (_, i) => (i % 3 === 2 ? NaN : 8))
    let reads = 0
    const low = new Proxy(
      high.map(() => 2),
      {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) reads++
          return Reflect.get(target, property, receiver)
        },
      },
    )
    const polygons = renderChart(specOf(high, low), measure).filter((c) => c.kind === 'polygon')
    expect(polygons).toHaveLength(500)
    expect(reads).toBeLessThanOrEqual(high.length * 8)
    for (const polygon of polygons) {
      const xs = polygon.points.map((p) => p.x)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(388 / high.length)
    }
  })
})
