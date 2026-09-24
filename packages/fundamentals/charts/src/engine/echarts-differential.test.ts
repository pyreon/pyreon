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
import { compileOption, compiledCommands, zoomedView } from './option'
import type { EChartsOption } from './option'
import { barsFor, layoutChart, renderChart } from './render'
import { compileFamily } from './option-family'
import { circleView, familyRect } from './option-layers'
import { fitCircle, layoutArcsWith } from './arc'
import { layoutPieLabels } from './pie-labels'
import { renderDial } from './gauge-dial'
import { optionTitleCommands, readOptionTitle } from './option-title'
import { echartsBeziers } from './curve'
import type { Pt } from './types'

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

/**
 * Gauges: the split lines and ticks (endpoints), the axis labels, title and
 * detail (text, anchor, position), the pointer (its outline, from ECharts'
 * local path under its matrix) and the axis bands and progress arcs (their
 * edge angles and fill) — against `renderDial` placed where `familyRect` puts
 * the dial.
 */
interface GaugeFacts {
  splits: number[][]
  ticks: number[][]
  texts: { text: string; x: number; y: number; anchor: string; fill: string }[]
  pointers: number[][][]
  bands: { fill: string; a: number[]; r: number }[]
}
const pt = (s: string): number[] => s.trim().split(/[\s,]+/).map(Number)
function echartsGauge(option: object): GaugeFacts {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const c = gaugeCentre(option)
  const lines = [...svg.matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)" fill="none"[^>]*stroke="[^"]*"( stroke-width="([\d.]+)")?/g)]
  const splits = lines.filter((m) => m[6] === '3').map((m) => [m[1], m[2], m[3], m[4]].map(Number))
  const ticks = lines.filter((m) => m[6] === undefined).map((m) => [m[1], m[2], m[3], m[4]].map(Number))
  const texts = [...svg.matchAll(/<text[^>]*text-anchor="(\w+)"[^>]*x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*fill="([^"]+)"[^>]*>([^<]*)</g)].map((m) => ({ text: m[5]!, x: Number(m[2]), y: Number(m[3]), anchor: m[1]!, fill: m[4]! }))
  const pointers = [...svg.matchAll(/<path d="M([^"]+)" transform="matrix\(([^)]+)\)"[^>]*ecmeta_data_index/g)].map((pm) => {
    const [a, b, cc, d, e, f] = pt(pm[2]!) as [number, number, number, number, number, number]
    return pm[1]!.split('L').slice(0, 4).map((p) => {
      const [x, y] = pt(p) as [number, number]
      return [a * x + cc * y + e, b * x + d * y + f]
    })
  })
  const bands = [...svg.matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+)A([\d.]+) [\d.]+ 0 [01] [01] (-?[\d.]+) (-?[\d.]+)L[^"]*" fill="([^"]+)"/g)].map((m) => {
    const [sx, sy, r, ex, ey] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number]
    return { fill: m[6]!, a: [norm(Math.atan2(sy - c.y, sx - c.x)), norm(Math.atan2(ey - c.y, ex - c.x))].sort((p, q) => p - q), r }
  })
  return { splits, ticks, texts, pointers, bands }
}
function gaugeCentre(option: object): { x: number; y: number } {
  const s = (option as { series: Record<string, unknown>[] }).series[0]!
  const r = familyRect(s, W, H)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}
function ourGauge(option: object): GaugeFacts {
  const fam = compileFamily(option as EChartsOption)!
  const plan = fam.plan
  if (plan.kind !== 'gauge') throw new Error('not a gauge')
  const s = (option as { series: Record<string, unknown>[] }).series[0]!
  const { center, radius } = fitCircle(familyRect(s, W, H))
  // The host fills an uncoloured datum from its theme's palette; ECharts' default one here.
  const PALETTE = ['#5070dd', '#b6d634', '#505372', '#ff994d', '#0ca8df', '#ffd10a', '#fb628b', '#785db0', '#3fbe95']
  const dial = { ...plan.dial, data: plan.dial.data.map((d, i) => ({ ...d, color: d.color === '' ? PALETTE[i % PALETTE.length]! : d.color })) }
  const cmds = renderDial(dial, center, radius)
  const out: GaugeFacts = { splits: [], ticks: [], texts: [], pointers: [], bands: [] }
  for (const c of cmds) {
    if (c.kind === 'line') (c.width === dial.splitWidth ? out.splits : out.ticks).push([c.from.x, c.from.y, c.to.x, c.to.y])
    // ECharts' SVG writes a text at its vertical centre, whatever its baseline.
    else if (c.kind === 'text') out.texts.push({ text: c.text, x: c.at.x, y: c.at.y + (c.baseline === 'top' ? c.size / 2 : c.baseline === 'bottom' ? -c.size / 2 : 0), anchor: c.align, fill: c.fill })
    else if (c.kind === 'polygon' && c.points.length === 4) out.pointers.push(c.points.map((p) => [p.x, p.y]))
    else if (c.kind === 'polygon') {
      // A band's outer edge is the first half of its points, drawn from its start angle.
      const half = c.points.slice(0, Math.floor(c.points.length / 2))
      const f0 = half[0]!
      const f1 = half[half.length - 1]!
      out.bands.push({ fill: c.fill, a: [norm(Math.atan2(f0.y - center.y, f0.x - center.x)), norm(Math.atan2(f1.y - center.y, f1.x - center.x))].sort((p, q) => p - q), r: Math.hypot(f0.x - center.x, f0.y - center.y) })
    }
  }
  return out
}

const gauge = (series: object = {}, value: unknown = 42): object => ({ series: [{ type: 'gauge', data: [{ value, name: 'Speed' }], ...series }] })
const GAUGE_CASES: [string, object][] = [
  ['the default dial', gauge()],
  ['axis line colour stops', gauge({ axisLine: { lineStyle: { width: 18, color: [[0.3, '#67e0e3'], [0.7, '#37a2da'], [1, '#fd666d']] } } })],
  ['a progress arc', gauge({ progress: { show: true, width: 14 } })],
  ['a half dial', gauge({ startAngle: 180, endAngle: 0 })],
  ['counter-clockwise', gauge({ clockwise: false })],
  ['a custom range and split', gauge({ min: -20, max: 60, splitNumber: 8 }, 13)],
  ['a label formatter and distance', gauge({ axisLabel: { formatter: '{value}%', distance: 25, fontSize: 10 } })],
  ['a longer pointer, offset', gauge({ pointer: { length: '80%', width: 10, offsetCenter: [0, '10%'] } })],
  ['split lines and ticks by percent', gauge({ splitLine: { length: '12%', distance: 0 }, axisTick: { length: '5%', splitNumber: 3, distance: 4 } })],
  ['detail and title offsets and a formatter', gauge({ title: { offsetCenter: [0, '-30%'] }, detail: { offsetCenter: ['10%', '60%'], formatter: '{value} km/h' } })],
  ['two values', { series: [{ type: 'gauge', progress: { show: true, overlap: false }, data: [{ value: 20, name: 'a', title: { offsetCenter: ['-40%', '80%'] }, detail: { offsetCenter: ['-40%', '95%'] } }, { value: 70, name: 'b', title: { offsetCenter: ['40%', '80%'] }, detail: { offsetCenter: ['40%', '95%'] } }] }] }],
  ['a pinned centre and radius', gauge({ center: ['40%', '60%'], radius: '90%' })],
  ['labels in auto colour off colour stops', gauge({ axisLabel: { color: 'auto' }, splitLine: { lineStyle: { color: 'auto' } }, axisLine: { lineStyle: { color: [[0.5, '#aa0000'], [1, '#00aa00']] } } })],
]

describe('ECharts differential: gauges', () => {
  for (const [name, option] of GAUGE_CASES) {
    it(name, () => {
      const e = echartsGauge(option)
      const u = ourGauge(option)
      expect(e.splits.length).toBeGreaterThan(0)
      const r1 = (v: number): number => Math.round(v * 10)
      const sortL = (ls: number[][]) => [...ls].sort((p, q) => r1(p[0]!) - r1(q[0]!) || r1(p[1]!) - r1(q[1]!) || r1(p[2]!) - r1(q[2]!))
      const close = (a: number[][], b: number[][]) => {
        expect(a.length).toBe(b.length)
        a.forEach((l, k) => l.forEach((v, j) => expect(Math.abs(v - b[k]![j]!)).toBeLessThan(0.11)))
      }
      close(sortL(u.splits), sortL(e.splits))
      close(sortL(u.ticks), sortL(e.ticks))
      const byText = (t: GaugeFacts['texts']) => [...t].sort((p, q) => (p.text < q.text ? -1 : p.text > q.text ? 1 : p.y - q.y))
      const et = byText(e.texts)
      const ut = byText(u.texts)
      expect(ut.map((t) => [t.text, t.anchor === 'start' ? 'start' : t.anchor === 'end' ? 'end' : 'middle', t.fill])).toEqual(et.map((t) => [t.text, t.anchor, t.fill]))
      ut.forEach((t, k) => {
        expect(t.x).toBeCloseTo(et[k]!.x, 1)
        expect(t.y).toBeCloseTo(et[k]!.y, 1)
      })
      const byTip = (ps: number[][][]) => [...ps].sort((p, q) => p[2]![0]! - q[2]![0]!)
      const ep = byTip(e.pointers)
      const up = byTip(u.pointers)
      expect(up.length).toBe(ep.length)
      up.forEach((poly, i) => poly.forEach((p, k) => p.forEach((v, j) => expect(Math.abs(v - ep[i]![k]![j]!)).toBeLessThan(0.15))))
      const byBand = (b: GaugeFacts['bands']) => [...b].sort((p, q) => p.a[0]! - q.a[0]! || p.r - q.r)
      const eb = byBand(e.bands)
      const ub = byBand(u.bands)
      expect(ub.map((b) => b.fill)).toEqual(eb.map((b) => b.fill))
      ub.forEach((b, k) => {
        expect(Math.abs(b.r - eb[k]!.r)).toBeLessThan(0.06)
        const tol = 0.002
        expect(Math.min(circDiff(b.a[0]!, eb[k]!.a[0]!), circDiff(b.a[0]!, eb[k]!.a[1]!))).toBeLessThan(tol)
        expect(Math.min(circDiff(b.a[1]!, eb[k]!.a[1]!), circDiff(b.a[1]!, eb[k]!.a[0]!))).toBeLessThan(tol)
      })
    })
  }
})

/**
 * Titles: the text's and subtext's anchor, vertical centre, size and weight.
 * ECharts writes each at `translate(group) + y`, centred vertically; the
 * facade's commands hang from a top / bottom / middle baseline, so they are
 * compared at their centres.
 */
