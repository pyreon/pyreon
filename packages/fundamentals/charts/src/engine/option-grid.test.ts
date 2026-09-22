/**
 * A single ECharts `grid` places the plot, and a legend at the bottom or right
 * takes its band off the chart when no grid places the plot on that side.
 */
import { describe, expect, it } from 'vitest'
import { compileOption, compiledCommands, zoomedView } from './option'
import { GRID_PART_KEY, optionGridInsets } from './option-grid'
import { layoutChart } from './render'
import type { EChartsOption } from './option'

const m = (t: string) => t.length * 6
const base = (o: Record<string, unknown>): EChartsOption => ({ animation: false, xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', name: 'S', data: [1, 2, 3] }], ...o }) as EChartsOption
const plotOf = (o: Record<string, unknown>) => {
  const c = compileOption(base(o), { width: 400, height: 300 })
  const cc = compiledCommands(c, {}, m)
  return { plot: layoutChart(zoomedView(c, cc.chrome).spec, m).plot, cc, c }
}

describe('optionGridInsets', () => {
  it('pixels and percents; width / height fix the far side; a multi-grid option sets nothing', () => {
    expect(optionGridInsets({ left: 10, top: '10%', right: '5%', bottom: 20 }, 400, 300)).toEqual({ gridLeft: 10, gridTop: 30, gridRight: 20, gridBottom: 20, gridContain: true })
    expect(optionGridInsets({ left: 10, width: 300, top: 5, height: 200 }, 400, 300)).toMatchObject({ gridLeft: 10, gridRight: 90, gridTop: 5, gridBottom: 95 })
    expect(optionGridInsets({ right: 10, width: 300, bottom: 5, height: 200 }, 400, 300)).toMatchObject({ gridRight: 10, gridLeft: 90, gridBottom: 5, gridTop: 95 })
    // A side left unset takes ECharts 6's default: 15% / 65 / 10% / 80.
    expect(optionGridInsets([{ left: 1 }], 400, 300)).toEqual({ gridLeft: 1, gridTop: 65, gridRight: 40, gridBottom: 80, gridContain: true })
    expect(optionGridInsets({ left: 'x', top: {} }, 400, 300)).toEqual({ gridLeft: 60, gridTop: 65, gridRight: 40, gridBottom: 80, gridContain: true })
    // No grid is the default grid; outerBoundsMode 'none' stops the labels growing it.
    expect(optionGridInsets(undefined, 400, 300)).toEqual({ gridLeft: 60, gridTop: 65, gridRight: 40, gridBottom: 80, gridContain: true })
    expect(optionGridInsets({ outerBoundsMode: 'none' }, 400, 300).gridContain).toBeUndefined()
    // Several grids, and a multi-grid part, set nothing: the composite splits those.
    expect(optionGridInsets([{ left: 1 }, { left: 2 }], 400, 300)).toEqual({})
    expect(optionGridInsets({ [GRID_PART_KEY]: true }, 400, 300)).toEqual({})
  })
})

describe('grid places the plot', () => {
  it("the plot rect is the grid's", () => {
    const { plot } = plotOf({ grid: { left: 60, right: 40, top: 50, bottom: 30 } })
    expect(plot).toEqual({ x: 60, y: 50, w: 300, h: 220 })
  })
  it('a title and legend overlay a grid that sets top, rather than pushing the plot down', () => {
    const { plot, cc } = plotOf({ title: { text: 'T' }, legend: {}, grid: { top: 50 } })
    expect(plot.y).toBe(50)
    expect(cc.top).toBe(0)
  })
})

// ECharts' single grid lets the legend overlay its margins (covered above). A multi-grid
// part is laid out by its labels, so there a legend takes its band: that path, here.
const part = { [GRID_PART_KEY]: true }

describe('legend reservations', () => {
  it('a single grid: the legend draws in the margin; the plot keeps the grid\'s rect', () => {
    const { plot, cc } = plotOf({ legend: {} })
    expect(plot).toEqual({ x: 60, y: 65, w: 300, h: 155 })
    expect(cc.chrome).toEqual({ top: 0, bottom: 0, right: 0 })
  })
  it('a bottom legend takes its band off the bottom; the plot ends above it', () => {
    const top = plotOf({ grid: part, legend: { top: 0 } })
    const bottom = plotOf({ grid: part, legend: { bottom: 0 } })
    expect(bottom.cc.chrome.bottom).toBeGreaterThan(0)
    expect(bottom.cc.top + bottom.plot.y).toBeLessThan(top.cc.top + top.plot.y)
    const legendY = Math.min(...bottom.cc.legendBoxes.map((b) => b.y))
    expect(bottom.plot.y + bottom.plot.h).toBeLessThan(legendY)
  })
  it('a vertical legend on the right takes its column off the right', () => {
    const r = plotOf({ grid: part, legend: { orient: 'vertical', right: 0, top: 'middle' } })
    expect(r.cc.chrome.right).toBeGreaterThan(0)
    expect(r.plot.x + r.plot.w).toBeLessThanOrEqual(Math.min(...r.cc.legendBoxes.map((b) => b.x)))
  })
  it('a vertical legend on the left takes its column off the left: the plot starts past it', () => {
    const l = plotOf({ grid: part, legend: { orient: 'vertical', left: 0, top: 'middle' } })
    expect(l.cc.chrome.left).toBeGreaterThan(0)
    const legendRight = Math.max(...l.cc.legendBoxes.map((b) => b.x + b.w))
    expect(l.plot.x).toBeGreaterThan(legendRight)
    expect(plotOf({ legend: { orient: 'vertical', left: 0 }, grid: { left: 80 } }).cc.chrome.left).toBeUndefined()
  })
  it('a grid that sets the side keeps it (the legend overlays)', () => {
    expect(plotOf({ legend: { bottom: 0 }, grid: { bottom: 40 } }).cc.chrome.bottom).toBe(0)
    expect(plotOf({ legend: { orient: 'vertical', right: 0 }, grid: { right: 80 } }).cc.chrome.right).toBe(0)
  })
})
