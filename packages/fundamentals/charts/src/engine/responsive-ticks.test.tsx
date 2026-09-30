// Tick density follows the chart's size, and the domain is niced to the same
// count so the axis always ends on a labelled tick.
import { describe, expect, it } from 'vitest'
import { autoTickCount, valueTickTarget } from './layout'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec } from './render'

const measure = (t: string, s: number): number => t.length * s * 0.6
const yLabels = (spec: ChartSpec): string[] =>
  renderChart(spec, measure)
    .filter((c) => c.kind === 'text' && c.align === 'end')
    .map((c) => (c as { text: string }).text)

const spec = (width: number, height: number, extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width,
  height,
  series: [{ kind: 'line', values: [520, 900, 1300, 2100, 2900], color: '#4f7df3', label: 'a', width: 2, radius: 3 }],
  categories: ['a', 'b', 'c', 'd', 'e'],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...extra,
})

describe('autoTickCount', () => {
  it('one tick per spacing, clamped to 2–10', () => {
    expect(autoTickCount(200, 40)).toBe(5)
    expect(autoTickCount(10, 40)).toBe(2)
    expect(autoTickCount(4000, 40)).toBe(10)
  })
  it('a horizontal chart sizes its value axis from the width', () => {
    expect(valueTickTarget(400, 100, 11, true)).toBe(4)
    expect(valueTickTarget(400, 100, 11, false)).toBe(2)
  })
})

describe('value-axis density follows the chart size', () => {
  it('a short chart draws fewer ticks than a tall one', () => {
    // A pinned domain isolates the tick count from the domain's nicing.
    const pinned = { yDomain: { min: 0, max: 3000 } }
    const short = yLabels(spec(300, 140, pinned))
    const tall = yLabels(spec(300, 480, pinned))
    expect(short.length).toBeLessThan(tall.length)
    expect(short.length).toBeGreaterThanOrEqual(2)
  })

  it('the top of the axis is always a labelled tick, at every size', () => {
    for (const h of [120, 160, 200, 260, 340, 480, 640]) {
      const cmds = renderChart(spec(300, h), measure)
      const labels = yLabels(spec(300, h)).map((l) => Number(l.replace(/,/g, '')))
      expect(Math.max(...labels), `height ${h}`).toBeGreaterThanOrEqual(2900)
      expect(cmds.length).toBeGreaterThan(0)
    }
  })

  it('yTicks pins the target regardless of size', () => {
    expect(yLabels(spec(300, 480, { yTicks: 2 })).length).toBeLessThan(yLabels(spec(300, 480)).length)
  })
})
