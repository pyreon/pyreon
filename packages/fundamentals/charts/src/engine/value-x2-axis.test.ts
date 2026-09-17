// A second VALUE x axis: a series opts in with `onX2` and its own positions,
// and the axis takes its domain from those positions unless one is pinned.
// Asserted through the exported predicates and the draw list — including a
// marker on such a series, which must be placed on the SECOND axis's scale.
import { describe, expect, it } from 'vitest'
import { defaultTheme, hasX2Axis, renderChart, resolveX2Domain, seriesOnX2 } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const line = (over: Partial<Series> = {}): Series => ({ kind: 'line', values: [1, 2, 3], color: '#000', width: 1, radius: 3, label: 'S', ...over })
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400,
  height: 300,
  series: [line({ xs: [0, 1, 2] })],
  categories: [],
  xValues: [0, 1, 2],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...over,
})
const onX2 = line({ onX2: true, xs: [100, 150, 300] })

describe('which series sit on the second x axis', () => {
  it('needs the opt-in AND positions, and never on a horizontal chart', () => {
    expect(seriesOnX2(onX2, spec())).toBe(true)
    expect(seriesOnX2(line({ onX2: true }), spec())).toBe(false)
    expect(seriesOnX2(line({ xs: [1, 2] }), spec())).toBe(false)
    expect(seriesOnX2(onX2, spec({ horizontal: true }))).toBe(false)
  })

  it('hasX2Axis is true exactly when some series is on it', () => {
    expect(hasX2Axis(spec({ series: [line(), onX2] }))).toBe(true)
    expect(hasX2Axis(spec())).toBe(false)
  })
})

describe('the second axis domain', () => {
  it('is the extent of its series positions when nothing is pinned', () => {
    expect(resolveX2Domain(spec({ series: [line(), onX2] }))).toEqual({ min: 100, max: 300 })
  })

  it('a pinned domain wins over the positions', () => {
    expect(resolveX2Domain(spec({ series: [onX2], x2Domain: { min: 0, max: 1000 } }))).toEqual({ min: 0, max: 1000 })
  })

  it('with no series on it, falls back to the unit range rather than an empty extent', () => {
    expect(resolveX2Domain(spec())).toEqual({ min: 0, max: 1 })
  })
})

describe('drawing it', () => {
  const texts = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text')

  it('its tick labels sit on the opposite edge, and follow when the first x axis goes on top', () => {
    const ys = (xTop: boolean) =>
      texts(renderChart(spec({ series: [line({ xs: [0, 1, 2] }), onX2], x2Domain: { min: 100, max: 300 }, xTop }), measure))
        .filter((t) => t.text === '300')
        .map((t) => t.at.y)
    const bottomFirst = ys(false)
    const topFirst = ys(true)
    expect(bottomFirst.length).toBeGreaterThan(0)
    expect(topFirst.length).toBeGreaterThan(0)
    expect(Math.max(...topFirst)).toBeGreaterThan(Math.min(...bottomFirst))
  })

  it('a marker on a second-axis series is placed on the SECOND axis scale', () => {
    const withMarker = (s: Series) =>
      renderChart(spec({ series: [line({ xs: [0, 1, 2] }), s], x2Domain: { min: 100, max: 300 }, markers: [{ seriesIndex: 1, atIndex: 1, label: 'M' }] }), measure)
    const onSecond = texts(withMarker(onX2)).find((t) => t.text === 'M')
    const onFirst = texts(withMarker(line({ xs: [100, 150, 300] }))).find((t) => t.text === 'M')
    expect(onSecond).toBeDefined()
    expect(onFirst).toBeDefined()
    expect(onSecond!.at.x).not.toBeCloseTo(onFirst!.at.x, 3)
  })
})
