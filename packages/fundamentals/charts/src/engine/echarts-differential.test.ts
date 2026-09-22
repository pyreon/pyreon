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
import { compileOption, compiledCommands } from './option'
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
interface BarLabelFact { text: string; x: number; y: number; baseline: string; fill: string; stroke: string; width: number }
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
  return [...svg.matchAll(/<text dominant-baseline="central" text-anchor="middle"([^>]*)>(-?\d+)<\/text>/g)].map((m) => {
    const attrs = m[1]!
    const t = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(attrs)!
    const dy = /\sy="(-?[\d.]+)"/.exec(attrs)
    const stroke = /stroke="([^"]+)"/.exec(attrs)
    return {
      text: m[2]!,
      x: Number(t[1]),
      y: Number(t[2]),
      baseline: dy === null ? 'middle' : Number(dy[1]) < 0 ? 'bottom' : 'top',
      fill: longHex(/fill="([^"]+)"/.exec(attrs)![1]!),
      stroke: stroke === null ? '' : longHex(rgbHex(stroke[1]!)),
      width: stroke === null ? 0 : Number(/stroke-width="([\d.]+)"/.exec(attrs)![1]),
    }
  })
}
function ourBarLabels(option: object): BarLabelFact[] {
  const c = compileOption(option as EChartsOption, { width: W, height: H })
  const m = (t: string, size: number): number => echarts.format.getTextRect(t, String(size) + 'px sans-serif').width
  return renderChart(c.spec, m).flatMap((d) =>
    d.kind === 'text' && d.align === 'middle' && /^-?\d+$/.test(d.text)
      ? [{ text: d.text, x: d.at.x, y: d.at.y, baseline: d.baseline, fill: longHex(d.fill), stroke: d.stroke === undefined ? '' : longHex(d.stroke), width: d.stroke === undefined ? 0 : (d.strokeWidth ?? 2) }]
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
      }
    })
  }
})
