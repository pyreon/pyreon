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
import { compileFamily } from './option-family'
import { circleView, familyRect } from './option-layers'
import { fitCircle, layoutArcsWith } from './arc'
import { layoutPieLabels } from './pie-labels'

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

/** ECharts' x-axis labels: the centre-anchored texts of its SSR SVG, in order. */
function echartsXTicks(option: object): string[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return [...svg.matchAll(/text-anchor="middle"[^>]*>([^<]*)</g)].map((m) => m[1]!)
}
function ourXTicks(option: object): string[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  return layoutChart(c.spec, (t: string) => t.length * 7).xTicks.map((t) => t.label)
}
const scatter = (data: number[][], xAxis: object = {}): object => ({ xAxis: { type: 'value', ...xAxis }, yAxis: { type: 'value' }, series: [{ type: 'scatter', data }] })
const X_CASES: [string, object][] = [
  ['small values keep zero', scatter([[1, 2], [3, 4], [7, 1]])],
  ['hundreds', scatter([[120, 1], [480, 2]])],
  ['across zero', scatter([[-5, 1], [23, 2]])],
  ['scale: true', scatter([[823, 1], [1330, 2]], { scale: true })],
  ['decimals', scatter([[0.1, 1], [0.35, 2]])],
  ['thousands group with commas', scatter([[1500, 1], [8200, 2]])],
  ['a pinned max', scatter([[1, 1], [7, 2]], { max: 9 })],
]
describe('ECharts differential: value X axis ticks', () => {
  for (const [name, option] of X_CASES) {
    it(name, () => {
      expect(ourXTicks(option)).toEqual(echartsXTicks(option))
    })
  }
})

/**
 * Pies: each slice's two edge angles and radius, from ECharts' sector paths
 * (`M start A r r … end L centre`), and each label's text, anchor and
 * position, and each guide line — against the facade's own layout of the same
 * option, placed where `familyRect` puts it.
 */
interface PieFacts {
  slices: { i: number; a: number[]; r: number }[]
  labels: { text: string; x: number; y: number; anchor: string; rot: number }[]
  lines: number[][]
}
const TAU = Math.PI * 2
const norm = (a: number): number => ((a % TAU) + TAU) % TAU
function echartsPie(option: object): PieFacts {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const slices = [...svg.matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+)A(-?[\d.]+) [\d.]+ 0 [01] [01] (-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)[^"]*"[^>]*ecmeta_data_index="(\d+)"/g)].map((m) => {
    const [sx, sy, r, ex, ey] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number]
    // A donut's path steps to the inner edge before the centre; the centre is the pie's own.
    const c = pieCentre(option)
    return { i: Number(m[8]), a: [norm(Math.atan2(sy - c.y, sx - c.x)), norm(Math.atan2(ey - c.y, ex - c.x))].sort((p, q) => p - q), r }
  })
  // A level label is translated; a rotated one carries a matrix whose (a, b) column is its rotation.
  const labels = [...svg.matchAll(/<text[^>]*text-anchor="(\w+)"[^>]*transform="(translate|matrix)\(([^)]*)\)"[^>]*>([^<]*)</g)].map((m) => {
    const v = m[3]!.split(/[\s,]+/).map(Number)
    const rot = m[2] === 'matrix' ? (Math.atan2(v[1]!, v[0]!) * 180) / Math.PI : 0
    return { text: m[4]!, x: m[2] === 'matrix' ? v[4]! : v[0]!, y: m[2] === 'matrix' ? v[5]! : v[1]!, anchor: m[1]!, rot }
  })
  const lines = [...svg.matchAll(/<polyline points="([^"]+)"/g)].map((m) => m[1]!.split(' ').map(Number))
  return { slices: slices.sort((p, q) => p.i - q.i), labels, lines }
}
function pieCentre(option: object): { x: number; y: number } {
  const s = (option as { series: Record<string, unknown>[] }).series[0]!
  const r = familyRect(s, W, H)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}
function ourPie(option: object): PieFacts {
  const fam = compileFamily(option as EChartsOption)!
  const plan = fam.plan
  if (plan.kind !== 'pie') throw new Error('not a pie')
  const s = (option as { series: Record<string, unknown>[] }).series[0]!
  const box = familyRect(s, W, H)
  const { center, radius } = fitCircle(box)
  const inner = radius * plan.innerRadius
  const slices = plan.rows.map((r) => ({ value: r.value, label: r.name, color: r.color ?? '#000' }))
  const arcs = layoutArcsWith(slices, plan.pie.arcs)
  const out: PieFacts = {
    slices: arcs.filter((a) => a.end > a.start).map((a) => ({ i: a.index, a: [norm(a.start), norm(a.end)].sort((p, q) => p - q), r: inner + a.reach * (radius - inner) })),
    labels: [],
    lines: [],
  }
  if (plan.pie.labels !== undefined) {
    for (const l of layoutPieLabels(arcs, center, radius, inner, circleView(s, W, H), plan.pie.labels, (t, size) => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width)) {
      if (l.text !== '') out.labels.push({ text: l.text, x: l.at.x, y: l.at.y, anchor: l.align === 'middle' ? 'middle' : l.align, rot: l.rotate })
      if (l.line.length > 0) out.lines.push(l.line.flatMap((p) => [p.x, p.y]))
    }
  }
  return out
}
const circDiff = (p: number, q: number): number => Math.min(Math.abs(p - q), TAU - Math.abs(p - q))

