// Batch-2 mechanisms: the log view, normalized stacks, the waterfall, error
// bars, axis label thinning / rotation, axis titles, binning, and the text
// rotation the executors carry for the slanted labels.

import { describe, expect, it } from 'vitest'
import { computeLayout } from './layout'
import type { LayoutConfig } from './layout'
import { barsForIn, defaultTheme, geometrySpec, layoutChart, logBounds, renderChart, renderChartIn, resolveYDomain } from './render'
import type { ChartSpec, Series } from './render'
import { layoutWaterfall, normalizeStack, waterfallExtent } from './stack'
import { binValues } from './bin'
import { logViewTicks } from './scale-extra'
import { bars, histogram, line, points, resolveMarks, waterfall } from './marks'
import { plotHitBarsIn, plotHitIndexIn } from './plot-hit'
import { svgCommand } from './svg'
import { paint } from './canvas-web'
import type { DrawCmd, Double, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (kind: Series['kind'], values: Double[], extra: Partial<Series> = {}): Series => ({
  kind, values, color: '#0f766e', width: 1.0, radius: 2.0, label: 'S', ...extra,
})
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400.0, height: 200.0, series: [series('bars', [10, 20, 30])], categories: [],
  theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...over,
})
const texts = (cmds: DrawCmd[]): (DrawCmd & { kind: 'text' })[] => cmds.filter((c): c is DrawCmd & { kind: 'text' } => c.kind === 'text')
const rects = (cmds: DrawCmd[]): (DrawCmd & { kind: 'rect' })[] => cmds.filter((c): c is DrawCmd & { kind: 'rect' } => c.kind === 'rect')

describe('log view', () => {
  it('logBounds spans the decades around the positive left-axis values, honours a positive pinned domain, and falls back to {1, 10}', () => {
    expect(logBounds(spec({ series: [series('line', [3, 40, 700])] }))).toEqual({ min: 1, max: 1000 })
    expect(logBounds(spec({ series: [series('line', [3, 40, 700])], yDomain: { min: 2, max: 2000 } }))).toEqual({ min: 2, max: 2000 })
    expect(logBounds(spec({ series: [series('line', [-1, 0, Number.NaN])] }))).toEqual({ min: 1, max: 10 })
    // A pinned domain that is not positive is ignored, not applied.
    expect(logBounds(spec({ series: [series('line', [3, 40])], yDomain: { min: 0, max: 100 } }))).toEqual({ min: 1, max: 100 })
  })
  it('geometrySpec maps values to log10(v / lo), turns non-positive values into gaps, pins the view domain, and is the identity for a linear chart', () => {
    const raw = spec({ series: [series('line', [1, 10, 100, 0, -5])], yScale: 'log' })
    const g = geometrySpec(raw)
    expect(g.series[0]!.values.slice(0, 3)).toEqual([0, 1, 2])
    expect(Number.isNaN(g.series[0]!.values[3])).toBe(true)
    expect(Number.isNaN(g.series[0]!.values[4])).toBe(true)
    expect(g.yDomain).toEqual({ min: 0, max: 2 })
    expect(resolveYDomain(g)).toEqual({ min: 0, max: 2 })
    // The raw spec is untouched — the tooltip and the table read real values.
    expect(raw.series[0]!.values).toEqual([1, 10, 100, 0, -5])
    const lin = spec()
    expect(geometrySpec(lin)).toBe(lin)
  })
  it('the axis draws the decades as REAL values while the bars lay out through the view — a 1..1000 chart labels 1, 10, 100, 1000', () => {
    const cmds = renderChart(spec({ series: [series('bars', [1, 10, 100, 1000])], yScale: 'log' }), measure)
    const labels = texts(cmds).map((t) => t.text)
    expect(labels).toEqual(expect.arrayContaining(['1', '10', '100', '1000']))
    // Bars grow from the axis floor: the 1 bar sits ON the floor (zero height), each next one a decade taller.
    const rs = rects(cmds)
    expect(rs).toHaveLength(4)
    const hs = rs.map((r) => r.rect.h)
    expect(hs[0]).toBe(0)
    expect(hs[1]).toBeGreaterThan(0)
    expect(hs[2]! - hs[1]!).toBeCloseTo(hs[1]!, 6)
    expect(hs[3]! - hs[2]!).toBeCloseTo(hs[1]!, 6)
  })
  it('value labels print the REAL value, hits report the row, and an annotation follows the view', () => {
    const raw = spec({ series: [series('bars', [1, 100], { showValues: true })], yScale: 'log', annotations: [{ y: 10, label: 'ten' }] })
    const l = layoutChart(raw, measure)
    const cmds = renderChartIn(raw, measure, l)
    expect(texts(cmds).map((t) => t.text)).toEqual(expect.arrayContaining(['100', 'ten']))
    const ten = cmds.find((c) => c.kind === 'line' && c.dash !== undefined && c.from.x === l.plot.x) as DrawCmd & { kind: 'line' }
    // 10 sits halfway between the 1 floor and the 100 ceiling in the log view.
    expect(ten.from.y).toBeCloseTo(l.plot.y + l.plot.h / 2, 6)
    const bar = barsForIn(raw, 0, l.plot)[1]!
    expect(plotHitBarsIn(raw, l, bar.x + bar.w / 2, bar.y + bar.h / 2)).toBe(1)
  })
  it('logViewTicks adds the 2× and 5× minors under two decades and stays at decades above', () => {
    expect(logViewTicks(10, 80, 0, 100).map((t) => t.value)).toEqual([10, 20, 50])
    expect(logViewTicks(1, 100000, 0, 100).map((t) => t.value)).toEqual([1, 10, 100, 1000, 10000, 100000])
    expect(logViewTicks(0, 10, 0, 100)).toEqual([])
    const ts = logViewTicks(1, 100, 100, 0)
    expect(ts.map((t) => t.pos)).toEqual([100, 50, 0])
  })
  it('a right-axis series stays linear beside a log left axis', () => {
    const g = geometrySpec(spec({ series: [series('line', [1, 10]), series('line', [5, 6], { axis: 'right' })], yScale: 'log' }))
    expect(g.series[1]!.values).toEqual([5, 6])
  })
})

