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
import { barsFor, layoutChart } from './render'

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

/**
 * Bar columns: each bar's centre as a fraction of the plot width (plot rects
 * differ: ECharts' default grid is not the facade's label-sized one) and its
 * width, as a fraction for a percent/auto layout and in pixels where the
 * option sizes a bar in pixels. ECharts rounds bar edges to a tenth of a
 * pixel, hence the tolerance.
 */
interface BarFact { key: string; c: number; w: number; wPx: number }
function echartsBars(option: object): BarFact[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const grid = [...svg.matchAll(/<path d="M([\d.]+) [\d.]+L([\d.]+) [\d.]+" fill="none"[^>]*stroke="#dbdee4"/g)][0]!
  const x0 = Number(grid[1]), x1 = Number(grid[2])
  return [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)l([\d.]+) 0l0 (-?[\d.]+)[^"]*"[^>]*ecmeta_series_index="(\d+)" ecmeta_data_index="(\d+)"/g)]
    .map((m) => ({ key: m[5]! + '/' + m[6]!, c: (Number(m[1]) + Number(m[3]) / 2 - x0) / (x1 - x0), w: Number(m[3]) / (x1 - x0), wPx: Number(m[3]) }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
}
function ourBars(option: object): BarFact[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string) => t.length * 7
  const plot = layoutChart(c.spec, m).plot
  const out: BarFact[] = []
  const fact = (k: number, d: number, r: { x: number; w: number }) => out.push({ key: String(k) + '/' + String(d), c: (r.x + r.w / 2 - plot.x) / plot.w, w: r.w / plot.w, wPx: r.w })
  c.spec.series.forEach((s, k) => {
    if (s.kind === 'bars' || s.kind === 'grouped' || s.kind === 'stacked') barsFor(c.spec, k, m).forEach((r, d) => { if (r.w > 0) fact(k, d, r) })
  })
  return out.sort((a, b) => (a.key < b.key ? -1 : 1))
}

const cat = { xAxis: { type: 'category', data: ['a', 'b', 'c', 'd'] }, yAxis: { type: 'value' } }
const BAR_CASES: [string, object, 'fraction' | 'px'][] = [
  ['one series: 31% category gap', { ...cat, series: [{ type: 'bar', data: [2, 1, 3, 2] }] }, 'fraction'],
  ['barWidth in pixels', { ...cat, series: [{ type: 'bar', barWidth: 20, data: [2, 1, 3, 2] }] }, 'px'],
  ['barWidth as a percent', { ...cat, series: [{ type: 'bar', barWidth: '40%', data: [2, 1, 3, 2] }] }, 'fraction'],
  ['barCategoryGap', { ...cat, series: [{ type: 'bar', barCategoryGap: '50%', data: [2, 1, 3, 2] }] }, 'fraction'],
  ['barMaxWidth caps the auto width', { ...cat, series: [{ type: 'bar', barMaxWidth: 10, data: [2, 1, 3, 2] }] }, 'px'],
  ['two grouped series: 27% gap, 10% bar gap', { ...cat, series: [{ type: 'bar', data: [2, 1, 3, 2] }, { type: 'bar', data: [1, 2, 1, 3] }] }, 'fraction'],
  ['three grouped series', { ...cat, series: [{ type: 'bar', data: [2, 1, 3, 2] }, { type: 'bar', data: [1, 2, 1, 3] }, { type: 'bar', data: [1, 1, 1, 1] }] }, 'fraction'],
  ['barGap', { ...cat, series: [{ type: 'bar', data: [2, 1, 3, 2] }, { type: 'bar', barGap: '-100%', data: [1, 2, 1, 3] }] }, 'fraction'],
  ['one stack is one column', { ...cat, series: [{ type: 'bar', stack: 's', data: [2, 1, 3, 2] }, { type: 'bar', stack: 's', data: [1, 2, 1, 3] }] }, 'fraction'],
]

describe('ECharts differential: bar columns', () => {
  for (const [name, option, unit] of BAR_CASES) {
    it(name, () => {
      const e = echartsBars(option)
      const u = ourBars(option)
      expect(u.map((b) => b.key)).toEqual(e.map((b) => b.key))
      u.forEach((b, i) => {
        expect(b.c).toBeCloseTo(e[i]!.c, 2)
        if (unit === 'px') expect(b.wPx).toBeCloseTo(e[i]!.wPx, 0)
        else expect(Math.abs(b.w - e[i]!.w)).toBeLessThan(0.002)
      })
    })
  }
})
