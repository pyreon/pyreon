// pictorialBar geometry on the inputs the happy-path suite does not reach:
// every symbol outline, rotation, the polygon clipper against each edge, and
// the repeat loop's over-run / over-bar / degenerate-unit exits. This module
// crosses to Swift and Kotlin, so an unasserted arm is a per-target
// divergence rather than a cosmetic gap.
import { describe, expect, it } from 'vitest'
import { clipPolygonToRect, pictorialCommands, rotatePoints, symbolPoints } from './pictorial'
import type { PictorialBar } from './pictorial'

const CELL = { x: 0, y: 0, w: 10, h: 20 }

describe('symbolPoints — one outline per symbol', () => {
  it('circle is a 24-gon inscribed in the SHORTER side', () => {
    const pts = symbolPoints(CELL, 'circle')
    expect(pts).toHaveLength(24)
    for (const p of pts) expect(Math.hypot(p.x - 5, p.y - 10)).toBeCloseTo(5, 6)
  })

  it('diamond and triangle have their own vertex counts', () => {
    expect(symbolPoints(CELL, 'diamond')).toHaveLength(4)
    expect(symbolPoints(CELL, 'triangle')).toHaveLength(3)
  })

  it('anything else draws the cell rectangle', () => {
    for (const s of ['rect', 'roundRect', 'path://nope', '']) {
      expect(symbolPoints(CELL, s), s).toHaveLength(4)
    }
  })
})

describe('rotatePoints', () => {
  it('zero degrees hands back the SAME array rather than a copy', () => {
    const pts = [{ x: 1, y: 2 }]
    expect(rotatePoints(pts, { x: 0, y: 0 }, 0)).toBe(pts)
  })

  it('rotates clockwise on screen about the centre', () => {
    const [p] = rotatePoints([{ x: 1, y: 0 }], { x: 0, y: 0 }, 90)
    expect(p!.x).toBeCloseTo(0, 9)
    expect(p!.y).toBeCloseTo(1, 9)
  })
})

describe('clipPolygonToRect', () => {
  const R = { x: 0, y: 0, w: 10, h: 10 }
  const square = (x0: number, y0: number, s: number) => [
    { x: x0, y: y0 },
    { x: x0 + s, y: y0 },
    { x: x0 + s, y: y0 + s },
    { x: x0, y: y0 + s },
  ]
  const extent = (pts: { x: number; y: number }[]) => ({
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  })

  it('a polygon fully inside is unchanged in extent', () => {
    expect(extent(clipPolygonToRect(square(2, 2, 3), R))).toEqual({ minX: 2, maxX: 5, minY: 2, maxY: 5 })
  })

  it('a polygon fully outside clips to nothing, and stops early', () => {
    expect(clipPolygonToRect(square(20, 20, 3), R)).toEqual([])
    expect(clipPolygonToRect([], R)).toEqual([])
  })

  it('straddling EACH edge is cut exactly at that edge', () => {
    expect(extent(clipPolygonToRect(square(-5, 2, 8), R)).minX).toBeCloseTo(0, 9) // left
    expect(extent(clipPolygonToRect(square(7, 2, 8), R)).maxX).toBeCloseTo(10, 9) // right
    expect(extent(clipPolygonToRect(square(2, -5, 8), R)).minY).toBeCloseTo(0, 9) // top
    expect(extent(clipPolygonToRect(square(2, 7, 8), R)).maxY).toBeCloseTo(10, 9) // bottom
  })

  it('a polygon larger than the rect on every side becomes the rect', () => {
    expect(extent(clipPolygonToRect(square(-5, -5, 20), R))).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 10 })
  })
})

describe('pictorialCommands — the repeat loop exits', () => {
  const base = (over: Partial<PictorialBar> = {}): PictorialBar => ({
    bar: { x: 0, y: 0, w: 10, h: 100 },
    horizontal: false,
    symbol: 'rect',
    repeat: true,
    fill: '#000',
    margin: 0,
    offsetX: 0,
    offsetY: 0,
    position: 'start',
    rotate: 0,
    clip: false,
    hasBounding: false,
    boundingLength: 0,
    ...over,
  })

  it('repeats unit symbols along the bar and stops at its end', () => {
    // unit = bar width 10, bar length 100 → ten whole cells.
    expect(pictorialCommands(base())).toHaveLength(10)
  })

  it('a zero-width bar has no unit to repeat and draws nothing', () => {
    expect(pictorialCommands(base({ bar: { x: 0, y: 0, w: 0, h: 100 } }))).toEqual([])
  })

  it('a partial last cell is DROPPED unclipped, and CLIPPED when clip is on', () => {
    const bar = { x: 0, y: 0, w: 10, h: 95 }
    const unclipped = pictorialCommands(base({ bar }))
    const clipped = pictorialCommands(base({ bar, clip: true }))
    expect(unclipped).toHaveLength(9)
    expect(clipped.length).toBeGreaterThanOrEqual(9)
  })

  it('a bounding length shorter than the bar ends the run early', () => {
    expect(pictorialCommands(base({ hasBounding: true, boundingLength: 40 })).length).toBeLessThan(10)
  })

  it('a margin spaces the cells and so fits fewer of them', () => {
    expect(pictorialCommands(base({ margin: 10 })).length).toBeLessThan(10)
  })

  it('a horizontal bar repeats along x', () => {
    expect(pictorialCommands(base({ horizontal: true, bar: { x: 0, y: 0, w: 100, h: 10 } }))).toHaveLength(10)
  })
})
