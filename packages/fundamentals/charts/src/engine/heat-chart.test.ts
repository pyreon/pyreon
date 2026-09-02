import { describe, expect, it } from 'vitest'
import { heatGridFrom, heatPlotFor, hitHeatChart, renderHeatChart } from './heat-chart'
import { HEAT_RAMP } from './heat'
import { defaultTheme } from './render'
import { measureApprox } from './svg'

const measure = measureApprox()

describe('heatGridFrom', () => {
  it('keeps first-seen category order on both axes and aggregates by cell', () => {
    const g = heatGridFrom(['10', '09', '10', '09'], ['Tue', 'Mon', 'Mon', 'Tue'], [1, 2, 3, 4])
    expect(g.cols).toEqual(['10', '09'])
    expect(g.rows).toEqual(['Tue', 'Mon'])
    expect(g.cells.length).toBe(4)
    expect(g.min).toBe(1)
    expect(g.max).toBe(4)
  })
  it('a NaN value counts as 0, and short y / value arrays fall back to an empty row and 0', () => {
    const g = heatGridFrom(['a', 'b'], ['r'], [Number.NaN])
    expect(g.rows).toEqual(['r', ''])
    const values = g.cells.map((c) => c.value).sort()
    expect(values).toEqual([0, 0])
  })
  it('an empty input is an empty grid', () => {
    const g = heatGridFrom([], [], [])
    expect(g.cols).toEqual([])
    expect(g.rows).toEqual([])
    expect(g.cells).toEqual([])
  })
})

describe('heatPlotFor', () => {
  it('sizes the left gutter from the widest row label and the bottom one from the font', () => {
    const g = heatGridFrom(['a', 'a'], ['short', 'a much longer row label'], [1, 2])
    const p = heatPlotFor(g, 300, 200, 11, measure)
    expect(p.x).toBeCloseTo(measure('a much longer row label', 11) + 8)
    expect(p.y).toBe(4)
    expect(p.w).toBeCloseTo(300 - p.x - 4)
    expect(p.h).toBeCloseTo(200 - 4 - (11 + 8))
  })
  it('never goes negative on a tiny canvas', () => {
    const g = heatGridFrom(['a'], ['a very very long label'], [1])
    const p = heatPlotFor(g, 20, 10, 11, measure)
    expect(p.w).toBe(0)
    expect(p.h).toBe(0)
  })
})

describe('renderHeatChart', () => {
  it('draws one cell per datum, then a label per row and per column', () => {
    const g = heatGridFrom(['09', '10', '09', '10'], ['Mon', 'Mon', 'Tue', 'Tue'], [1, 2, 3, 4])
    const cmds = renderHeatChart(g, 300, 200, defaultTheme, HEAT_RAMP, 1, measure)
    expect(cmds.filter((c) => c.kind === 'rect').length).toBe(4)
    const rowLabels = cmds.filter((c) => c.kind === 'text' && c.align === 'end').map((c) => c.text)
    const colLabels = cmds.filter((c) => c.kind === 'text' && c.align === 'middle').map((c) => c.text)
    expect(rowLabels).toEqual(['Mon', 'Tue'])
    expect(colLabels).toEqual(['09', '10'])
    // Row labels sit left of the plot, column labels below it.
    const p = heatPlotFor(g, 300, 200, defaultTheme.fontSize, measure)
    for (const c of cmds) {
      if (c.kind !== 'text' || c.at === undefined) continue
      if (c.align === 'end') expect(c.at.x).toBeLessThan(p.x)
      else expect(c.at.y).toBeGreaterThan(p.y + p.h)
    }
  })
  it('custom stops reach the cells', () => {
    const g = heatGridFrom(['a', 'b'], ['r', 'r'], [0, 10])
    const cmds = renderHeatChart(g, 300, 200, defaultTheme, ['#000000', '#ffffff'], 1, measure)
    const fills = cmds.filter((c) => c.kind === 'rect').map((c) => c.fill)
    expect(fills).toContain('rgb(0, 0, 0)')
    expect(fills).toContain('rgb(255, 255, 255)')
  })
})

describe('hitHeatChart', () => {
  it('reports the cell under the pointer and -1 in the gutters', () => {
    const g = heatGridFrom(['09', '10'], ['Mon', 'Mon'], [1, 2])
    const p = heatPlotFor(g, 300, 200, 11, measure)
    const first = hitHeatChart(g, 300, 200, 11, 1, measure, p.x + p.w * 0.25, p.y + p.h / 2)
    const second = hitHeatChart(g, 300, 200, 11, 1, measure, p.x + p.w * 0.75, p.y + p.h / 2)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThanOrEqual(0)
    expect(first).not.toBe(second)
    expect(hitHeatChart(g, 300, 200, 11, 1, measure, 1, 1)).toBe(-1)
  })
})