describe('normalized stacks', () => {
  it('normalizeStack scales every column to its positive total, keeps gaps, and zeroes an empty column', () => {
    expect(normalizeStack([[1, 2, Number.NaN, 0], [3, 2, 4, 0]])).toEqual([[0.25, 0.5, Number.NaN, 0], [0.75, 0.5, 1, 0]])
  })
  it('the chart draws shares over a {0, 1} domain labelled as percent, and the raw spec keeps its values', () => {
    const raw = spec({ series: [series('stacked', [1, 3]), series('stacked', [3, 1])], stackNormalize: true })
    const l = layoutChart(raw, measure)
    expect(resolveYDomain(geometrySpec(raw))).toEqual({ min: 0, max: 1 })
    expect(l.yTicks.map((t) => t.label)).toEqual(expect.arrayContaining(['0%', '100%']))
    const rs = rects(renderChartIn(raw, measure, l))
    // Every column fills the plot: the two segments of a column sum to the plot height.
    expect(rs[0]!.rect.h + rs[1]!.rect.h).toBeCloseTo(l.plot.h, 6)
    expect(rs[0]!.rect.h / l.plot.h).toBeCloseTo(0.25, 6)
    expect(raw.series[0]!.values).toEqual([1, 3])
  })
  it('an explicit yFormat wins over the percent default', () => {
    const l = layoutChart(spec({ series: [series('stacked', [1])], stackNormalize: true, yFormat: (v) => `v${v}` }), measure)
    expect(l.yTicks[0]!.label).toBe('v0')
  })
})

