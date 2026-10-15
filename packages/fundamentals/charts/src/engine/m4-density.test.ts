// A dense line is decimated to one M4 column per DEVICE pixel: four points
// per column draw the same pixels as every point would. The density follows
// `ChartSpec.m4Density`; unset it stays 2 (a 2× display), so a host that
// cannot say still draws every device pixel.
import { describe, expect, it } from 'vitest'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { MeasureText } from './types'

const measure: MeasureText = (text) => text.length * 6
const values = Array.from({ length: 20_000 }, (_, i) => Math.sin(i / 37) * 50 + (i % 11))
const series: Series = { kind: 'line', values, color: '#000', width: 1, radius: 3, label: 's' } as Series
const pointsDrawn = (over: Partial<ChartSpec>): number =>
  renderChart({ width: 600.0, height: 200.0, series: [series], categories: [], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, animate: false, ...over } as ChartSpec, measure)
    .filter((c) => c.kind === 'polyline')
    .reduce((n, c) => n + (c as { points: unknown[] }).points.length, 0)

describe('M4 density follows ChartSpec.m4Density', () => {
  it('one column per pixel draws about half the points of two', () => {
    const one = pointsDrawn({ m4Density: 1.0 })
    const two = pointsDrawn({ m4Density: 2.0 })
    expect(one).toBeGreaterThan(0)
    expect(one).toBeLessThan(two * 0.6)
  })

  it('unset is the 2× density; below one is clamped to one', () => {
    expect(pointsDrawn({})).toBe(pointsDrawn({ m4Density: 2.0 }))
    expect(pointsDrawn({ m4Density: 0.5 })).toBe(pointsDrawn({ m4Density: 1.0 }))
  })

  it('a denser setting keeps more points', () => {
    expect(pointsDrawn({ m4Density: 3.0 })).toBeGreaterThan(pointsDrawn({ m4Density: 2.0 }))
  })
})