interface TitleFact { text: string; x: number; y: number; anchor: string; size: number; bold: boolean }
function echartsTitle(option: object): TitleFact[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const title = (option as { title: { text: string; subtext?: string } }).title
  const wanted = new Set([title.text, title.subtext])
  // A text at the group's own origin carries no `y` attribute.
  return [...svg.matchAll(/<text[^>]*text-anchor="(\w+)" style="([^"]*)"[^>]*?(?: y="(-?[\d.]+)")? transform="translate\((-?[\d.]+) (-?[\d.]+)\)"[^>]*>([^<]*)</g)]
    .filter((m) => wanted.has(m[6]!))
    .map((m) => ({ text: m[6]!, x: Number(m[4]), y: Number(m[5]) + Number(m[3] ?? 0), anchor: m[1]!, size: Number(/font-size:([\d.]+)px/.exec(m[2]!)![1]), bold: /font-weight:bold/.test(m[2]!) }))
}
function ourTitle(option: object): TitleFact[] {
  const title = readOptionTitle((option as { title: unknown }).title)!
  const measure = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const theme = { text: '#000', label: '#666' } as never
  return optionTitleCommands(title, W, H, theme, measure).cmds.flatMap((c) =>
    c.kind === 'text' ? [{ text: c.text, x: c.at.x, y: c.at.y + (c.baseline === 'top' ? c.size / 2 : c.baseline === 'bottom' ? -c.size / 2 : 0), anchor: c.align, size: c.size, bold: c.weight === 'bold' }] : [],
  )
}
const withTitle = (title: object): object => ({ title, xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
const TITLE_CASES: [string, object][] = [
  ['the default: centred, 15 from the top', withTitle({ text: 'Revenue', subtext: 'by month' })],
  ['left in pixels', withTitle({ text: 'Revenue', left: 30 })],
  ['left as a percent', withTitle({ text: 'Revenue', left: '25%', subtext: 'sub' })],
  ['left: right', withTitle({ text: 'Revenue', left: 'right' })],
  ['right in pixels, top in pixels, a small gap', withTitle({ text: 'Right', right: 10, top: 20, subtext: 'sub', itemGap: 4 })],
  ['textAlign centre on a percent left', withTitle({ text: 'Styled', textStyle: { fontSize: 24, fontWeight: 'normal' }, textAlign: 'center', left: '50%' })],
  ['top: bottom', withTitle({ text: 'Low', top: 'bottom', subtext: 'lower' })],
  ['bottom in pixels', withTitle({ text: 'Low', bottom: 10 })],
  ['top: middle', withTitle({ text: 'Mid', top: 'middle' })],
  ['a padding array', withTitle({ text: 'Padded', left: 0, top: 0, padding: [12, 8] })],
]

describe('ECharts differential: titles', () => {
  for (const [name, option] of TITLE_CASES) {
    it(name, () => {
      const e = echartsTitle(option)
      const u = ourTitle(option)
      expect(e.length).toBeGreaterThan(0)
      expect(u.map((f) => [f.text, f.anchor === 'start' ? 'start' : f.anchor === 'end' ? 'end' : 'middle', f.size, f.bold])).toEqual(e.map((f) => [f.text, f.anchor, f.size, f.bold]))
      u.forEach((f, k) => {
        expect(f.x).toBeCloseTo(e[k]!.x, 1)
        expect(f.y).toBeCloseTo(e[k]!.y, 1)
      })
    })
  }
})

/**
 * Legends: each entry's text (content, anchor, position). ECharts writes an
 * entry's text at `x`/`y` inside the entry's `translate`, vertically centred;
 * the position encodes the icon box, the 5px gap, `boxLayout`'s wrapping and
 * spacing (icon bounds included) and the block's placement.
 */
interface LegendFact { text: string; x: number; y: number; anchor: string }
function echartsLegend(option: object): LegendFact[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const names = new Set((option as { series: { name: string }[] }).series.map((s) => s.name))
  return [...svg.matchAll(/<text[^>]*text-anchor="(\w+)"[^>]*? x="(-?[\d.]+)" y="(-?[\d.]+)" transform="translate\((-?[\d.]+) (-?[\d.]+)\)"[^>]*>([^<]*)</g)]
    .filter((m) => names.has(m[6]!))
    .map((m) => ({ text: m[6]!, x: Number(m[4]) + Number(m[2]), y: Number(m[5]) + Number(m[3]), anchor: m[1]! }))
}
function ourLegend(option: object): LegendFact[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const measure = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const names = new Set((option as { series: { name: string }[] }).series.map((s) => s.name))
  return compiledCommands(c, option as EChartsOption, measure).cmds.flatMap((cmd) =>
    cmd.kind === 'text' && names.has(cmd.text) && cmd.baseline === 'middle' && cmd.size === 12 ? [{ text: cmd.text, x: cmd.at.x, y: cmd.at.y, anchor: cmd.align }] : [],
  )
}
const legendOf = (legend: object, names: string[] = ['Alpha', 'Beta series'], types: string[] = ['bar', 'line']): object => ({
  legend,
  xAxis: { type: 'category', data: ['a', 'b'] },
  yAxis: {},
  series: names.map((name, i) => ({ type: types[i % types.length], name, data: [1 + i, 2] })),
})
const many8 = ['North', 'South', 'East', 'West', 'Central', 'Overseas', 'Online', 'Partners']
const LEGEND_CASES: [string, object][] = [
  ['the default: centred, 15 above the bottom', legendOf({})],
  ['left / top in pixels', legendOf({ left: 10, top: 40 })],
  ['vertical at the right, middle', legendOf({ orient: 'vertical', right: 10, top: 'middle' })],
  ['a scatter and a line: circle and line icons', legendOf({ top: 5 }, ['Dots', 'Trend'], ['scatter', 'line'])],
  ['many entries wrap', legendOf({ top: 10 }, many8, ['bar'])],
  ['itemGap / itemWidth / itemHeight', legendOf({ itemGap: 20, itemWidth: 14, itemHeight: 10 })],
  ['left: right', legendOf({ left: 'right', top: 0 })],
  ['a percent left and a bottom', legendOf({ left: '10%', bottom: 30 })],
  ['padding', legendOf({ left: 0, top: 0, padding: [10, 20] })],
  ['vertical, left: right aligns text before the icon', legendOf({ orient: 'vertical', left: 'right', top: 20 })],
]

describe('ECharts differential: legends', () => {
  for (const [name, option] of LEGEND_CASES) {
    it(name, () => {
      const e = echartsLegend(option)
      const u = ourLegend(option)
      expect(e.length).toBeGreaterThan(0)
      expect(u.map((f) => [f.text, f.anchor === 'start' ? 'start' : f.anchor === 'end' ? 'end' : 'middle'])).toEqual(e.map((f) => [f.text, f.anchor]))
      u.forEach((f, k) => {
        expect(f.x).toBeCloseTo(e[k]!.x, 0)
        expect(f.y).toBeCloseTo(e[k]!.y, 0)
      })
    })
  }
})

/**
 * Line symbols: which data draw a symbol. ECharts 6 shows an emptyCircle at
 * every datum unless they crowd the category axis (`showAllSymbol: 'auto'`),
 * where it keeps only those at the axis's label interval.
 */
function echartsSymbolIndices(option: object): number[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return [...svg.matchAll(/transform="matrix\([^)]*\)"[^>]*ecmeta_series_index="0" ecmeta_data_index="(\d+)"/g)].map((m) => Number(m[1])).sort((a, b) => a - b)
}
function ourSymbolIndices(option: object): number[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const lay = layoutChart(c.spec, m)
  const n = c.spec.categories.length
  const step = lay.plot.w / n
  const color = c.spec.series[0]!.color
  // A symbol's outer shape is the series colour: a filled one, or an empty one's ring.
  const xs = renderChart(c.spec, m).flatMap((cmd) => (cmd.kind === 'circle' && cmd.fill === color ? [cmd.center.x] : cmd.kind === 'polygon' && cmd.fill === color && cmd.points.length <= 4 ? [cmd.points.reduce((a, p) => a + p.x, 0) / cmd.points.length] : []))
  return xs.map((x) => Math.round((x - lay.plot.x) / step - 0.5) + 0).sort((a, b) => a - b)
}
const lineN = (n: number, series: object = {}): object => ({
  xAxis: { type: 'category', data: Array.from({ length: n }, (_, i) => 'c' + String(i)) },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: Array.from({ length: n }, (_, i) => (i * 7) % 11 + 1), ...series }],
})
const SYMBOL_CASES: [string, object][] = [
  ['a short line shows every symbol', lineN(7)],
  ['a crowded line thins to the label interval', lineN(60)],
  ['showSymbol: false shows none', lineN(7, { showSymbol: false })],
  ['showAllSymbol: true shows every one, crowded or not', lineN(60, { showAllSymbol: true })],
  ['a filled triangle', lineN(7, { symbol: 'triangle' })],
  ['symbol none', lineN(7, { symbol: 'none' })],
]

describe('ECharts differential: line symbols', () => {
  for (const [name, option] of SYMBOL_CASES) {
    it(name, () => {
      expect(ourSymbolIndices(option)).toEqual(echartsSymbolIndices(option))
    })
  }
})

/**
 * The plot rect: ECharts 6's default grid (15% / 65 / 10% / 80), grown where
 * the axis labels would leave the chart (`outerBoundsMode: 'auto'`). Read off
 * ECharts' horizontal split lines — their x run is the plot's width, the
 * outermost two its top and bottom.
 */
function echartsPlot(option: object): { x0: number; x1: number; y0: number; y1: number } {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const lines = [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)" fill="none"[^>]*stroke="#dbdee4"/g)].map((m) => [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number])
  const ys = lines.map((l) => l[1])
  return { x0: lines[0]![0], x1: lines[0]![2], y0: Math.min(...ys), y1: Math.max(...ys) }
}
function ourPlot(option: object): { x0: number; x1: number; y0: number; y1: number } {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const p = layoutChart(c.spec, m).plot
  return { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h }
}
const PLOT_CASES: [string, object][] = [
  ['the default grid', line([1, 3, 2, 4])],
  ['seven-digit labels still fit the 15% margin', line([150000, 230000, 224000])],
  ['ten-digit labels push the left edge out', line([1500000000, 2300000000, 900000000])],
  ['a pinned left grows to hold its labels', { ...line([150000, 230000, 224000]), grid: { left: 10 } }],
  ['a whole grid', { ...line([1, 3, 2, 4]), grid: { left: 50, right: 30, top: 40, bottom: 50 } }],
]

describe('ECharts differential: the plot rect', () => {
  for (const [name, option] of PLOT_CASES) {
    it(name, () => {
      const e = echartsPlot(option)
      const u = ourPlot(option)
      // ECharts draws a 1px line at a half pixel.
      expect(Math.abs(u.x0 - e.x0)).toBeLessThan(1.5)
      expect(Math.abs(u.x1 - e.x1)).toBeLessThan(1.5)
      expect(Math.abs(u.y0 - e.y0)).toBeLessThan(1.5)
      expect(Math.abs(u.y1 - e.y1)).toBeLessThan(1.5)
    })
  }
})