describe('waterfall', () => {
  it('layoutWaterfall floats each step from the running total, skips gaps, and waterfallExtent spans the totals with zero', () => {
    const steps = layoutWaterfall([10, -4, Number.NaN, 6], { x: 0, y: 0, w: 400, h: 100 }, { min: 0, max: 20 }, 0)
    expect(steps.map((s) => [s.datumIndex, s.start, s.end])).toEqual([[0, 0, 10], [1, 10, 6], [3, 6, 12]])
    // The fall's rect spans 6..10 → the same height a 4-unit rise would.
    expect(steps[1]!.rect.h).toBeCloseTo(steps[0]!.rect.h * 0.4, 6)
    expect(waterfallExtent([10, -4, Number.NaN, 6])).toEqual({ min: 0, max: 12 })
    expect(waterfallExtent([-3, -2])).toEqual({ min: -5, max: 0 })
    expect(waterfallExtent([])).toEqual({ min: 0, max: 1 })
  })
  it('renders a fill per step (negativeColor for a fall), a dashed connector between steps, real-value labels, and hits by row', () => {
    const raw = spec({ series: [series('waterfall', [10, -4, 6], { negativeColor: '#f00', showValues: true })] })
    const l = layoutChart(raw, measure)
    const cmds = renderChartIn(raw, measure, l)
    const rs = rects(cmds)
    expect(rs.map((r) => r.fill)).toEqual(['#0f766e', '#f00', '#0f766e'])
    expect(cmds.filter((c) => c.kind === 'line' && c.dash?.[0] === 2)).toHaveLength(2)
    expect(texts(cmds).map((t) => t.text)).toEqual(expect.arrayContaining(['10', '-4', '6']))
    // The domain reaches the highest running total (12), so the last step tops out there.
    expect(resolveYDomain(raw).max).toBeGreaterThanOrEqual(12)
    const mid = rs[1]!.rect
    expect(plotHitBarsIn(raw, l, mid.x + mid.w / 2, mid.y + mid.h / 2)).toBe(1)
    expect(plotHitIndexIn(raw, l, 1, 1)).toBe(-1)
    // A gap's slot is an empty rect nothing can land in — and (0,0) is not inside it.
    const withGap = spec({ series: [series('waterfall', [10, Number.NaN, 6])] })
    expect(barsForIn(withGap, 0, l.plot)[1]!.w).toBeLessThan(0)
    expect(plotHitBarsIn(withGap, layoutChart(withGap, measure), 0, 0)).toBe(-1)
  })
  it('the entrance grows each step from its START level', () => {
    const raw = spec({ series: [series('waterfall', [10, -4])], progress: 0.5 })
    const l = layoutChart(raw, measure)
    const full = rects(renderChartIn({ ...raw, progress: 1 }, measure, l))
    const half = rects(renderChartIn(raw, measure, l))
    expect(half[0]!.rect.h).toBeCloseTo(full[0]!.rect.h / 2, 6)
    expect(half[0]!.rect.y + half[0]!.rect.h).toBeCloseTo(full[0]!.rect.y + full[0]!.rect.h, 6)
    // The fall hangs from its start (the top of the rise) and grows downward.
    expect(half[1]!.rect.y).toBeCloseTo(full[1]!.rect.y, 6)
    expect(half[1]!.rect.h).toBeCloseTo(full[1]!.rect.h / 2, 6)
  })
  it('the waterfall mark resolves to the series kind with its negative colour', () => {
    const s = resolveMarks([1, -2], [waterfall<number>((d) => d, { negativeColor: '#f00', label: 'W' })])[0]!
    expect(s.kind).toBe('waterfall')
    expect(s.negativeColor).toBe('#f00')
  })
})

describe('error bars', () => {
  it('a bars mark with both bounds draws a capped whisker through each bar centre, skips a gap, and widens the domain to the bounds', () => {
    const raw = spec({ series: [series('bars', [10, 20], { errLow: [8, Number.NaN], errHigh: [14, 25] })] })
    const l = layoutChart(raw, measure)
    expect(resolveYDomain(raw).max).toBeGreaterThanOrEqual(14)
    const cmds = renderChartIn(raw, measure, l)
    const whiskers = cmds.filter((c) => c.kind === 'line' && c.stroke === defaultTheme.text)
    // One vertical + two caps for the first bar; nothing for the gapped bound.
    expect(whiskers).toHaveLength(3)
    const bar = barsForIn(raw, 0, l.plot)[0]!
    const vertical = whiskers[0] as DrawCmd & { kind: 'line' }
    expect(vertical.from.x).toBeCloseTo(bar.x + bar.w / 2, 6)
    expect(vertical.from.x).toBe(vertical.to.x)
    expect(vertical.from.y).toBeGreaterThan(vertical.to.y)
  })
  it('a points mark centres its whiskers on the placed points, and nothing draws mid-entrance', () => {
    const raw = spec({ series: [series('points', [10, 20], { errLow: [9, 19], errHigh: [11, 21] })] })
    const l = layoutChart(raw, measure)
    const whiskers = renderChartIn(raw, measure, l).filter((c) => c.kind === 'line' && c.stroke === defaultTheme.text)
    expect(whiskers).toHaveLength(6)
    expect(renderChartIn({ ...raw, progress: 0.5 }, measure, l).filter((c) => c.kind === 'line' && c.stroke === defaultTheme.text)).toHaveLength(0)
  })
  it('the mark options resolve the accessors to index-aligned bound arrays, a non-finite bound a gap', () => {
    const rows = [{ v: 10, lo: 8, hi: 12 }, { v: 20, lo: null as unknown as number, hi: 22 }]
    const s = resolveMarks(rows, [bars<(typeof rows)[number]>((d) => d.v, { errorLow: (d) => d.lo, errorHigh: (d) => d.hi })])[0]!
    expect(s.errLow![0]).toBe(8)
    expect(Number.isNaN(s.errLow![1])).toBe(true)
    expect(s.errHigh).toEqual([12, 22])
    // One bound alone is no error bar.
    expect(resolveMarks(rows, [line<(typeof rows)[number]>((d) => d.v, { errorLow: (d) => d.lo })])[0]!.errLow).toBeUndefined()
    expect(resolveMarks(rows, [points<(typeof rows)[number]>((d) => d.v)])[0]!.errHigh).toBeUndefined()
  })
})

