import { describe, expect, it } from 'vitest'
import { line } from './marks'
import { barsFor, defaultTheme, renderChart } from './render'
import type { ChartSpec, PointMarker, Series } from './render'
import { chartToSvg } from './svg-chart'
import type { DrawCmd, Double } from './types'

const measure = (text: string, _s: Double): Double => text.length * 7.0

const S = (over: Partial<Series>): Series => ({
  kind: 'line',
  values: [3.0, 9.0, 1.0, 6.0],
  color: '#123456',
  width: 2.0,
  radius: 3.0,
  label: 's',
  ...over,
})

const spec = (series: Series[], markers: PointMarker[], over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400.0,
  height: 200.0,
  series,
  categories: [],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: false,
  markers,
  ...over,
})

const circles = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'circle')
const texts = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'text')

// A line series draws no circles of its own, so every circle IS a marker.
describe('point markers (markPoint)', () => {
  it('anchors at max and min, labelled above the point in the series colour', () => {
    const cmds = renderChart(spec([S({})], [
      { at: 'max', label: 'peak' },
      { at: 'min', label: 'low' },
    ]), measure)
    const cs = circles(cmds)
    expect(cs).toHaveLength(2)
    // The markers sit EXACTLY on the line's peak and trough — not merely in
    // the right order, which a wrong argmax (index 0, value 3) also satisfies.
    const linePts = cmds.filter((c) => c.kind === 'polyline')[0]!.points
    const ys = linePts.map((p) => p.y)
    expect(cs[0]!.center.y).toBeCloseTo(Math.min(...ys), 9)
    expect(cs[1]!.center.y).toBeCloseTo(Math.max(...ys), 9)
    expect(cs[0]!.center.x).toBeCloseTo(linePts[1]!.x, 9)
    expect(cs[0]!.fill).toBe('#123456')
    const labels = texts(cmds).filter((c) => c.text === 'peak' || c.text === 'low')
    expect(labels).toHaveLength(2)
    expect(labels[0]!.at.y).toBeLessThan(cs[0]!.center.y)
  })

  it('atIndex anchors a concrete datum and clamps out-of-range values', () => {
    const inRange = circles(renderChart(spec([S({})], [{ atIndex: 3.0 }]), measure))
    const clamped = circles(renderChart(spec([S({})], [{ atIndex: 99.0 }]), measure))
    expect(inRange).toHaveLength(1)
    expect(clamped).toHaveLength(1)
    expect(clamped[0]!.center.x).toBeCloseTo(inRange[0]!.center.x, 9)
  })

  it('a marker with neither anchor is SKIPPED, not guessed at', () => {
    expect(circles(renderChart(spec([S({})], [{ label: 'orphan' }]), measure))).toHaveLength(0)
  })

  it('explicit color and radius win over the series defaults', () => {
    const cs = circles(renderChart(spec([S({})], [{ at: 'max', color: '#ff0000', radius: 7.0 }]), measure))
    expect(cs[0]!.fill).toBe('#ff0000')
    expect(cs[0]!.radius).toBe(7.0)
  })

  it('a right-axis series marks against ITS domain', () => {
    const sp = spec(
      [S({ values: [0.0, 100.0] }), S({ axis: 'right', values: [0.0, 1.0] })],
      [{ seriesIndex: 1.0, at: 'max' }],
      { yDomain: { min: 0.0, max: 100.0 }, y2Domain: { min: 0.0, max: 1.0 } },
    )
    const cmds = renderChart(sp, measure)
    const marker = circles(cmds)[0]!
    // On the RIGHT domain, value 1.0 = the plot top; on the left domain it
    // would hug the x axis. Compare against the left line's own top point.
    const leftLine = cmds.filter((c) => c.kind === 'polyline')[0]!
    const leftTop = Math.min(...leftLine.points.map((p) => p.y))
    expect(marker.center.y).toBeCloseTo(leftTop, 5)
  })

  it('stacked/grouped and horizontal frames skip markers (joint layouts)', () => {
    const stacked = renderChart(spec([S({ kind: 'stacked' })], [{ at: 'max' }]), measure)
    expect(circles(stacked)).toHaveLength(0)
    const horiz = renderChart(spec([S({ kind: 'bars' })], [{ at: 'max' }], { horizontal: true }), measure)
    expect(circles(horiz)).toHaveLength(0)
  })

  it('markers grow with the entrance and hold their label until settled', () => {
    const half = renderChart(spec([S({})], [{ at: 'max', label: 'p', radius: 6.0 }], { progress: 0.5 }), measure)
    expect(circles(half)[0]!.radius).toBeCloseTo(3.0, 9)
    expect(texts(half).filter((c) => c.text === 'p')).toHaveLength(0)
  })

  it('chartToSvg carries markers end to end', () => {
    const svg = chartToSvg({
      data: [3, 9, 1, 6],
      marks: [line((d: number) => d)],
      markers: [{ at: 'max', label: 'peak' }],
    })
    expect(svg).toContain('peak')
    expect(svg).toContain('<circle')
  })

  it('a points series still draws its own dots — markers add, never replace', () => {
    const cmds = renderChart(spec([S({ kind: 'points' })], [{ at: 'max', color: '#ff0000' }]), measure)
    // 4 data dots + 1 marker
    expect(circles(cmds)).toHaveLength(5)
  })
})

describe('point markers (markPoint) — edge shapes', () => {
  it('edge shapes that must not draw: a seriesIndex past the series list, an empty series', () => {
    expect(circles(renderChart(spec([S({})], [{ at: 'max', seriesIndex: 5.0 }]), measure))).toHaveLength(0)
    expect(circles(renderChart(spec([S({ values: [] })], [{ at: 'max' }]), measure))).toHaveLength(0)
  })

  it('a negative atIndex clamps to the first datum', () => {
    const first = circles(renderChart(spec([S({})], [{ atIndex: 0.0 }]), measure))
    const negative = circles(renderChart(spec([S({})], [{ atIndex: -3.0 }]), measure))
    expect(negative).toHaveLength(1)
    expect(negative[0]!.center.x).toBeCloseTo(first[0]!.center.x, 9)
  })

  it('on a value x axis the marker is placed by xValues, not by index', () => {
    const byIndex = circles(renderChart(spec([S({})], [{ at: 'max' }]), measure))
    const byValue = circles(renderChart(spec([S({})], [{ at: 'max' }], { xValues: [0.0, 1.0, 2.0, 3.0, 40.0] }), measure))
    expect(byValue).toHaveLength(1)
    expect(byValue[0]!.center.x).not.toBeCloseTo(byIndex[0]!.center.x, 3)
  })

  it('barsFor resolves a right-axis bar series against ITS domain', () => {
    const left = barsFor(spec([S({ kind: 'bars' })], []), 0, measure)
    const right = barsFor(spec([S({ kind: 'bars', axis: 'right' })], []), 0, measure)
    expect(left).toHaveLength(right.length)
    expect(right.every((r) => r.h > 0)).toBe(true)
    expect(barsFor(spec([S({})], []), 0, measure)).toEqual([])
  })
})