/**
 * Line shape: `smooth` and `step`. ECharts draws a smoothed line as one cubic
 * Bézier per segment and a stepped one as straight turns; both are compared
 * on the numbers in its path. Ours: the series' raw pixel points put through
 * the same Bézier rule, and the stepped polyline as drawn.
 */
const nums = (d: string): number[] => (d.match(/-?[\d.]+/g) ?? []).map(Number)
function echartsLinePath(option: object): string {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return /<path d="([^"]*)"[^>]*stroke="#5070dd"/.exec(svg)![1]!
}
function ourLinePoints(option: EChartsOption): Pt[] {
  const c = compileOption(option, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  // Every run of the series, in order: a gap breaks the line into several.
  return renderChart(c.spec, m).flatMap((d) => (d.kind === 'polyline' && d.stroke === c.spec.series[0]!.color ? d.points : []))
}
function ourLineRuns(option: EChartsOption): number {
  const c = compileOption(option, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  return renderChart(c.spec, m).filter((d) => d.kind === 'polyline' && d.stroke === c.spec.series[0]!.color).length
}
const shaped = (series: object): EChartsOption => ({
  xAxis: { type: 'category', data: ['a', 'b', 'c', 'd', 'e'] },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: [3, 9, 2, 8, 5], showSymbol: false, ...series }],
}) as EChartsOption
const SMOOTH_CASES: [string, object][] = [
  ['smooth: true (0.5)', { smooth: true }],
  ['smooth: 0.2', { smooth: 0.2 }],
  ["smoothMonotone: 'x'", { smooth: 0.3, smoothMonotone: 'x' }],
  ["smoothMonotone: 'y'", { smooth: 0.4, smoothMonotone: 'y' }],
]
/** Straight-segment shapes: steps, and the gaps a null leaves (or bridges). */
const STEP_CASES: [string, object][] = [
  ['step: true turns at the start', { step: true }],
  ["step: 'middle'", { step: 'middle' }],
  ["step: 'end'", { step: 'end' }],
  ['a null breaks the line', { data: [3, 9, null, 8, 5] }],
  ['connectNulls bridges it', { data: [3, 9, null, 8, 5], connectNulls: true }],
  ['connectNulls under a step', { data: [3, null, 2, 8, 5], connectNulls: true, step: true }],
]
/** A point sequence with repeats dropped and coordinates at ECharts' 0.1 precision. */
const pairs = (xs: number[]): string[] => {
  const out: string[] = []
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const p = (Math.round(xs[i]! * 10) / 10).toFixed(1) + ',' + (Math.round(xs[i + 1]! * 10) / 10).toFixed(1)
    if (out[out.length - 1] !== p) out.push(p)
  }
  return out
}

describe('ECharts differential: line shape', () => {
  for (const [name, series] of SMOOTH_CASES) {
    it(name, () => {
      const e = nums(echartsLinePath(shaped(series)))
      const raw = ourLinePoints(shaped({}))
      const s = series as { smooth: boolean | number; smoothMonotone?: string }
      const u = [raw[0]!.x, raw[0]!.y, ...echartsBeziers(raw, s.smooth === true ? 0.5 : (s.smooth as number), s.smoothMonotone ?? '')]
      expect(u.length).toBe(e.length)
      for (let i = 0; i < e.length; i++) expect(Math.abs(u[i]! - e[i]!)).toBeLessThan(0.11)
      // And the line drawn really is that curve: its samples end on each datum.
      const drawn = ourLinePoints(shaped(series))
      expect(drawn.length).toBe(1 + 16 * (raw.length - 1))
    })
  }
  for (const [name, series] of STEP_CASES) {
    it(name, () => {
      const path = echartsLinePath(shaped(series))
      const e = pairs(nums(path))
      const u = pairs(ourLinePoints(shaped(series)).flatMap((p) => [p.x, p.y]))
      expect(u).toEqual(e)
      // The same points could be one bridged line or two broken ones: count the runs too.
      expect(ourLineRuns(shaped(series))).toBe((path.match(/M/g) ?? []).length)
    })
  }
})

/**
 * Bar value labels: where each sits (`label.position` against the bar's rect,
 * `inside` by default) and zrender's automatic fill and halo. ECharts writes
 * the anchor as a translate, and its vertical alignment as a half-font `y`
 * offset (none = middle, negative = bottom, positive = top).
 */
interface BarLabelFact { text: string; x: number; y: number; baseline: string; fill: string; stroke: string; width: number; align: string; rotate: number }
const rgbHex = (c: string): string => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c)
  if (m === null) return c.toLowerCase()
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')
}
const longHex = (c: string): string => (/^#[0-9a-f]{3}$/i.test(c) ? '#' + [...c.slice(1)].map((d) => d + d).join('') : c).toLowerCase()
function echartsBarLabels(option: object): BarLabelFact[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return [...svg.matchAll(/<text dominant-baseline="central" text-anchor="(middle|start|end)"([^>]*)>(-?\d+)<\/text>/g)].filter((m) => !m[2]!.includes('fill="#54555a"')).map((m) => {
    const attrs = m[2]!
    // A rotated label is written as a matrix about the same anchor.
    const mx = /matrix\(([-\d.]+),([-\d.]+),[-\d.]+,[-\d.]+,([-\d.]+),([-\d.]+)\)/.exec(attrs)
    const t = mx !== null ? [mx[0], mx[3], mx[4]] : /translate\(([-\d.]+) ([-\d.]+)\)/.exec(attrs)!
    const dy = /\sy="(-?[\d.]+)"/.exec(attrs)
    const stroke = /stroke="([^"]+)"/.exec(attrs)
    return {
      text: m[3]!,
      x: Number(t[1]),
      y: Number(t[2]),
      baseline: dy === null ? 'middle' : Number(dy[1]) < 0 ? 'bottom' : 'top',
      fill: longHex(/fill="([^"]+)"/.exec(attrs)![1]!),
      stroke: stroke === null ? '' : longHex(rgbHex(stroke[1]!)),
      width: stroke === null ? 0 : Number(/stroke-width="([\d.]+)"/.exec(attrs)![1]),
      align: m[1]!,
      // The matrix's angle, clockwise-positive (screen y points down).
      rotate: mx === null ? 0 : Math.round((Math.atan2(Number(mx[2]), Number(mx[1])) * 180) / Math.PI),
    }
  })
}
function ourBarLabels(option: object): BarLabelFact[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  return renderChart(c.spec, m).flatMap((d) =>
    d.kind === 'text' && /^-?\d+$/.test(d.text) && d.fill !== c.spec.theme.label
      ? [{ text: d.text, x: d.at.x, y: d.at.y, baseline: d.baseline, fill: longHex(d.fill), stroke: d.stroke === undefined ? '' : longHex(d.stroke), width: d.stroke === undefined ? 0 : (d.strokeWidth ?? 2), align: d.align, rotate: Math.round(d.rotate ?? 0) }]
      : [],
  )
}
const barsLabelled = (series: object): object => ({
  color: ['#5070dd'],
  xAxis: { type: 'category', data: ['a', 'b', 'c'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [3, -2, 8], ...series }],
})
const BAR_LABEL_CASES: [string, object][] = [
  ['inside by default: light text haloed in the bar colour', { label: { show: true } }],
  ['top, incl. a negative bar (its geometric top, the zero line)', { label: { show: true, position: 'top' } }],
  ['bottom', { label: { show: true, position: 'bottom' } }],
  ['insideTop', { label: { show: true, position: 'insideTop' } }],
  ['insideBottom with a distance', { label: { show: true, position: 'insideBottom', distance: 10 } }],
  ['an explicit colour takes no automatic halo', { label: { show: true, color: '#ff0000' } }],
  ['a light bar takes dark text and no halo', { itemStyle: { color: '#ffe066' }, label: { show: true } }],
  ['a dark bar takes #ccc', { itemStyle: { color: '#1a1a40' }, label: { show: true } }],
  ['textBorderColor and textBorderWidth', { label: { show: true, textBorderColor: '#00ff00', textBorderWidth: 3 } }],
  ['rotate about the anchor', { label: { show: true, rotate: 90 } }],
  ['the rotated insideBottom label: align, verticalAlign, distance', { label: { show: true, rotate: 90, position: 'insideBottom', align: 'left', verticalAlign: 'middle', distance: 15 } }],
  ['offset', { label: { show: true, offset: [5, -10] } }],
  ['top, align left', { label: { show: true, position: 'top', align: 'left' } }],
  ['top, rotate 30', { label: { show: true, position: 'top', rotate: 30 } }],
  ['top, verticalAlign top', { label: { show: true, position: 'top', verticalAlign: 'top' } }],
]

describe('ECharts differential: bar value labels', () => {
  for (const [name, series] of BAR_LABEL_CASES) {
    it(name, () => {
      const e = echartsBarLabels(barsLabelled(series))
      const u = ourBarLabels(barsLabelled(series))
      expect(u.length).toBe(e.length)
      expect(e.length).toBe(3)
      for (let i = 0; i < e.length; i++) {
        expect(u[i]!.text).toBe(e[i]!.text)
        expect(Math.abs(u[i]!.x - e[i]!.x)).toBeLessThan(0.6)
        expect(Math.abs(u[i]!.y - e[i]!.y)).toBeLessThan(0.6)
        expect(u[i]!.baseline).toBe(e[i]!.baseline)
        expect(u[i]!.fill).toBe(e[i]!.fill)
        expect(u[i]!.stroke).toBe(e[i]!.stroke)
        expect(u[i]!.width).toBe(e[i]!.width)
        expect(u[i]!.align).toBe(e[i]!.align)
        // Both read clockwise-positive: ECharts' `rotate: 90` (counter-clockwise) is -90 in either.
        expect(u[i]!.rotate).toBe(e[i]!.rotate)
      }
    })
  }
})

/**
 * Axis label geometry: every tick label's anchor, alignment, vertical
 * alignment and rotation, for the category x axis and the value y axis —
 * `axisLabel.margin` (8 by default), `inside`, and `rotate` about the anchor.
 */