describe('axis labels — thinning, rotation, titles', () => {
  const cfg = (over: Partial<LayoutConfig> = {}): LayoutConfig => ({
    width: 200.0, height: 120.0, xDomain: { min: 0, max: 5 }, yDomain: { min: 0, max: 10 }, categories: [],
    fontSize: 10.0, xTickCount: 5.0, yTickCount: 5.0, showXAxis: true, showYAxis: true, ...over,
  })
  it('category labels that overflow rotate -45° (auto), which deepens the bottom gutter; short ones stay upright', () => {
    const long = computeLayout(cfg({ categories: ['January sales', 'February sales', 'March sales', 'April sales', 'May sales', 'June sales'] }), measure)
    expect(long.xLabelRotate).toBe(-45)
    const short = computeLayout(cfg({ categories: ['J', 'F', 'M'] }), measure)
    expect(short.xLabelRotate).toBe(0)
    expect(short.xLabelEvery).toBe(1)
    expect(long.gutters.bottom).toBeGreaterThan(short.gutters.bottom)
    expect(long.plot.h).toBeLessThan(short.plot.h)
  })
  it('numeric labels that overflow thin to every k-th; `all` keeps them; `thin` forces it on categories; `rotate` forces the slant', () => {
    const dense = computeLayout(cfg({ width: 60.0, xDomain: { min: 0, max: 100000 } }), measure)
    expect(dense.xLabelRotate).toBe(0)
    expect(dense.xLabelEvery).toBeGreaterThan(1)
    expect(computeLayout(cfg({ width: 60.0, xDomain: { min: 0, max: 100000 }, xLabels: 'all' }), measure).xLabelEvery).toBe(1)
    const cats = ['January sales', 'February sales', 'March sales', 'April sales', 'May sales', 'June sales']
    const thinned = computeLayout(cfg({ categories: cats, xLabels: 'thin' }), measure)
    expect(thinned.xLabelRotate).toBe(0)
    expect(thinned.xLabelEvery).toBeGreaterThan(1)
    expect(computeLayout(cfg({ categories: ['J', 'F'], xLabels: 'rotate' }), measure).xLabelRotate).toBe(-45)
  })
  it('very narrow bands thin even the rotated labels, and the horizontal frame thins its category rows', () => {
    const many = Array.from({ length: 60 }, (_, i) => `category ${i}`)
    const l = computeLayout(cfg({ categories: many }), measure)
    expect(l.xLabelRotate).toBe(-45)
    expect(l.xLabelEvery).toBeGreaterThan(1)
    const h = computeLayout(cfg({ categories: many, horizontal: true }), measure)
    expect(h.yLabelEvery).toBeGreaterThan(1)
  })
  it('the render emits rotated `end`-anchored labels for the slant, every k-th label when thinned, and titles with their own rotation', () => {
    const cats = ['January sales', 'February sales', 'March sales', 'April sales', 'May sales', 'June sales']
    const raw = spec({ width: 200.0, height: 120.0, series: [series('bars', [1, 2, 3, 4, 5, 6])], categories: cats, xTitle: 'Month', yTitle: 'Sales', xLabels: 'rotate' })
    const cmds = renderChart(raw, measure)
    const slanted = texts(cmds).filter((t) => t.rotate === -45)
    expect(slanted.length).toBeGreaterThan(0)
    expect(slanted[0]!.align).toBe('end')
    const yTitle = texts(cmds).find((t) => t.text === 'Sales')!
    expect(yTitle.rotate).toBe(-90)
    const xTitle = texts(cmds).find((t) => t.text === 'Month')!
    expect(xTitle.rotate).toBeUndefined()
    expect(xTitle.at.y).toBeCloseTo(118, 6)
    const thin = spec({ width: 60.0, series: [series('line', [1, 2])], xValues: [0, 100000], xLabels: 'thin', y2Title: 'Right' })
    const thinL = layoutChart(thin, measure)
    const drawn = texts(renderChartIn(thin, measure, thinL)).filter((t) => thinL.xTicks.some((x) => x.label === t.text && x.pos === t.at.x))
    expect(drawn.length).toBeLessThan(thinL.xTicks.length)
    // No right axis → no right title.
    expect(texts(renderChartIn(thin, measure, thinL)).some((t) => t.text === 'Right')).toBe(false)
  })
  it('a y2 title draws when a right axis exists, and titles widen their gutters', () => {
    const raw = spec({ series: [series('line', [1, 2]), series('line', [5, 6], { axis: 'right' })], y2Title: 'Right', yTitle: 'Left', xTitle: 'X' })
    const l = layoutChart(raw, measure)
    const plain = layoutChart({ ...raw, y2Title: undefined, yTitle: undefined, xTitle: undefined }, measure)
    // One line each: the theme's 11px font plus the 6px label gap.
    expect(l.gutters.left - plain.gutters.left).toBeCloseTo(17, 6)
    expect(l.gutters.right - plain.gutters.right).toBeCloseTo(17, 6)
    expect(l.gutters.bottom - plain.gutters.bottom).toBeCloseTo(17, 6)
    expect(texts(renderChartIn(raw, measure, l)).find((t) => t.text === 'Right')!.rotate).toBe(90)
  })
  it('a time y axis labels with calendar steps', () => {
    const day = 86400000
    const l = layoutChart(spec({ series: [series('line', [0, day * 10])], yTime: true }), measure)
    expect(l.yTicks.every((t) => /^\d\d-\d\d$/.test(t.label))).toBe(true)
  })
})