const pieOf = (data: unknown[], series: object = {}): object => ({ series: [{ type: 'pie', data, ...series }] })
const abc = [{ name: 'a', value: 1 }, { name: 'b', value: 2 }, { name: 'c', value: 3 }]
const many = [{ name: 'big', value: 60 }, ...['p', 'q', 'r', 's', 't', 'u'].map((name) => ({ name, value: 1 })), { name: 'mid', value: 20 }]
const PIE_CASES: [string, object][] = [
  ['three slices, outside labels on guide lines', pieOf(abc)],
  ['startAngle', pieOf(abc, { startAngle: 0 })],
  ['counter-clockwise', pieOf(abc, { clockwise: false })],
  ['minAngle widens a sliver', pieOf([{ name: 'a', value: 1 }, { name: 'b', value: 100 }], { minAngle: 30 })],
  ['padAngle', pieOf(abc, { padAngle: 5 })],
  ['rose by radius', pieOf(abc, { roseType: 'radius' })],
  ['rose by area', pieOf(abc, { roseType: 'area' })],
  ['a donut', pieOf(abc, { radius: ['30%', '60%'] })],
  ['a pinned centre and radius', pieOf(abc, { center: ['35%', '55%'], radius: '40%' })],
  ['crowded labels are pushed apart', pieOf(many)],
  ['a label template', pieOf(abc, { label: { formatter: '{b}: {d}%' } })],
  ['longer guide lines', pieOf(abc, { labelLine: { length: 25, length2: 10 } })],
  ['labels inside', pieOf(abc, { label: { position: 'inside' } })],
  ['an all-zero pie splits evenly', pieOf([{ name: 'a', value: 0 }, { name: 'b', value: 0 }])],
  ['a half pie (endAngle)', pieOf(abc, { startAngle: 180, endAngle: 360 })],
  ['a counter-clockwise quarter', pieOf(abc, { startAngle: 90, endAngle: 0, clockwise: false })],
  ['box keys place the pie and bound its labels', pieOf(many, { left: 40, top: 60, width: 200, height: 180 })],
  ['minShowLabelAngle hides the sliver labels', pieOf(many, { minShowLabelAngle: 10 })],
  ['crowded labels, counter-clockwise from 3 o\'clock', pieOf(many, { startAngle: 0, clockwise: false })],
  ['a rose with minAngle and padAngle', pieOf(many, { roseType: 'radius', minAngle: 8, padAngle: 2 })],
  ['labels aligned to the edges', pieOf(many, { label: { alignTo: 'edge', edgeDistance: '5%' } })],
  ['edge labels with no room are cut to nothing, their lines kept', pieOf(many, { label: { alignTo: 'edge' } })],
  ['edge labels at a pixel distance', pieOf(abc, { label: { alignTo: 'edge', edgeDistance: 20 } })],
  ['label lines ending level', pieOf(many, { label: { alignTo: 'labelLine' } })],
  ['radial labels', pieOf(abc, { label: { rotate: 'radial' } })],
  ['tangential labels', pieOf(abc, { label: { rotate: 'tangential' } })],
  ['tangential labels inside, unflipped', pieOf(abc, { label: { position: 'inside', rotate: 'tangential-noflip' } })],
  ['a fixed rotation', pieOf(abc, { label: { rotate: 30 } })],
]

describe('ECharts differential: pies', () => {
  for (const [name, option] of PIE_CASES) {
    it(name, () => {
      const e = echartsPie(option)
      const u = ourPie(option)
      // The extraction must have found the chart, or every comparison below passes vacuously.
      expect(e.slices.length).toBeGreaterThan(0)
      expect(e.labels.length + e.lines.length).toBeGreaterThan(0)
      expect(u.slices.map((s) => s.i)).toEqual(e.slices.map((s) => s.i))
      u.slices.forEach((s, k) => {
        const es = e.slices[k]!
        // An unordered pair of edges (a slice ending on 12 o'clock sorts either way); ECharts writes a
        // path to a tenth of a pixel, so a tiny rose slice's edge angle is only that exact.
        const tol = Math.max(0.002, 0.08 / es.r)
        const straight = Math.max(circDiff(s.a[0]!, es.a[0]!), circDiff(s.a[1]!, es.a[1]!))
        const crossed = Math.max(circDiff(s.a[0]!, es.a[1]!), circDiff(s.a[1]!, es.a[0]!))
        expect(Math.min(straight, crossed)).toBeLessThan(tol)
        expect(Math.abs(s.r - es.r)).toBeLessThan(0.06)
      })
      const byText = (l: PieFacts['labels']) => [...l].sort((p, q) => (p.text < q.text ? -1 : 1))
      const el = byText(e.labels)
      const ul = byText(u.labels)
      expect(ul.map((l) => [l.text, l.anchor])).toEqual(el.map((l) => [l.text, l.anchor]))
      ul.forEach((l, k) => {
        expect(l.x).toBeCloseTo(el[k]!.x, 0)
        expect(l.y).toBeCloseTo(el[k]!.y, 0)
        const dr = Math.abs(l.rot - el[k]!.rot) % 360
        expect(Math.min(dr, 360 - dr)).toBeLessThan(0.5)
      })
      // Sorted on the tenth-of-a-pixel values ECharts writes, so near-equal starts tie the same way on both sides.
      const r1 = (v: number): number => Math.round(v * 10)
      const sortLines = (ls: number[][]) => [...ls].sort((p, q) => r1(p[0]!) - r1(q[0]!) || r1(p[1]!) - r1(q[1]!))
      const elines = sortLines(e.lines)
      const ulines = sortLines(u.lines)
      expect(ulines.length).toBe(elines.length)
      ulines.forEach((ln, k) => ln.forEach((v, j) => expect(v).toBeCloseTo(elines[k]![j]!, 0)))
    })
  }
})