interface AxisLabelFact { text: string; x: number; y: number; align: string; baseline: string; rotate: number }
const ANCHOR_OF: Record<string, string> = { start: 'start', middle: 'middle', end: 'end' }
function echartsAxisLabels(option: object): AxisLabelFact[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return [...svg.matchAll(/<text dominant-baseline="central" text-anchor="(\w+)"([^>]*)>([^<]+)<\/text>/g)].map((m) => {
    const attrs = m[2]!
    const tr = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(attrs)
    const mx = /matrix\(([-\d.]+),([-\d.]+),[-\d.]+,[-\d.]+,([-\d.]+),([-\d.]+)\)/.exec(attrs)
    const dy = /\sy="(-?[\d.]+)"/.exec(attrs)
    return {
      text: m[3]!,
      x: tr !== null ? Number(tr[1]) : Number(mx![3]),
      y: tr !== null ? Number(tr[2]) : Number(mx![4]),
      align: ANCHOR_OF[m[1]!] ?? m[1]!,
      baseline: dy === null ? 'middle' : Number(dy[1]) < 0 ? 'bottom' : 'top',
      rotate: mx === null ? 0 : Math.round((Math.atan2(Number(mx[2]), Number(mx[1])) * 180) / Math.PI),
    }
  }).sort((a, b) => a.text.localeCompare(b.text))
}
function ourAxisLabels(option: object, texts: string[]): AxisLabelFact[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  return renderChart(c.spec, m)
    .flatMap((d) => (d.kind === 'text' && texts.includes(d.text) ? [{ text: d.text, x: d.at.x, y: d.at.y, align: d.align, baseline: d.baseline, rotate: Math.round(d.rotate ?? 0) }] : []))
    .sort((a, b) => a.text.localeCompare(b.text))
}
const axisOpt = (xAxis: object, yAxis: object): object => ({
  xAxis: { type: 'category', data: ['aa', 'bb', 'cc'], ...xAxis },
  yAxis: { type: 'value', ...yAxis },
  series: [{ type: 'bar', data: [30, 120, 80], label: { show: false } }],
})
const AXIS_LABEL_CASES: [string, object][] = [
  ['the default: 8px off both axes', axisOpt({}, {})],
  ['x margin', axisOpt({ axisLabel: { margin: 14 } }, {})],
  ['x inside', axisOpt({ axisLabel: { inside: true } }, {})],
  ['x rotate', axisOpt({ axisLabel: { rotate: 30 } }, {})],
  ['y margin', axisOpt({}, { axisLabel: { margin: 20 } })],
  ['y inside', axisOpt({}, { axisLabel: { inside: true } })],
  ['y rotate', axisOpt({}, { axisLabel: { rotate: 45 } })],
]

describe('ECharts differential: axis label geometry', () => {
  for (const [name, option] of AXIS_LABEL_CASES) {
    it(name, () => {
      const e = echartsAxisLabels(option)
      const u = ourAxisLabels(option, e.map((f) => f.text))
      expect(u.map((f) => f.text)).toEqual(e.map((f) => f.text))
      for (let i = 0; i < e.length; i++) {
        const tag = e[i]!.text
        expect(Math.abs(u[i]!.x - e[i]!.x), tag + ' x').toBeLessThan(0.6)
        expect(Math.abs(u[i]!.y - e[i]!.y), tag + ' y').toBeLessThan(0.6)
        expect(u[i]!.align, tag + ' align').toBe(e[i]!.align)
        expect(u[i]!.baseline, tag + ' baseline').toBe(e[i]!.baseline)
        expect(u[i]!.rotate, tag + ' rotate').toBe(e[i]!.rotate)
      }
    })
  }
})

/**
 * Axis strokes: the axis lines, ticks and split lines, as segments. ECharts
 * shows an axis's line and ticks only when the other axis is a value axis,
 * and a category axis on bands drops its ticks; `axisLine`, `axisTick` and
 * `splitLine` override. Geometry is compared for every case; stroke colour,
 * width and dash where the option sets them. ECharts draws 1px lines on the
 * half pixel, so positions match within a pixel.
 */
interface StrokeFact { x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash: string }
const SERIES_INK = '#123456'
const seg = (x1: number, y1: number, x2: number, y2: number): [number, number, number, number] => (x1 > x2 || (x1 === x2 && y1 > y2) ? [x2, y2, x1, y1] : [x1, y1, x2, y2])
const byPos = (a: StrokeFact, b: StrokeFact): number => a.x1 - b.x1 || a.y1 - b.y1 || a.x2 - b.x2 || a.y2 - b.y2
function echartsStrokes(option: object): StrokeFact[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const out: StrokeFact[] = []
  for (const m of svg.matchAll(/<path d="M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)"([^>]*)>/g)) {
    const attrs = m[5]!
    if (attrs.includes(SERIES_INK) || !attrs.includes('fill="none"')) continue
    const [x1, y1, x2, y2] = seg(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]))
    const dash = /stroke-dasharray="([^"]+)"/.exec(attrs)
    out.push({ x1, y1, x2, y2, stroke: longHex(/stroke="([^"]+)"/.exec(attrs)![1]!), width: Number(/stroke-width="([\d.]+)"/.exec(attrs)?.[1] ?? 1), dash: dash === null ? '' : dash[1]!.replace(/\s/g, '') })
  }
  return out.sort(byPos)
}
function ourStrokes(option: object): StrokeFact[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  return renderChart(c.spec, m)
    .flatMap((d) => {
      if (d.kind !== 'line') return []
      const [x1, y1, x2, y2] = seg(d.from.x, d.from.y, d.to.x, d.to.y)
      return [{ x1, y1, x2, y2, stroke: longHex(d.stroke), width: d.width, dash: d.dash === undefined ? '' : d.dash.join(',') }]
    })
    .sort(byPos)
}
const strokesOf = (x: object, y: object, series: object = { type: 'bar', data: [30, 120, 80] }): object => ({
  xAxis: { type: 'category', data: ['a', 'b', 'c'], ...x },
  yAxis: { type: 'value', ...y },
  series: [{ itemStyle: { color: SERIES_INK }, lineStyle: { color: SERIES_INK }, ...series }],
})
const STROKE_CASES: [string, object, boolean][] = [
  ['a category x and value y: the x line and the split lines only', strokesOf({}, {}), false],
  ['value x and value y: both lines, ticks on both, split lines both ways', {
    xAxis: { type: 'value' }, yAxis: { type: 'value' },
    series: [{ type: 'scatter', data: [[1, 2], [3, 4]], itemStyle: { color: SERIES_INK } }],
  }, false],
  ['category ticks shown: on the band edges', strokesOf({ axisTick: { show: true } }, {}), false],
  ['alignWithLabel, length, inside and a styled axis line', strokesOf({ axisTick: { show: true, alignWithLabel: true, length: 8, inside: true }, axisLine: { lineStyle: { color: '#ff0000', width: 2 } } }, {}), true],
  ['a y axis line and ticks shown, dashed split lines', strokesOf({}, { axisLine: { show: true, lineStyle: { color: '#00aa00' } }, axisTick: { show: true }, splitLine: { lineStyle: { type: 'dashed', color: '#aaaaaa' } } }), true],
  ['boundaryGap false: category ticks on the labels', strokesOf({ boundaryGap: false }, {}, { type: 'line', data: [30, 120, 80], showSymbol: false }), false],
  ['a hidden x axis line', strokesOf({ axisLine: { show: false } }, {}), false],
  ['a y range crossing zero: the x line and ticks move to zero (onZero)', strokesOf({ axisTick: { show: true } }, {}, { type: 'bar', data: [30, -120, 80] }), false],
  ['onZero false keeps the x line at the edge', strokesOf({ axisLine: { onZero: false } }, {}, { type: 'bar', data: [30, -120, 80] }), false],
  ['a value x crossing zero: the y line sits on x = 0', {
    xAxis: { type: 'value' }, yAxis: { type: 'value' },
    series: [{ type: 'scatter', data: [[-3, 2], [5, 4]], itemStyle: { color: SERIES_INK } }],
  }, false],
  ['two y axes beside a category x: neither draws a line', {
    xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: [{ type: 'value' }, { type: 'value' }],
    series: [{ type: 'bar', data: [30, 120, 80], itemStyle: { color: SERIES_INK } }, { type: 'line', yAxisIndex: 1, data: [3, 1, 2], lineStyle: { color: SERIES_INK }, itemStyle: { color: SERIES_INK }, showSymbol: false }],
  }, false],
]

describe('ECharts differential: axis strokes', () => {
  for (const [name, option, styled] of STROKE_CASES) {
    it(name, () => {
      const e = echartsStrokes(option)
      const u = ourStrokes(option)
      expect(e.length).toBeGreaterThan(0)
      expect(u.length, JSON.stringify(u.map((f) => [f.x1, f.y1, f.x2, f.y2]))).toBe(e.length)
      // Each ECharts stroke is matched to an unused one of ours at the same place
      // (coincident strokes — the bottom split line and the x axis line — are
      // told apart by their style where the option set one).
      const used = new Set<number>()
      for (const f of e) {
        const tag = `${f.x1},${f.y1} → ${f.x2},${f.y2}`
        // ECharts snaps a 1px line to the half pixel (subPixelOptimize: round, then +0.5).
        const near = (g: StrokeFact): boolean => Math.abs(g.x1 - f.x1) <= 1 && Math.abs(g.y1 - f.y1) <= 1 && Math.abs(g.x2 - f.x2) <= 1 && Math.abs(g.y2 - f.y2) <= 1
        // Styles are compared where the option set them; ECharts' default tokens are its theme, not the option's.
        const styledHere = styled && f.stroke !== '#dbdee4' && f.stroke !== '#54555a'
        const j = u.findIndex((g, k) => !used.has(k) && near(g) && (!styledHere || (g.stroke === f.stroke && g.width === f.width && g.dash === f.dash)))
        expect(j, tag + (styledHere ? ` (${f.stroke} ${f.width} [${f.dash}])` : '')).toBeGreaterThanOrEqual(0)
        used.add(j)
      }
    })
  }
})

/**
 * Line and scatter labels: placed against the symbol's box (a line above
 * it, a scatter point inside it, by default), with zrender's automatic
 * colours; a line with no symbols shows no labels.
 */
const pointsLabelled = (series: object): object => ({
  color: ['#5070dd'],
  xAxis: { type: 'category', data: ['a', 'b', 'c'] },
  yAxis: { type: 'value' },
  // Values no tick label shares, so the axis labels cannot be mistaken for them.
  series: [{ data: [31, -3, 83], ...series }],
})
const POINT_LABEL_CASES: [string, object][] = [
  ['a line: above the hollow symbol', { type: 'line', label: { show: true } }],
  ['a line with a bigger symbol', { type: 'line', symbolSize: 12, label: { show: true } }],
  ['a line, bottom', { type: 'line', label: { show: true, position: 'bottom' } }],
  ['a scatter point: inside, light text haloed in its colour', { type: 'scatter', label: { show: true } }],
  ['a scatter point, right', { type: 'scatter', label: { show: true, position: 'right' } }],
  ['a line with no symbols shows no labels', { type: 'line', showSymbol: false, label: { show: true } }],
  ['a line label, rotated and offset', { type: 'line', label: { show: true, rotate: 45, offset: [4, -6] } }],
  ['a scatter label, aligned left and top', { type: 'scatter', label: { show: true, position: 'right', align: 'left', verticalAlign: 'top' } }],
]

