/**
 * A structural differential against real ECharts: the same option rendered by
 * ECharts' own SSR renderer and by the facade, compared on facts both expose.
 *
 * Starting with the value axis: the tick labels. They encode the axis
 * extent, the interval (ECharts' `nice(span / splitNumber)`), zero inclusion
 * (`scale`), pinned bounds and number formatting, so one comparison covers
 * all five. Every case below was a real mismatch before the port: the facade
 * fitted lines to the data where ECharts keeps zero, picked 500 where ECharts
 * picks 300, and printed 1000 where ECharts prints 1,000.
 */
import { describe, expect, it } from 'vitest'
import * as echarts from 'echarts'
import { compileOption } from './option'
import type { EChartsOption } from './option'
import { layoutChart } from './render'

const W = 400
const H = 300

/** ECharts' y-axis labels: the right-anchored texts of its SSR SVG, in order. */
function echartsYTicks(option: object): string[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return [...svg.matchAll(/text-anchor="end"[^>]*>([^<]*)</g)].map((m) => m[1]!.replace(/&#39;/g, "'"))
}

function ourYTicks(option: object): string[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  return layoutChart(c.spec, (t: string) => t.length * 7).yTicks.map((t) => t.label)
}

const line = (data: number[], yAxis: object = {}): object => ({
  xAxis: { type: 'category', data: data.map((_, i) => 'c' + String(i)) },
  yAxis: { type: 'value', ...yAxis },
  series: [{ type: 'line', data }],
})
const bar = (data: number[], yAxis: object = {}): object => ({ ...line(data, yAxis), series: [{ type: 'bar', data }] })

const CASES: [string, object][] = [
  ['small integers keep zero', line([1, 3, 2, 4])],
  ['hundreds', line([120, 200, 150, 80, 70, 110, 130])],
  ['decimals (0.35 / 5 rounds down to 0.05)', line([0.1, 0.35, 0.2])],
  ['across zero', line([-5, 12, 30, 7])],
  ['thousands group with commas', line([1000, 2600, 3300, 4100])],
  ['a flat series', line([5, 5, 5])],
  ['a 3-coefficient interval (1330 / 5 → 300)', line([823, 934, 1290, 1330, 1320])],
  ['thousandths', line([0.001, 0.004])],
  ['a 1-coefficient interval', line([12, 45, 23, 67, 34])],
  ['all negative', line([-120, -40, -80])],
  ['fractional data, integer ticks', line([2.5, 7.3, 9.9])],
  ['hundreds of thousands', line([150000, 230000, 224000, 218000, 135000])],
  ['scale: true fits the data', line([823, 934, 1290, 1330], { scale: true })],
  ['a pinned min is its own tick', line([823, 934, 1290, 1330], { min: 500 })],
  ['min: dataMin', line([823, 934, 1290, 1330], { min: 'dataMin' })],
  ['splitNumber', line([1, 3, 2, 4], { splitNumber: 2 })],
  ['a flat series under scale: true', line([5, 5, 5], { scale: true })],
  ['both bounds pinned', line([3, 7], { min: 0, max: 12 })],
  ['bars', bar([4, 9, 2])],
  ['negative bars', bar([-4, 9, -2])],
]

describe('ECharts differential: value-axis ticks', () => {
  for (const [name, option] of CASES) {
    it(name, () => {
      expect(ourYTicks(option)).toEqual(echartsYTicks(option))
    })
  }
})
