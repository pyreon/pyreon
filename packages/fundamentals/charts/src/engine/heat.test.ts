import { describe, expect, it } from 'vitest'
import { buildHeatGrid, colorRamp, HEAT_RAMP, renderHeat } from './heat'
import type { Rect } from './types'

const PLOT: Rect = { x: 0, y: 0, w: 100, h: 60 }

describe('buildHeatGrid', () => {
  it('SUMS duplicate (col, row) observations — event data has many per cell', () => {
    const g = buildHeatGrid(['a', 'b'], ['x'], [0, 0, 1], [0, 0, 0], [2, 3, 7])
    expect(g.cells).toHaveLength(2)
    const first = g.cells.find((c) => c.col === 0 && c.row === 0)
    expect(first?.value).toBe(5)
    expect(g.min).toBe(5)
    expect(g.max).toBe(7)
  })

  it('skips negative indices and takes the shortest of mismatched inputs', () => {
    const g = buildHeatGrid(['a'], ['x'], [-1, 0], [0, 0], [9, 4, 999])
    expect(g.cells).toHaveLength(1)
    expect(g.cells[0]!.value).toBe(4)
  })

  it('is empty for no observations, with a zeroed range', () => {
    const g = buildHeatGrid(['a'], ['x'], [], [], [])
    expect(g.cells).toHaveLength(0)
    expect(g.min).toBe(0)
    expect(g.max).toBe(0)
  })
})

describe('colorRamp', () => {
  it('hits the endpoints exactly and interpolates the middle', () => {
    const ramp = colorRamp(['#000000', '#ffffff'])
    expect(ramp(0)).toBe('rgb(0, 0, 0)')
    expect(ramp(1)).toBe('rgb(255, 255, 255)')
    expect(ramp(0.5)).toBe('rgb(128, 128, 128)')
  })

  it('clamps outside 0..1 rather than extrapolating', () => {
    const ramp = colorRamp(['#000000', '#ffffff'])
    expect(ramp(-2)).toBe(ramp(0))
    expect(ramp(9)).toBe(ramp(1))
  })

  it('a single stop is a constant; no stops is black, not NaN', () => {
    expect(colorRamp(['#ff0000'])(0.7)).toBe('rgb(255, 0, 0)')
    expect(colorRamp([])(0.5)).toBe('rgb(0, 0, 0)')
  })

  it('is piecewise across more than two stops', () => {
    const ramp = colorRamp(['#000000', '#ff0000', '#ffffff'])
    expect(ramp(0.5)).toBe('rgb(255, 0, 0)')
    expect(ramp(0.25)).toBe('rgb(128, 0, 0)')
  })

  it('accepts stops with or without the # prefix; malformed digits read as 0', () => {
    expect(colorRamp(['ff0000'])(0)).toBe('rgb(255, 0, 0)')
    expect(colorRamp(['#zz0000'])(0)).toBe('rgb(0, 0, 0)')
  })

  it('ships a default ramp', () => {
    expect(HEAT_RAMP.length).toBeGreaterThan(2)
  })
})

describe('renderHeat', () => {
  const ramp = colorRamp(['#000000', '#ffffff'])

  it('tiles the plot with gapped cells', () => {
    const grid = buildHeatGrid(['a', 'b'], ['x', 'y'], [0, 1, 0, 1], [0, 0, 1, 1], [1, 2, 3, 4])
    const cmds = renderHeat({ grid, plot: PLOT, ramp, gap: 2 })
    expect(cmds).toHaveLength(4)
    for (const c of cmds) {
      if (c.kind !== 'rect') throw new Error('rects only')
      expect(c.rect.w).toBeCloseTo(100 / 2 - 2, 5)
      expect(c.rect.h).toBeCloseTo(60 / 2 - 2, 5)
    }
  })

  it('maps min to the ramp bottom and max to the top', () => {
    const grid = buildHeatGrid(['a', 'b'], ['x'], [0, 1], [0, 0], [10, 20])
    const cmds = renderHeat({ grid, plot: PLOT, ramp })
    const fills = cmds.map((c) => (c.kind === 'rect' ? c.fill : ''))
    expect(fills).toContain('rgb(0, 0, 0)')
    expect(fills).toContain('rgb(255, 255, 255)')
  })

  it('a FLAT grid renders every cell fully present, not divided by zero', () => {
    const grid = buildHeatGrid(['a', 'b'], ['x'], [0, 1], [0, 0], [5, 5])
    const cmds = renderHeat({ grid, plot: PLOT, ramp })
    for (const c of cmds) {
      expect(c.kind === 'rect' && c.fill).toBe('rgb(255, 255, 255)')
    }
  })

  it('does NOT draw absent cells — absence and zero are different facts', () => {
    const grid = buildHeatGrid(['a', 'b'], ['x', 'y'], [0], [0], [1])
    expect(renderHeat({ grid, plot: PLOT, ramp })).toHaveLength(1)
  })

  it('ignores cells outside the declared grid rather than painting off-plot', () => {
    const grid = buildHeatGrid(['a'], ['x'], [0, 5], [0, 0], [1, 2])
    expect(renderHeat({ grid, plot: PLOT, ramp })).toHaveLength(1)
  })

  it('the entrance scales cells from their centres', () => {
    const grid = buildHeatGrid(['a'], ['x'], [0], [0], [1])
    const full = renderHeat({ grid, plot: PLOT, ramp })[0]!
    const half = renderHeat({ grid, plot: PLOT, ramp, progress: 0.5 })[0]!
    if (full.kind !== 'rect' || half.kind !== 'rect') throw new Error('rects')
    expect(half.rect.w).toBeCloseTo(full.rect.w * 0.5, 5)
    // Centred: the centre point does not move as the cell grows.
    expect(half.rect.x + half.rect.w / 2).toBeCloseTo(full.rect.x + full.rect.w / 2, 5)
  })

  it('an empty axis renders nothing', () => {
    const grid = buildHeatGrid([], [], [], [], [])
    expect(renderHeat({ grid, plot: PLOT, ramp })).toHaveLength(0)
  })
})