describe('ECharts differential: line and scatter labels', () => {
  for (const [name, series] of POINT_LABEL_CASES) {
    it(name, () => {
      const e = echartsBarLabels(pointsLabelled(series))
      const u = ourBarLabels(pointsLabelled(series))
      // Never vacuous: every case but the symbol-less line labels all three data.
      expect(e.length).toBe((series as { showSymbol?: boolean }).showSymbol === false ? 0 : 3)
      expect(u.length).toBe(e.length)
      for (let i = 0; i < e.length; i++) {
        expect(u[i]!.text).toBe(e[i]!.text)
        expect(Math.abs(u[i]!.x - e[i]!.x)).toBeLessThan(0.6)
        expect(Math.abs(u[i]!.y - e[i]!.y)).toBeLessThan(0.6)
        expect(u[i]!.baseline).toBe(e[i]!.baseline)
        expect(u[i]!.fill).toBe(e[i]!.fill)
        expect(u[i]!.stroke).toBe(e[i]!.stroke)
        expect(u[i]!.align).toBe(e[i]!.align)
        expect(u[i]!.rotate).toBe(e[i]!.rotate)
      }
    })
  }
})

/**
 * Area fills: a line with `areaStyle` fills down to its origin at ECharts'
 * 0.7 opacity, under its own line. Compared on the fill polygon's points,
 * colour and opacity, and on the line still being drawn.
 */
/** The fill's top edge (one point per datum), the y it closes at, its colour and opacity. */
interface AreaFact { top: number[]; baseY: number; fill: string; opacity: number }
function echartsArea(option: object): AreaFact & { hasLine: boolean } {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const m = /<path d="(M[^"]*Z)"([^>]*fill-opacity="([\d.]+)"[^>]*)>/.exec(svg)!
  const fill = /fill="([^"]+)"/.exec(m[2]!)![1]!
  const xs = nums(m[1]!)
  // ECharts writes the top edge, then back along the baseline through every datum's x.
  return { top: xs.slice(0, 6), baseY: xs[xs.length - 1]!, fill: longHex(fill), opacity: Number(m[3]), hasLine: /<path d="M[^"Z]*" fill="none"[^>]*stroke="#5070dd"/.test(svg) }
}
function ourArea(option: object): AreaFact & { hasLine: boolean } {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const cmds = renderChart(c.spec, m)
  const poly = cmds.find((d) => d.kind === 'polygon')!
  if (poly.kind !== 'polygon') throw new Error('no fill')
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(poly.fill)
  return {
    top: poly.points.slice(0, 3).flatMap((p) => [p.x, p.y]),
    baseY: poly.points[poly.points.length - 1]!.y,
    fill: rgba === null ? longHex(poly.fill) : longHex('#' + [rgba[1], rgba[2], rgba[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')),
    opacity: rgba === null ? 1 : Number(rgba[4]),
    hasLine: cmds.some((d) => d.kind === 'polyline' && longHex(d.stroke) === '#5070dd'),
  }
}
const areaOf = (series: object, xAxis: object = {}): object => ({
  color: ['#5070dd'],
  xAxis: { type: 'category', data: ['a', 'b', 'c'], boundaryGap: false, ...xAxis },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: [31, 53, 83], showSymbol: false, ...series }],
})
const AREA_CASES: [string, object][] = [
  ['the default: series colour at 0.7, closed to zero, the line over it', areaOf({ areaStyle: {} })],
  ['areaStyle.opacity', areaOf({ areaStyle: { opacity: 0.3 } })],
  ['areaStyle.color', areaOf({ areaStyle: { color: '#ff0000' } })],
  ["origin 'end' closes to the top", areaOf({ areaStyle: { origin: 'end' } })],
  ['a range through zero closes to zero, not the floor', areaOf({ data: [31, -20, 83], areaStyle: {} })],
]

describe('ECharts differential: area fills', () => {
  for (const [name, option] of AREA_CASES) {
    it(name, () => {
      const e = echartsArea(option)
      const u = ourArea(option)
      // ECharts writes coordinates at 0.1 precision.
      for (let i = 0; i < e.top.length; i++) expect(Math.abs(u.top[i]! - e.top[i]!)).toBeLessThan(0.11)
      expect(Math.abs(u.baseY - e.baseY)).toBeLessThan(0.11)
      expect(u.fill).toBe(e.fill)
      expect(u.opacity).toBeCloseTo(e.opacity, 5)
      expect(e.hasLine).toBe(true)
      expect(u.hasLine).toBe(true)
    })
  }
})

/**
 * The slider dataZoom: where ECharts puts the strip (under the plot, laid out
 * in the whole chart, shifted by its group's bounding box), where its window's
 * filler and handles sit, the brush's move handle above it, and the data
 * shadow's points (the first series over every row, its extent padded 30%).
 * Read off ECharts' flipped slider group — every part is drawn in a
 * `matrix(1,0,0,-1,x,y)` frame whose origin is the strip's bottom-left.
 */
interface SliderFacts {
  strip: { x: number; y: number; w: number; h: number }
  filler: { x: number; w: number }
  handles: number[]
  move: { y0: number; y1: number } | null
  shadow: Pt[]
  plotBottom: number
}
function echartsSlider(option: object, w: number, h: number): SliderFacts {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: h })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const s = /<path d="M0 0l([\d.]+) 0l0 ([\d.]+)l-[\d.]+ 0Z" transform="matrix\(1,0,0,-1,([\d.]+),([\d.]+)\)"/.exec(svg)!
  const sw = Number(s[1])
  const sh = Number(s[2])
  const tx = Number(s[3])
  const ty = Number(s[4])
  const f = /<path d="M([\d.]+) 0l([\d.]+) 0l0 [\d.]+l-[\d.]+ 0Z" transform="matrix\(1,0,0,-1,[\d.]+,[\d.]+\)" fill="rgb\(135/.exec(svg)!
  const handles = [...svg.matchAll(/matrix\([\d.]+,0,0,-[\d.]+,([\d.]+),[\d.]+\)" fill="#fff" stroke="#c0c9e6"/g)].map((m) => Number(m[1]))
  const m = /<path d="M[\d.]+ ([\d.]+)L[\d.]+ [\d.]+L[\d.]+ [\d.]+A2 2 0 0 1 [\d.]+ ([\d.]+)L/.exec(svg)
  const poly = /<polyline points="([^"]+)" transform="matrix\(1,0,0,-1/.exec(svg)!
  const nums = poly[1]!.trim().split(/\s+/).map(Number)
  const shadow: Pt[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) shadow.push({ x: tx + nums[i]!, y: ty - nums[i + 1]! })
  const ys = [...svg.matchAll(/<path d="M[\d.]+ ([\d.]+)L[\d.]+ [\d.]+" fill="none"[^>]*stroke="#dbdee4"/g)].map((x) => Number(x[1]))
  return {
    strip: { x: tx, y: ty - sh, w: sw, h: sh },
    filler: { x: tx + Number(f[1]), w: Number(f[2]) },
    handles,
    move: m === null ? null : { y0: ty - Number(m[2]), y1: ty - Number(m[1]) },
    shadow,
    plotBottom: Math.max(...ys),
  }
}
function ourSlider(option: object, w: number, h: number): SliderFacts {
  const c = compileOption(option as EChartsOption, { width: w, height: h })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const view = zoomedView(c, 0, undefined, m)
  const nav = view.navigator!
  const filler = nav.cmds.find((d) => d.kind === 'rect' && d.fill === 'rgba(135,175,255,0.2)') as { rect: { x: number; w: number } }
  const handles = nav.cmds.filter((d) => d.kind === 'line').map((d) => (d as { from: Pt }).from.x).filter((x, i, a) => a.indexOf(x) === i)
  const move = nav.cmds.find((d) => d.kind === 'rect' && d.fill === 'rgba(130,146,204,0.5)') as { rect: { y: number; h: number } } | undefined
  const shadow = nav.cmds.filter((d) => d.kind === 'polyline' && d.width === 0.5).flatMap((d) => (d as { points: Pt[] }).points)
  return {
    strip: nav.strip,
    filler: { x: filler.rect.x, w: filler.rect.w },
    handles,
    move: move === undefined ? null : { y0: move.rect.y, y1: move.rect.y + move.rect.h },
    shadow,
    plotBottom: layoutChart(view.spec, m).plot.y + layoutChart(view.spec, m).plot.h,
  }
}
const zoomLine = (dz: object, extra: object = {}): object => ({
  xAxis: { type: 'category', data: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
  yAxis: {},
  dataZoom: [{ type: 'slider', start: 25, end: 75, ...dz }],
  series: [{ type: 'line', data: [1, 3, 2, 4, 6, 5, 7, 6] }],
  ...extra,
})
const SLIDER_CASES: [string, object, number, number][] = [
  ['the default slider, a window of 25–75%', zoomLine({}), 400, 300],
  ['the whole range', zoomLine({ start: 0, end: 100 }), 400, 300],
  ['a larger chart', zoomLine({ start: 10, end: 90 }), 600, 400],
  ['under a set grid', zoomLine({}, { grid: { left: 30, right: 20, bottom: 70 } }), 400, 300],
  ['without the brush (no move handle)', zoomLine({ brushSelect: false }), 400, 300],
  ['a set bottom and height', zoomLine({ bottom: 5, height: 20 }), 400, 300],
  ['a set left and width', zoomLine({ left: 40, width: 200 }), 400, 300],
]

describe('ECharts differential: the slider dataZoom', () => {
  for (const [name, option, w, h] of SLIDER_CASES) {
    it(name, () => {
      const e = echartsSlider(option, w, h)
      const u = ourSlider(option, w, h)
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(u.strip[k] - e.strip[k]), `strip.${k}: ${u.strip[k]} vs ${e.strip[k]}`).toBeLessThan(0.6)
      expect(Math.abs(u.filler.x - e.filler.x)).toBeLessThan(0.6)
      expect(Math.abs(u.filler.w - e.filler.w)).toBeLessThan(0.6)
      expect(u.handles.length).toBe(2)
      for (let i = 0; i < 2; i++) expect(Math.abs(u.handles[i]! - e.handles[i]!), `handle ${i}`).toBeLessThan(0.6)
      expect(u.move === null).toBe(e.move === null)
      if (u.move !== null && e.move !== null) {
        expect(Math.abs(u.move.y0 - e.move.y0)).toBeLessThan(0.6)
        expect(Math.abs(u.move.y1 - e.move.y1)).toBeLessThan(0.6)
      }
      // Every point of ECharts' shadow is a point of ours (ours also carries the cuts at the window ends).
      for (const p of e.shadow) expect(u.shadow.some((q) => Math.abs(q.x - p.x) < 0.15 && Math.abs(q.y - p.y) < 0.15), `shadow point ${p.x},${p.y}`).toBe(true)
      // The slider takes nothing from the plot: it sits in the grid's bottom margin.
      expect(Math.abs(u.plotBottom - e.plotBottom)).toBeLessThan(1.5)
    })
  }
})

