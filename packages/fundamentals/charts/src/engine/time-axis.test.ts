// A continuous x axis is a CORRECTNESS feature, not a styling one.
//
// Spacing points evenly by index says the gap between consecutive readings is
// always the same. For a time series it usually is not, and the chart then
// states something false about the data — readings on Jan 1, Jan 2 and Mar 1
// drawn at even thirds claim the first gap equals the second.

import { describe, expect, it } from 'vitest'
import { layoutSeriesPoints, layoutSeriesPointsAt } from './layout'
import { defaultTheme, layoutChart, renderChart } from './render'
import { line, resolveMarks } from './marks'
import { timeTicks } from './scale-extra'
import type { Rect } from './types'

const PLOT: Rect = { x: 0, y: 0, w: 300, h: 100 }
const Y = { min: 0, max: 10 }

const DAY = 86_400_000
const JAN1 = Date.UTC(2026, 0, 1)

interface Row {
  t: number
  v: number
}
// Jan 1, Jan 2, then a two-month jump. Even spacing would be a lie about this.
const ROWS: Row[] = [
  { t: JAN1, v: 2 },
  { t: JAN1 + DAY, v: 6 },
  { t: JAN1 + 60 * DAY, v: 4 },
]

describe('layoutSeriesPointsAt', () => {
  it('places by value, not by index', () => {
    const xs = ROWS.map((r) => r.t)
    const at = layoutSeriesPointsAt(
      ROWS.map((r) => r.v),
      xs,
      PLOT,
      Y,
      { min: xs[0]!, max: xs[2]! },
    )
    // Index placement would put the middle point at the halfway mark. Value
    // placement puts it one day into a sixty-day span — right at the start.
    const even = layoutSeriesPoints(ROWS.map((r) => r.v), PLOT, Y)
    expect(even[1]!.x).toBeCloseTo(150, 0)
    expect(at[1]!.x).toBeLessThan(20)
    expect(at[0]!.x).toBeCloseTo(0, 5)
    expect(at[2]!.x).toBeCloseTo(300, 5)
  })

  it('takes the shorter of mismatched inputs rather than reading past the end', () => {
    const pts = layoutSeriesPointsAt([1, 2, 3], [0, 1], PLOT, Y, { min: 0, max: 1 })
    expect(pts).toHaveLength(2)
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('is empty for empty inputs', () => {
    expect(layoutSeriesPointsAt([], [], PLOT, Y, { min: 0, max: 1 })).toHaveLength(0)
  })
})

describe('timeTicks', () => {
  it('labels a day of data by the hour and a year of it by the month', () => {
    const hourly = timeTicks({ min: JAN1, max: JAN1 + DAY }, 0, 300, 5)
    expect(hourly.length).toBeGreaterThan(1)
    expect(hourly.every((t) => /^\d{2}:\d{2}$/.test(t.label))).toBe(true)

    const yearly = timeTicks({ min: JAN1, max: JAN1 + 365 * DAY }, 0, 300, 6)
    expect(yearly.length).toBeGreaterThan(1)
    expect(yearly.every((t) => /^\d{4}-\d{2}$/.test(t.label))).toBe(true)
  })

  it('takes a caller formatter over the calendar default', () => {
    const t = timeTicks({ min: JAN1, max: JAN1 + DAY }, 0, 300, 3, () => 'X')
    expect(t.length).toBeGreaterThan(0)
    expect(t.every((x) => x.label === 'X')).toBe(true)
  })

  it('is empty for a degenerate span or a non-positive target', () => {
    expect(timeTicks({ min: JAN1, max: JAN1 }, 0, 300, 5)).toHaveLength(0)
    expect(timeTicks({ min: JAN1, max: JAN1 + DAY }, 0, 300, 0)).toHaveLength(0)
  })
})

describe('a spec with xValues', () => {
  const spec = {
    width: 320,
    height: 200,
    series: resolveMarks(ROWS, [line((d: Row) => d.v)]),
    categories: [] as string[],
    theme: defaultTheme,
    showXAxis: true,
    showYAxis: true,
    showGrid: true,
    xValues: ROWS.map((r) => r.t),
    xTime: true,
  }

  it('derives the x domain from the values', () => {
    const l = layoutChart(spec, () => 30)
    expect(l.xDomainUsed.min).toBe(ROWS[0]!.t)
    expect(l.xDomainUsed.max).toBe(ROWS[2]!.t)
  })

  it('labels the axis with calendar steps', () => {
    const labels = layoutChart(spec, () => 30).xTicks.map((t) => t.label)
    expect(labels.length).toBeGreaterThan(0)
    // Month-day at this span, never a raw epoch number.
    expect(labels.every((l) => !/^\d{10,}$/.test(l))).toBe(true)
  })

  it('draws the polyline at the value positions', () => {
    const cmds = renderChart(spec, () => 30)
    const poly = cmds.find((c) => c.kind === 'polyline')
    expect(poly).toBeDefined()
    if (poly?.kind !== 'polyline') throw new Error('expected a polyline')
    const [a, b, c] = poly.points
    // The middle point sits near the START, because one day into sixty is.
    const span = c!.x - a!.x
    expect((b!.x - a!.x) / span).toBeLessThan(0.1)
  })

  it('places the mark against the SAME domain the axis was labelled with', () => {
    // The two coming from different sources is how a point lands beside its
    // own tick, which looks like a rounding bug and is not one.
    const l = layoutChart(spec, () => 30)
    const cmds = renderChart(spec, () => 30)
    const poly = cmds.find((c) => c.kind === 'polyline')
    if (poly?.kind !== 'polyline') throw new Error('expected a polyline')
    expect(poly.points[0]!.x).toBeCloseTo(l.plot.x, 5)
    expect(poly.points[2]!.x).toBeCloseTo(l.plot.x + l.plot.w, 5)
  })

  it('falls back to even spacing with no xValues', () => {
    const { xValues: _dropped, xTime: _t, ...withoutX } = spec
    const even = renderChart(withoutX, () => 30)
    const poly = even.find((c) => c.kind === 'polyline')
    if (poly?.kind !== 'polyline') throw new Error('expected a polyline')
    const [a, b, c] = poly.points
    expect((b!.x - a!.x) / (c!.x - a!.x)).toBeCloseTo(0.5, 2)
  })
})
