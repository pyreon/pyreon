import { describe, expect, it } from 'vitest'
import { bars, line, resolveMarks, stackedBars } from './marks'
import {
  defaultTheme,
  hasRightAxis,
  layoutChart,
  renderChart,
  resolveY2Domain,
  resolveYDomain,
  seriesOnRightAxis,
} from './render'
import type { ChartSpec, Series } from './render'
import { chartToSvg } from './svg-chart'
import type { DrawCmd, Double } from './types'

// Deterministic measurement: 7px per char — gutters become exactly computable.
const measure = (text: string, _size: Double): Double => text.length * 7.0

const S = (over: Partial<Series>): Series => ({
  kind: 'line',
  values: [0.0, 10.0],
  color: '#111111',
  width: 2.0,
  radius: 3.0,
  label: 's',
  ...over,
})

const spec = (series: Series[], over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400.0,
  height: 200.0,
  series,
  categories: [],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: false,
  ...over,
})

const texts = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'text')
const polys = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'polyline')

describe('dual y axes — domains', () => {
  it('marks carry axis through resolveMarks', () => {
    const s = resolveMarks([1, 2], [bars((d: number) => d), line((d: number) => d, { axis: 'right' })])
    expect(s[0]!.axis).toBeUndefined()
    expect(s[1]!.axis).toBe('right')
  })

  it('left domain excludes right-axis series; right domain derives from them', () => {
    const sp = spec([
      S({ kind: 'bars', values: [0.0, 100.0] }),
      S({ axis: 'right', values: [0.0, 0.5] }),
    ])
    expect(hasRightAxis(sp)).toBe(true)
    expect(resolveYDomain(sp).max).toBeGreaterThanOrEqual(100.0)
    expect(resolveYDomain(sp).max).toBeLessThan(1000.0)
    expect(resolveY2Domain(sp).max).toBeLessThanOrEqual(1.0)
  })

  it('spec.y2Domain pins the right domain', () => {
    const sp = spec(
      [S({}), S({ axis: 'right' })],
      { y2Domain: { min: 0.0, max: 42.0 } },
    )
    expect(resolveY2Domain(sp)).toEqual({ min: 0.0, max: 42.0 })
  })

  it('stacked/grouped pin to LEFT even when marked right (one stack, one scale)', () => {
    const sp = spec([
      S({ kind: 'stacked', axis: 'right', values: [5.0, 5.0] }),
      S({ kind: 'grouped', axis: 'right', values: [3.0, 3.0] }),
      S({}),
    ])
    expect(hasRightAxis(sp)).toBe(false)
    expect(seriesOnRightAxis(sp.series[0]!, sp)).toBe(false)
    expect(seriesOnRightAxis(sp.series[1]!, sp)).toBe(false)
  })

  it('horizontal frames have a single value axis — right is ignored', () => {
    const sp = spec([S({ kind: 'bars' }), S({ kind: 'bars', axis: 'right' })], { horizontal: true })
    expect(hasRightAxis(sp)).toBe(false)
  })

  it('when EVERY series is right, they fall back to left (a chart, not an orphan axis)', () => {
    const sp = spec([S({ axis: 'right' }), S({ axis: 'right' })])
    expect(hasRightAxis(sp)).toBe(false)
    expect(resolveYDomain(sp).max).toBeGreaterThan(0.0)
  })
})

describe('dual y axes — layout', () => {
  it('the right gutter is MEASURED from y2 labels, not the slim default', () => {
    const single = layoutChart(spec([S({})]), measure)
    const dual = layoutChart(
      spec([S({}), S({ axis: 'right', values: [0.0, 1000000.0] })]),
      measure,
    )
    // Single-axis keeps the 12px pad; dual must reserve label + gap + tick room.
    expect(single.plot.x + single.plot.w).toBe(400.0 - 12.0)
    expect(dual.plot.w).toBeLessThan(single.plot.w)
    expect(dual.y2Ticks.length).toBeGreaterThan(0)
    expect(single.y2Ticks).toEqual([])
  })
})

describe('dual y axes — render', () => {
  it('each series scales against ITS axis (the load-bearing line)', () => {
    // Left series peaks at 100, right series peaks at 1.0. If both scaled on
    // the left domain the right line would hug the x axis; on its own domain
    // its top point reaches the plot top exactly like the left one does.
    const sp = spec(
      [
        S({ values: [0.0, 100.0] }),
        S({ axis: 'right', values: [0.0, 1.0] }),
      ],
      { yDomain: { min: 0.0, max: 100.0 }, y2Domain: { min: 0.0, max: 1.0 } },
    )
    const cmds = renderChart(sp, measure)
    const [leftLine, rightLine] = polys(cmds)
    expect(leftLine).toBeDefined()
    expect(rightLine).toBeDefined()
    const leftTop = Math.min(...leftLine!.points.map((p) => p.y))
    const rightTop = Math.min(...rightLine!.points.map((p) => p.y))
    expect(rightTop).toBeCloseTo(leftTop, 5)
  })

  it('draws the right axis line and right-side tick labels (align start)', () => {
    const sp = spec([S({}), S({ axis: 'right', values: [0.0, 8.0] })])
    const cmds = renderChart(sp, measure)
    const l = layoutChart(sp, measure)
    const rightEdge = l.plot.x + l.plot.w
    const axisLines = cmds.filter(
      (c) => c.kind === 'line' && c.from.x === rightEdge && c.to.x === rightEdge,
    )
    expect(axisLines.length).toBeGreaterThan(0)
    const rightLabels = texts(cmds).filter((c) => c.align === 'start' && c.at.x > rightEdge)
    expect(rightLabels.length).toBe(l.y2Ticks.length)
  })

  it('single-axis charts render byte-identically to before (no right artifacts)', () => {
    const sp = spec([S({}), S({ kind: 'bars', values: [1.0, 2.0] })])
    const cmds = renderChart(sp, measure)
    const l = layoutChart(sp, measure)
    const rightEdge = l.plot.x + l.plot.w
    expect(cmds.filter((c) => c.kind === 'line' && c.from.x === rightEdge && c.to.x === rightEdge)).toEqual([])
    expect(l.y2Ticks).toEqual([])
  })
})

describe('dual y axes — chartToSvg', () => {
  it('a right-axis mark formats its own axis with y2Format', () => {
    const svg = chartToSvg({
      data: [10, 20, 30],
      marks: [
        bars((d: number) => d, { label: 'Units' }),
        line((d: number) => d / 100.0, { label: 'Rate', axis: 'right' }),
      ],
      y2Domain: { min: 0.0, max: 0.5 },
      y2Format: (v: number) => `${(v * 100).toFixed(0)}%`,
      title: 'Dual',
    })
    expect(svg).toContain('50%')
    expect(svg).toContain('<svg')
  })

  it('stacked marks with axis right keep the joint left layout in SVG too', () => {
    const svg = chartToSvg({
      data: [1, 2],
      marks: [stackedBars((d: number) => d, { axis: 'right' }), stackedBars((d: number) => d)],
    })
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('NaN')
  })
})