/**
 * A scrolling legend (`type: 'scroll'`) that overflows: ECharts lays the
 * entries in one line, clips it short of the page controller at the end
 * (prev arrow, `{current}/{total}`, next arrow — an arrow dimmed when there is
 * no page that way) and starts the line at `scrollDataIndex`. Compared: the
 * controller, the page text, and which entries the window shows WHOLE and
 * where (ours leaves out the one the window's edge cuts — ECharts clips it).
 */
interface ScrollLegendFacts { arrows: { x: number; y: number; fill: string }[]; page: string | null; whole: { text: string; at: number }[]; cut: string[] }
const SCROLL_NAMES = ['Alpha', 'Beta series', 'Gamma', 'Delta long name', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron']
/** An entry along the line: its left edge in a row, its top in a column; `size` is its extent there. */
const alongOf = (vertical: boolean, x: number, y: number): number => (vertical ? y : x)
function echartsScrollLegend(option: object, w: number): ScrollLegendFacts {
  const vertical = (option as { legend: { orient?: string } }).legend.orient === 'vertical'
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const clip = /<clipPath id="zr\d+-c\d+">\s*<path d="M0 0l([\d.]+) 0l0 ([\d.]+)l-[\d.]+ 0Z" transform="translate\(([\d.]+) ([\d.]+)\)/.exec(svg)
  const arrows = [...svg.matchAll(/<path d="M-?(?:4\.5 0|7\.5 -?7\.5)L[^"]+" transform="translate\(([\d.]+) ([\d.]+)\)" fill="([^"]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), fill: m[3]! }))
  const page = /style="font: normal normal 12px sans-serif"(?: xml:space="preserve")? transform="translate\([\d.]+ [\d.]+\)" fill="#6d6e73">([^<]+)</.exec(svg)
  const m = (t: string): number => echarts.format.getTextRect(t, '12px sans-serif').width
  const lo = clip === null ? -Infinity : vertical ? Number(clip[4]) : Number(clip[3])
  const hi = clip === null ? Infinity : lo + (vertical ? Number(clip[2]) : Number(clip[1]))
  const all = [...svg.matchAll(/x="30" y="7" transform="translate\((-?[\d.]+) (-?[\d.]+)\)" fill="[^"]+">([^<]+)</g)]
    .map((g) => ({ text: g[3]!, at: alongOf(vertical, Number(g[1]), Number(g[2])) }))
    .filter((f) => SCROLL_NAMES.includes(f.text))
  const size = (t: string): number => (vertical ? 14 : 30 + m(t))
  const inside = (f: { text: string; at: number }): boolean => f.at >= lo - 0.1 && f.at + size(f.text) <= hi + 0.1
  // Cut: an entry that overlaps the window without fitting in it (ECharts draws it, clipped).
  const cut = all.filter((f) => !inside(f) && f.at + size(f.text) > lo && f.at < hi).map((f) => f.text)
  return { arrows, page: page === null ? null : page[1]!, whole: all.filter(inside), cut }
}
function ourScrollLegend(option: object, w: number): ScrollLegendFacts {
  const vertical = (option as { legend: { orient?: string } }).legend.orient === 'vertical'
  const c = compileOption(option as EChartsOption, { width: w, height: H })
  const measure = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const cmds = compiledCommands(c, option as EChartsOption, measure).cmds
  // The controller's arrows: triangles 9 x 15 (a row) or 15 x 15 (a column), at their box centre.
  const arrows = cmds.flatMap((d) => {
    if (d.kind !== 'polygon' || d.points.length !== 3) return []
    const xs = d.points.map((p) => p.x)
    const ys = d.points.map((p) => p.y)
    const bw = Math.max(...xs) - Math.min(...xs)
    const bh = Math.max(...ys) - Math.min(...ys)
    return Math.abs(bh - 15) < 0.01 && (Math.abs(bw - 9) < 0.01 || Math.abs(bw - 15) < 0.01) ? [{ x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, fill: d.fill }] : []
  })
  const page = cmds.find((d) => d.kind === 'text' && /^\d+\/\d+$|^Page/.test(d.text)) as { text: string } | undefined
  // An entry's text is drawn 30 in from its left edge (a 25 icon, 5 gap), at its row's middle (14 tall).
  const clip = cmds.find((d) => d.kind === 'clip') as { rect: { x: number; y: number; w: number; h: number } } | undefined
  const m = (t: string): number => measure(t, 12)
  const size = (t: string): number => (vertical ? 14 : 30 + m(t))
  const drawn = cmds.flatMap((d) => (d.kind === 'text' && SCROLL_NAMES.includes(d.text) ? [{ text: d.text, at: alongOf(vertical, d.at.x - 30, d.at.y - 7) }] : []))
  if (clip === undefined) return { arrows, page: page?.text ?? null, whole: drawn, cut: [] }
  const lo = vertical ? clip.rect.y : clip.rect.x
  const hi = lo + (vertical ? clip.rect.h : clip.rect.w)
  const inside = (f: { text: string; at: number }): boolean => f.at >= lo - 0.1 && f.at + size(f.text) <= hi + 0.1
  return { arrows, page: page?.text ?? null, whole: drawn.filter(inside), cut: drawn.filter((f) => !inside(f)).map((f) => f.text) }
}
const scrollOf = (legend: object, n = 10): object => ({
  legend: { type: 'scroll', ...legend },
  xAxis: { type: 'category', data: ['a'] },
  yAxis: {},
  series: SCROLL_NAMES.slice(0, n).map((name) => ({ type: 'bar', name, data: [1] })),
})
const SCROLL_CASES: [string, object, number][] = [
  ['the first page', scrollOf({}), 400],
  ['the second page', scrollOf({ scrollDataIndex: 3 }), 400],
  ['the last page', scrollOf({ scrollDataIndex: 7 }), 400],
  ['a wider chart', scrollOf({}), 600],
  ['itemGap moves the entries and the clip', scrollOf({ itemGap: 20 }), 400],
  ['padding', scrollOf({ padding: 10 }), 400],
  ['pageButtonGap', scrollOf({ pageButtonGap: 0, scrollDataIndex: 4 }), 400],
  ['a pageFormatter', scrollOf({ pageFormatter: 'Page {current} of {total}' }), 400],
  ['a line that fits shows no controller', scrollOf({}, 3), 400],
  ['pageButtonPosition start: the controller first, the line after it', scrollOf({ pageButtonPosition: 'start' }, 15), 400],
  ['a vertical legend: one column, the controller under it', scrollOf({ orient: 'vertical', right: 10, top: 'middle' }, 15), 400],
  ['a vertical legend, second page', scrollOf({ orient: 'vertical', right: 10, top: 'middle', scrollDataIndex: 11 }, 15), 400],
  ['a vertical legend at the left, controller first', scrollOf({ orient: 'vertical', left: 10, top: 20, pageButtonPosition: 'start' }, 15), 400],
]

describe('ECharts differential: the scrolling legend', () => {
  for (const [name, option, w] of SCROLL_CASES) {
    it(name, () => {
      const e = echartsScrollLegend(option, w)
      const u = ourScrollLegend(option, w)
      expect(u.page).toBe(e.page)
      expect(u.arrows.map((a) => a.fill)).toEqual(e.arrows.map((a) => a.fill))
      u.arrows.forEach((a, k) => {
        expect(Math.abs(a.x - e.arrows[k]!.x), `arrow ${k} x`).toBeLessThan(0.6)
        expect(Math.abs(a.y - e.arrows[k]!.y), `arrow ${k} y`).toBeLessThan(0.6)
      })
      expect(u.whole.map((f) => f.text)).toEqual(e.whole.map((f) => f.text))
      u.whole.forEach((f, k) => expect(Math.abs(f.at - e.whole[k]!.at), f.text).toBeLessThan(0.6))
      // The entry the window's edge cuts is drawn, clipped, as ECharts draws it.
      expect(u.cut).toEqual(e.cut)
    })
  }
})

/**
 * Axis decoration: `splitArea` (bands between the ticks, colours cycled from
 * the axis start), `minorSplitLine` and `minorTick` (each value interval cut
 * into `minorTick.splitNumber` pieces). Compared on ECharts' band rects and
 * fills, and the positions of its minor lines and ticks.
 */
interface DecorFacts { bands: { x: number; y: number; w: number; h: number; fill: string }[]; minorH: number[]; minorV: number[]; minorTicks: number[] }
const rgbaOf = (rgb: string, opacity: string | undefined): string => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb)
  return m === null ? rgb : `rgba(${m[1]},${m[2]},${m[3]},${opacity ?? '1'})`
}
function echartsDecor(option: object, minorColor: string, tickLen: number): DecorFacts {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const bands = [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)l([-\d.]+) 0l0 ([-\d.]+)l[-\d.]+ 0Z" fill="(rgb\([\d,]+\)|#[0-9a-f]+)"(?: fill-opacity="([\d.]+)")? class/g)].map((m) => {
    const x = Number(m[1]); const y = Number(m[2]); const w = Number(m[3]); const h = Number(m[4])
    return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h), fill: rgbaOf(m[5]!, m[6]) }
  }).filter((b) => b.fill !== '#000') // the plot's clip path
  const lines = [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)" fill="none" pointer-events="visible" stroke="([^"]+)"/g)].map((m) => ({ x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]), stroke: m[5]! }))
  return {
    bands,
    minorH: lines.filter((l) => l.stroke === minorColor && l.y0 === l.y1).map((l) => l.y0),
    minorV: lines.filter((l) => l.stroke === minorColor && l.x0 === l.x1).map((l) => l.x0),
    minorTicks: lines.filter((l) => l.stroke !== minorColor && ((l.y0 === l.y1 && Math.abs(Math.abs(l.x1 - l.x0) - tickLen) < 0.6) || (l.x0 === l.x1 && Math.abs(Math.abs(l.y1 - l.y0) - tickLen) < 0.6))).map((l) => (l.y0 === l.y1 ? l.y0 : l.x0)),
  }
}
function ourDecor(option: object, minorColor: string, tickLen: number): DecorFacts {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const cmds = renderChart(c.spec, m)
  const areaFills = new Set([...(c.spec.ySplitArea ?? []), ...(c.spec.xSplitArea ?? [])])
  const lines = cmds.filter((d) => d.kind === 'line') as { from: Pt; to: Pt; stroke: string }[]
  return {
    bands: cmds.flatMap((d) => (d.kind === 'rect' && areaFills.has(d.fill) ? [{ ...d.rect, fill: d.fill }] : [])),
    minorH: lines.filter((l) => l.stroke === minorColor && l.from.y === l.to.y).map((l) => l.from.y),
    minorV: lines.filter((l) => l.stroke === minorColor && l.from.x === l.to.x).map((l) => l.from.x),
    minorTicks: lines.filter((l) => l.stroke !== minorColor && ((l.from.y === l.to.y && Math.abs(Math.abs(l.to.x - l.from.x) - tickLen) < 0.01) || (l.from.x === l.to.x && Math.abs(Math.abs(l.to.y - l.from.y) - tickLen) < 0.01))).map((l) => (l.from.y === l.to.y ? l.from.y : l.from.x)),
  }
}
const decorLine = (xAxis: object, yAxis: object): object => ({ xAxis: { type: 'category', data: ['a', 'b', 'c', 'd'], ...xAxis }, yAxis, series: [{ type: 'line', data: [1, 3, 2, 4] }] })
const DECOR_CASES: [string, object, string, number][] = [
  ['splitArea on both axes', decorLine({ splitArea: { show: true } }, { splitArea: { show: true } }), '#f4f7fd', 3],
  ['minor split lines and ticks by default', decorLine({}, { minorTick: { show: true }, minorSplitLine: { show: true } }), '#f4f7fd', 3],
  ['minorTick splitNumber, length and styles', decorLine({}, { minorTick: { show: true, splitNumber: 2, length: 6, lineStyle: { color: '#123456' } }, minorSplitLine: { show: true, lineStyle: { color: '#abcdef' } } }), '#abcdef', 6],
  ['splitArea colours cycle', decorLine({}, { splitArea: { show: true, areaStyle: { color: ['#ff0000', '#00ff00', '#0000ff'] } } }), '#f4f7fd', 3],
  ['a value x axis divides too', { xAxis: { type: 'value', minorTick: { show: true }, minorSplitLine: { show: true } }, yAxis: { type: 'value' }, series: [{ type: 'scatter', data: [[1, 2], [5, 7], [9, 3]] }] }, '#f4f7fd', 3],
  ['horizontal bars: category bands up y, value bands along x', { xAxis: { type: 'value', splitArea: { show: true } }, yAxis: { type: 'category', data: ['a', 'b', 'c'], splitArea: { show: true, areaStyle: { color: ['#eeeeee', '#dddddd'] } } }, series: [{ type: 'bar', data: [3, 5, 2] }] }, '#f4f7fd', 3],
  ['horizontal bars: the value axis minor lines and ticks', { xAxis: { type: 'value', minorTick: { show: true }, minorSplitLine: { show: true } }, yAxis: { type: 'category', data: ['a', 'b', 'c'] }, series: [{ type: 'bar', data: [3, 5, 2] }] }, '#f4f7fd', 3],
]