describe('bins and the histogram', () => {
  it('binValues lands edges on nice steps, counts every finite value, clamps the extremes, and handles the degenerate lists', () => {
    const bins = binValues([1, 2, 2, 3, 9, 10, Number.NaN], 5)
    expect(bins.map((b) => [b.x0, b.x1])).toEqual([[0, 2], [2, 4], [4, 6], [6, 8], [8, 10]])
    expect(bins.map((b) => b.count)).toEqual([1, 3, 0, 0, 2])
    expect(binValues([], 5)).toEqual([])
    expect(binValues([7, 7], 4)).toEqual([{ x0: 7, x1: 8, count: 2 }])
    expect(binValues([0, 100], 0)).toHaveLength(1)
  })
  it('histogram() returns bins as data, a range label per bin, and one bars mark over the counts', () => {
    const rows = [{ age: 21 }, { age: 34 }, { age: 35 }, { age: 58 }]
    const hp = histogram(rows, (d) => d.age, { bins: 4, label: 'People' })
    expect(hp.marks).toHaveLength(1)
    expect(hp.marks[0]!.kind).toBe('bars')
    expect(hp.data.reduce((n, b) => n + b.count, 0)).toBe(4)
    expect(hp.x(hp.data[0]!)).toBe('20–30')
    expect(resolveMarks(hp.data, hp.marks)[0]!.label).toBe('People')
    expect(resolveMarks(hp.data, histogram(rows, (d) => d.age).marks)[0]!.label).toBe('Count')
  })
})

describe('text rotation crosses the executors', () => {
  const rotated: DrawCmd = { kind: 'text', text: 'Q1', at: { x: 40, y: 50 }, fill: '#000', size: 10, align: 'end', baseline: 'middle', rotate: -45 }
  it('the SVG serializer emits a transform about the anchor, and none for an upright label', () => {
    expect(svgCommand(rotated, 'sans-serif')).toContain('transform="rotate(-45 40 50)"')
    expect(svgCommand({ ...rotated, rotate: undefined }, 'sans-serif')).not.toContain('transform')
  })
  it('the canvas executor rotates about the anchor and restores the context', () => {
    const calls: string[] = []
    const ctx = new Proxy({}, {
      get: (_t, key: string) => (key === 'canvas' ? {} : (...args: unknown[]) => { calls.push(`${key}(${args.join(',')})`); return undefined }),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    paint(ctx, [rotated], 200, 100, 'sans-serif')
    expect(calls).toEqual(expect.arrayContaining(['save()', 'translate(40,50)', `rotate(${(-45 * Math.PI) / 180})`, 'fillText(Q1,0,0)', 'restore()']))
    calls.length = 0
    paint(ctx, [{ ...rotated, rotate: undefined }], 200, 100, 'sans-serif')
    expect(calls).toContain('fillText(Q1,40,50)')
    expect(calls.some((c) => c.startsWith('translate('))).toBe(false)
  })
})
