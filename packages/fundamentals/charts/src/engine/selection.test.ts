// Finance-family selection: pure hit tests for candles and heat cells.

import { describe, expect, it } from 'vitest'
import { hitCandle } from './candlestick'
import { buildHeatGrid, hitHeatCell } from './heat'

const PLOT = { x: 40, y: 10, w: 300, h: 150 }

describe('hitCandle', () => {
  it('maps a pointer to its band — the full column, not just the drawn ink', () => {
    // 3 candles over 300px: bands of 100 starting at x=40.
    expect(hitCandle(3, PLOT, 45, 80)).toBe(0)
    expect(hitCandle(3, PLOT, 190, 12)).toBe(1)
    expect(hitCandle(3, PLOT, 339, 159)).toBe(2)
  })

  it('misses outside the plot rect', () => {
    expect(hitCandle(3, PLOT, 10, 80)).toBe(-1)
    expect(hitCandle(3, PLOT, 190, 5)).toBe(-1)
    expect(hitCandle(3, PLOT, 190, 161)).toBe(-1)
  })

  it('the right edge belongs to the last band, and zero candles never hit', () => {
    expect(hitCandle(3, PLOT, 340, 80)).toBe(2)
    expect(hitCandle(0, PLOT, 190, 80)).toBe(-1)
  })
})

describe('hitHeatCell', () => {
  // 2 cols x 2 rows; only (0,0) and (1,1) hold data.
  const grid = buildHeatGrid(['Mon', 'Tue'], ['09', '10'], [0, 1], [0, 1], [5, 9])

  it('hits a drawn cell and returns its index into grid.cells', () => {
    const idx = hitHeatCell(grid, PLOT, 1, 100, 40)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(grid.cells[idx]).toMatchObject({ col: 0, row: 0, value: 5 })
  })

  it('a grid position with NO datum is a miss — absence is not selectable', () => {
    // (col 1, row 0) holds nothing.
    expect(hitHeatCell(grid, PLOT, 1, 250, 40)).toBe(-1)
  })

  it('the gap between cells is a miss', () => {
    // Exactly on the column boundary with a wide gap.
    expect(hitHeatCell(grid, PLOT, 20, 40 + 150, 40)).toBe(-1)
  })

  it('outside the plot is a miss; an empty grid never hits', () => {
    expect(hitHeatCell(grid, PLOT, 1, 10, 40)).toBe(-1)
    const empty = buildHeatGrid([], [], [], [], [])
    expect(hitHeatCell(empty, PLOT, 1, 100, 40)).toBe(-1)
  })
})