describe('ECharts differential: split areas and minor lines', () => {
  for (const [name, option, minorColor, tickLen] of DECOR_CASES) {
    it(name, () => {
      const e = echartsDecor(option, minorColor, tickLen)
      const u = ourDecor(option, minorColor, tickLen)
      const sortN = (a: number[]): number[] => [...a].sort((p, q) => p - q)
      expect(u.bands.length).toBe(e.bands.length)
      // In paint order: overlapping translucent bands blend by it, so the order is part of the fact.
      const eb = e.bands
      const ub = u.bands
      ub.forEach((b, k) => {
        const o = eb[k]!
        for (const f of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(b[f] - o[f]), `band ${k}.${f}`).toBeLessThan(1)
        expect(b.fill.replace(/\s/g, '').toLowerCase()).toBe(o.fill.replace(/\s/g, '').toLowerCase())
      })
      for (const [ours, theirs] of [[u.minorH, e.minorH], [u.minorV, e.minorV], [u.minorTicks, e.minorTicks]] as const) {
        expect(ours.length).toBe(theirs.length)
        sortN(ours).forEach((p, k) => expect(Math.abs(p - sortN(theirs)[k]!)).toBeLessThan(1))
      }
    })
  }
})

/**
 * Multi-line series labels: ECharts lays the lines one font-size apart (its
 * default line height) about the label's anchor, and `rotate` turns the whole
 * block about that anchor. Compared on each line's visual centre.
 */
interface LineCentre { text: string; x: number; y: number }
function echartsLineCentres(option: object, texts: string[]): LineCentre[] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return [...svg.matchAll(/<text([^>]*)>([^<]+)<\/text>/g)]
    .filter((m) => texts.includes(m[2]!))
    .map((m) => {
      const attrs = m[1]!
      const yAttr = / y="(-?[\d.]+)"/.exec(attrs)
      const ly = yAttr === null ? 0 : Number(yAttr[1])
      const tr = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(attrs)
      if (tr !== null) return { text: m[2]!, x: Number(tr[1]), y: Number(tr[2]) + ly }
      const mx = /matrix\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/.exec(attrs)!
      const [c, d, e, f] = [Number(mx[3]), Number(mx[4]), Number(mx[5]), Number(mx[6])]
      return { text: m[2]!, x: e + c * ly, y: f + d * ly }
    })
}
function ourLineCentres(option: object, texts: string[]): LineCentre[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  return renderChart(c.spec, m).flatMap((d) => {
    if (d.kind !== 'text' || !texts.includes(d.text)) return []
    const w = m(d.text, d.size)
    const hx = d.align === 'start' ? w / 2 : d.align === 'end' ? -w / 2 : 0
    const hy = d.baseline === 'top' ? d.size / 2 : d.baseline === 'bottom' ? -d.size / 2 : 0
    const r = ((d.rotate ?? 0) * Math.PI) / 180
    return [{ text: d.text, x: d.at.x + Math.cos(r) * hx - Math.sin(r) * hy, y: d.at.y + Math.sin(r) * hx + Math.cos(r) * hy }]
  })
}
const twoLine = (label: object): object => ({
  xAxis: { type: 'category', data: ['a', 'b'] },
  yAxis: {},
  // Values no axis tick shares, so a tick label cannot be mistaken for one.
  series: [{ type: 'bar', data: [3, 9], label: { show: true, formatter: '{c}\nkg', ...label } }],
})
const LINE_CASES: [string, object][] = [
  ['above the bar', twoLine({ position: 'top' })],
  ['inside the bar', twoLine({ position: 'inside' })],
  ['rotated 90 about the anchor', twoLine({ position: 'top', rotate: 90 })],
  ['rotated 30', twoLine({ position: 'top', rotate: 30 })],
]

describe('ECharts differential: multi-line labels', () => {
  for (const [name, option] of LINE_CASES) {
    it(name, () => {
      const texts = ['3', '9', 'kg']
      const e = echartsLineCentres(option, texts)
      const u = ourLineCentres(option, texts)
      expect(e.length).toBe(4)
      expect(u.map((f) => f.text)).toEqual(e.map((f) => f.text))
      u.forEach((f, k) => {
        expect(Math.abs(f.x - e[k]!.x), `${f.text} x`).toBeLessThan(0.6)
        expect(Math.abs(f.y - e[k]!.y), `${f.text} y`).toBeLessThan(0.6)
      })
    })
  }
})

/**
 * Horizontal bars — a category y axis over a value x axis. Compared on each
 * bar's absolute rect (ECharts' `M x y l w 0 l 0 h` path, rounded to a tenth)
 * and on where the category and value labels sit.
 */
interface HBarFacts { bars: { key: string; x: number; y: number; w: number; h: number }[]; labels: { text: string; x: number; y: number }[] }
function echartsHBars(option: object, texts: string[]): HBarFacts {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const bars = [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)l(-?[\d.]+) 0l0 (-?[\d.]+)[^"]*"[^>]*ecmeta_series_index="(\d+)" ecmeta_data_index="(\d+)"/g)].map((m) => {
    const x = Number(m[1]), y = Number(m[2]), w = Number(m[3]), h = Number(m[4])
    return { key: `${m[5]}/${m[6]}`, x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) }
  }).sort((a, b) => (a.key < b.key ? -1 : 1))
  const labels = [...svg.matchAll(/<text([^>]*)>([^<]+)<\/text>/g)].filter((m) => texts.includes(m[2]!)).map((m) => {
    const t = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(m[1]!)!
    const dy = / y="(-?[\d.]+)"/.exec(m[1]!)
    return { text: m[2]!, x: Number(t[1]), y: Number(t[2]) + (dy === null ? 0 : Number(dy[1])) }
  })
  return { bars, labels }
}
function ourHBars(option: object, texts: string[]): HBarFacts {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  const cmds = renderChart(c.spec, m)
  // Each series' bars, index-aligned with its data, from the geometry the paint uses.
  const bars: HBarFacts['bars'] = []
  c.spec.series.forEach((_, si) => {
    barsFor(c.spec, si, m).forEach((r, i) => { if (r.w > 0 && r.h > 0) bars.push({ key: `${si}/${i}`, x: r.x, y: r.y, w: r.w, h: r.h }) })
  })
  bars.sort((a, b) => (a.key < b.key ? -1 : 1))
  const labels = cmds.flatMap((d) => {
    if (d.kind !== 'text' || !texts.includes(d.text)) return []
    // A label's visual centre line, as ECharts writes it (central baseline).
    const y = d.baseline === 'top' ? d.at.y + d.size / 2 : d.baseline === 'bottom' ? d.at.y - d.size / 2 : d.at.y
    return [{ text: d.text, x: d.at.x, y }]
  })
  return { bars, labels }
}
const hbar = (series: object[], xAxis: object = {}): object => ({
  xAxis: { type: 'value', ...xAxis },
  yAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
  series,
})
const HBAR_CASES: [string, object][] = [
  ['one series', hbar([{ type: 'bar', data: [120, 200, 150] }])],
  ['two grouped series', hbar([{ type: 'bar', data: [120, 200, 150] }, { type: 'bar', data: [80, 70, 110] }])],
  ['a stack', hbar([{ type: 'bar', stack: 's', data: [120, 200, 150] }, { type: 'bar', stack: 's', data: [80, 70, 110] }])],
  ['a pinned value axis', hbar([{ type: 'bar', data: [120, 200, 150] }], { max: 400 })],
]

describe('ECharts differential: horizontal bars', () => {
  for (const [name, option] of HBAR_CASES) {
    it(name, () => {
      const texts = ['Mon', 'Tue', 'Wed', '0', '50', '100', '150', '200', '250', '300', '350', '400']
      const e = echartsHBars(option, texts)
      const u = ourHBars(option, texts)
      expect(e.bars.length).toBeGreaterThan(0)
      expect(u.bars.map((b) => b.key)).toEqual(e.bars.map((b) => b.key))
      u.bars.forEach((b, k) => {
        for (const f of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(b[f] - e.bars[k]![f]), `bar ${b.key}.${f}`).toBeLessThan(0.6)
      })
      const sortL = (l: HBarFacts['labels']) => [...l].sort((a, b) => a.text.localeCompare(b.text))
      expect(sortL(u.labels).map((l) => l.text)).toEqual(sortL(e.labels).map((l) => l.text))
      sortL(u.labels).forEach((l, k) => {
        expect(Math.abs(l.x - sortL(e.labels)[k]!.x), `${l.text} x`).toBeLessThan(1)
        expect(Math.abs(l.y - sortL(e.labels)[k]!.y), `${l.text} y`).toBeLessThan(1)
      })
    })
  }
})

// ---- bar rects: stacking (dataStack), barMinHeight, showBackground ----

interface RectFact { key: string; x: number; y: number; w: number; h: number }
/** Every bar rect and background strip ECharts draws, as positive-size rects. */
function echartsBarRects(option: object): { bars: RectFact[]; backgrounds: { x: number; y: number; w: number; h: number; fill: string }[] } {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const svg = chart.renderToSVGString()
  chart.dispose()
  const bars: RectFact[] = []
  const backgrounds: { x: number; y: number; w: number; h: number; fill: string }[] = []
  for (const m of svg.matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+)l(-?[\d.]+) 0l0 (-?[\d.]+)[^"]*"([^>]*)>/g)) {
    const x = Number(m[1]), y = Number(m[2]), w = Number(m[3]), h = Number(m[4])
    const r = { x: w < 0 ? x + w : x, y: h < 0 ? y + h : y, w: Math.abs(w), h: Math.abs(h) }
    const id = /ecmeta_series_index="(\d+)" ecmeta_data_index="(\d+)"/.exec(m[5]!)
    if (id !== null) bars.push({ key: `${id[1]}/${id[2]}`, ...r })
    else {
      const fill = /fill="([^"]+)"/.exec(m[5]!)?.[1] ?? ''
      const op = /fill-opacity="([^"]+)"/.exec(m[5]!)?.[1]
      backgrounds.push({ ...r, fill: op === undefined ? fill : `${fill}@${op}` })
    }
  }
  return { bars: bars.sort((a, b) => (a.key < b.key ? -1 : 1)), backgrounds }
}
function ourBarRects(option: object): { bars: RectFact[]; backgrounds: { x: number; y: number; w: number; h: number; fill: string }[] } {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string) => t.length * 7
  const bars: RectFact[] = []
  c.spec.series.forEach((s, k) => {
    if (s.kind === 'bars' || s.kind === 'grouped' || s.kind === 'stacked') barsFor(c.spec, k, m).forEach((r, d) => { if (r.w >= 0) bars.push({ key: `${k}/${d}`, x: r.x, y: r.y, w: r.w, h: r.h }) })
  })
  // Background strips are the full-plot rects drawn in a background colour.
  const bgColors = new Set(c.spec.series.map((s) => s.barBackground ?? '').filter((x) => x !== ''))
  const backgrounds = renderChart(c.spec, m).flatMap((d) => (d.kind === 'rect' && bgColors.has(d.fill) ? [{ x: d.rect.x, y: d.rect.y, w: d.rect.w, h: d.rect.h, fill: d.fill }] : []))
  return { bars: bars.sort((a, b) => (a.key < b.key ? -1 : 1)), backgrounds }
}
/** `rgba(r, g, b, a)` → `rgb(r,g,b)@a`, the way ECharts' SVG splits a translucent fill. */
const rgbaToSvg = (c: string): string => {
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(c.replace(/\s/g, ''))
  return m === null ? c : `rgb(${m[1]},${m[2]},${m[3]})@${Number(m[4])}`
}
/** `#rrggbb@a` → `rgb(r,g,b)@a`: ECharts writes a hex fill and its opacity apart. */
const hexToRgb = (c: string): string => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(@.*)?$/i.exec(c)
  return m === null ? c : `rgb(${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)})${m[4] ?? ''}`
}
const cat3 = { xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { type: 'value' } }
const hcat3 = { yAxis: { type: 'category', data: ['a', 'b', 'c'] }, xAxis: { type: 'value' } }
const sbar = (data: number[], extra: object = {}): object => ({ type: 'bar', data, ...extra })
const BAR_RECT_CASES: [string, object][] = [
  ['a mixed-sign stack diverges from zero (samesign)', { ...cat3, series: [sbar([3, -2, 1], { stack: 's' }), sbar([-1, 2, 2], { stack: 's' })] }],
  ['three-series mixed-sign stack', { ...cat3, series: [sbar([3, -2, 1], { stack: 's' }), sbar([-1, 2, -2], { stack: 's' }), sbar([2, -1, 3], { stack: 's' })] }],
  ['an all-negative stack', { ...cat3, series: [sbar([-3, -2, -1], { stack: 's' }), sbar([-1, -2, -2], { stack: 's' })] }],
  ['stackStrategy all', { ...cat3, series: [sbar([3, -2, 1], { stack: 's', stackStrategy: 'all' }), sbar([-1, 2, 2], { stack: 's', stackStrategy: 'all' })] }],
  ['stackStrategy positive', { ...cat3, series: [sbar([3, -2, 1], { stack: 's', stackStrategy: 'positive' }), sbar([-1, 2, 2], { stack: 's', stackStrategy: 'positive' })] }],
  ['stackStrategy negative', { ...cat3, series: [sbar([-3, 2, -1], { stack: 's', stackStrategy: 'negative' }), sbar([1, -2, -2], { stack: 's', stackStrategy: 'negative' })] }],
  ['stackOrder seriesDesc', { ...cat3, series: [sbar([3, 2, 1], { stack: 's', stackOrder: 'seriesDesc' }), sbar([1, 2, 2], { stack: 's' })] }],
  ['two stack groups', { ...cat3, series: [sbar([3, 2, 1], { stack: 'a' }), sbar([1, 2, 2], { stack: 'a' }), sbar([2, 2, 2], { stack: 'b' })] }],
  ['a stack with a gap', { ...cat3, series: [sbar([3, Number.NaN, 1], { stack: 's' }), sbar([1, 2, 2], { stack: 's' })] }],
  ['a horizontal mixed-sign stack', { ...hcat3, series: [sbar([3, -2, 1], { stack: 's' }), sbar([-1, 2, 2], { stack: 's' })] }],
  ['barMinHeight lifts small and zero bars', { ...cat3, series: [sbar([100, 1, 0], { barMinHeight: 30 })] }],
  ['barMinHeight on a negative bar', { ...cat3, series: [sbar([100, -1, 50], { barMinHeight: 30 })] }],
  ['barMinHeight, horizontal', { ...hcat3, series: [sbar([100, 1, 0], { barMinHeight: 30 })] }],
  ['barMinHeight on a stacked segment', { ...cat3, series: [sbar([100, 80, 60], { stack: 's' }), sbar([1, 0, 50], { stack: 's', barMinHeight: 20 })] }],
  ['showBackground', { ...cat3, series: [sbar([3, 1, 2], { showBackground: true })] }],
  ['showBackground, horizontal', { ...hcat3, series: [sbar([3, 1, 2], { showBackground: true })] }],
  ['showBackground with a colour and opacity', { ...cat3, series: [sbar([3, 1, 2], { showBackground: true, backgroundStyle: { color: '#123456', opacity: 0.5 } })] }],
  ['showBackground on grouped bars', { ...cat3, series: [sbar([3, 1, 2], { showBackground: true }), sbar([1, 2, 3])] }],
]

describe('ECharts differential: bar rects (stacking, barMinHeight, showBackground)', () => {
  for (const [name, option] of BAR_RECT_CASES) {
    it(name, () => {
      const e = echartsBarRects(option)
      const u = ourBarRects(option)
      expect(e.bars.length).toBeGreaterThan(0)
      expect(u.bars.map((b) => b.key)).toEqual(e.bars.map((b) => b.key))
      u.bars.forEach((b, k) => {
        for (const f of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(b[f] - e.bars[k]![f]), `bar ${b.key}.${f}`).toBeLessThan(0.6)
      })
      const byXY = <T extends { x: number; y: number }>(l: T[]) => [...l].sort((a, b) => a.x - b.x || a.y - b.y)
      expect(u.backgrounds.length, 'background strips').toBe(e.backgrounds.length)
      byXY(u.backgrounds).forEach((g, k) => {
        const eg = byXY(e.backgrounds)[k]!
        for (const f of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(g[f] - eg[f]), `background ${k}.${f}`).toBeLessThan(0.6)
        expect(rgbaToSvg(g.fill).replace(/@1$/, '')).toBe(hexToRgb(eg.fill.replace(/\s/g, '')))
      })
    })
  }
})

/** ECharts' stacked values, read from its own data model: the stack result dimension. */
function echartsStackValues(option: object): number[][] {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H })
  chart.setOption({ animation: false, ...option })
  const model = (chart as unknown as { getModel(): { getSeriesCount(): number; getSeriesByIndex(i: number): { getData(): { count(): number; getCalculationInfo(k: string): string; get(dim: string, i: number): number; mapDimension(d: string): string } } } }).getModel()
  const out: number[][] = []
  for (let k = 0; k < model.getSeriesCount(); k++) {
    const data = model.getSeriesByIndex(k).getData()
    const dim = data.getCalculationInfo('stackResultDimension') ?? data.mapDimension('y')
    const row: number[] = []
    for (let i = 0; i < data.count(); i++) row.push(data.get(dim, i))
    out.push(row)
  }
  chart.dispose()
  return out
}
const sline = (data: number[], extra: object = {}): object => ({ type: 'line', data, ...extra })
const LINE_STACK_CASES: [string, object][] = [
  ['stacked lines, mixed signs (samesign)', { ...cat3, series: [sline([3, -2, 1], { stack: 's' }), sline([-1, 2, 2], { stack: 's' }), sline([2, 1, -3], { stack: 's' })] }],
  ['stacked lines, stackStrategy all', { ...cat3, series: [sline([3, -2, 1], { stack: 's', stackStrategy: 'all' }), sline([-1, 2, 2], { stack: 's', stackStrategy: 'all' })] }],
  ['stacked lines, seriesDesc', { ...cat3, series: [sline([3, 2, 1], { stack: 's', stackOrder: 'seriesDesc' }), sline([1, 2, 2], { stack: 's' })] }],
  ['stacked lines with a gap', { ...cat3, series: [sline([3, Number.NaN, 1], { stack: 's' }), sline([1, 2, 2], { stack: 's' })] }],
]

describe('ECharts differential: stacked line values (dataStack)', () => {
  for (const [name, option] of LINE_STACK_CASES) {
    it(name, () => {
      const e = echartsStackValues(option)
      const u = compileOption(option as EChartsOption, { width: W, height: H }).spec.series.map((s) => s.values)
      expect(u.length).toBe(e.length)
      u.forEach((row, k) => row.forEach((v, i) => {
        const ev = e[k]![i]!
        if (Number.isNaN(ev)) expect(Number.isNaN(v), `series ${k}[${i}] is a gap`).toBe(true)
        else expect(v, `series ${k}[${i}]`).toBeCloseTo(ev, 9)
      }))
    })
  }
})
