import { describe, expect, it } from 'vitest'
import { navigatorDrag, navigatorHit, renderNavigator } from './navigator'
import type { DrawCmd } from './types'

const canvas = { x: 0.0, y: 0.0, w: 400.0, h: 240.0 }
const full = { start: 0.0, end: 1.0 }

describe('renderNavigator — the strip', () => {
  it('sits along the canvas bottom with its insets and reports what the plot gives up', () => {
    const l = renderNavigator([1, 2, 3], '#ff0000', full, canvas, '#eee')
    expect(l.strip).toEqual({ x: 8, y: 240 - 36 + 6, w: 384, h: 24 })
    expect(l.height).toBe(36)
  })
  it('paints the grid, the series as an area to the strip floor, the window band and two handles', () => {
    const l = renderNavigator([1, 2, 3], '#ff0000', { start: 0.25, end: 0.75 }, canvas, '#eee')
    const kinds = l.cmds.map((c) => c.kind)
    expect(kinds).toEqual(['rect', 'polygon', 'rect', 'rect', 'rect'])
    const rects = l.cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')
    expect(rects[0]!.fill).toBe('#eee')
    // The band spans the window's fraction of the strip; the handles straddle its edges.
    expect(rects[1]!.rect).toEqual({ x: 8 + 384 * 0.25, y: 210, w: 384 * 0.5, h: 24 })
    expect(rects[2]!.rect).toEqual({ x: 8 + 384 * 0.25 - 3, y: 210, w: 6, h: 24 })
    expect(rects[3]!.rect).toEqual({ x: 8 + 384 * 0.75 - 3, y: 210, w: 6, h: 24 })
    const poly = l.cmds.find((c): c is Extract<DrawCmd, { kind: 'polygon' }> => c.kind === 'polygon')!
    expect(poly.fill).toBe('rgba(255, 0, 0, 0.35)')
    expect(poly.points).toHaveLength(5)
    expect(poly.points[3]).toEqual({ x: poly.points[2]!.x, y: 234 })
    expect(poly.points[4]).toEqual({ x: poly.points[0]!.x, y: 234 })
  })
  it('a NaN is skipped for the domain and drawn at the floor value; a single value or none draws no area', () => {
    const withNaN = renderNavigator([2, Number.NaN, 4], '#00ff00', full, canvas, '#eee')
    const poly = withNaN.cmds.find((c): c is Extract<DrawCmd, { kind: 'polygon' }> => c.kind === 'polygon')!
    // The NaN point lands where a value of 2 (the minimum) would.
    expect(poly.points[1]!.y).toBe(poly.points[0]!.y)
    expect(renderNavigator([5], '#00ff00', full, canvas, '#eee').cmds.map((c) => c.kind)).toEqual(['rect', 'rect', 'rect', 'rect'])
    expect(renderNavigator([], '#00ff00', full, canvas, '#eee').cmds.map((c) => c.kind)).toEqual(['rect', 'rect', 'rect', 'rect'])
  })
  it('a canvas narrower than the insets yields an empty strip rather than a negative one', () => {
    expect(renderNavigator([1, 2], '#000', full, { x: 0, y: 0, w: 10, h: 100 }, '#eee').strip.w).toBe(0)
  })
})

describe('navigatorHit — what a press grabs', () => {
  const strip = { x: 8, y: 210, w: 384, h: 24 }
  const win = { start: 0.25, end: 0.75 }
  it('a handle within 6 units, else the band — anywhere in the strip', () => {
    const left = 8 + 384 * 0.25
    const right = 8 + 384 * 0.75
    expect(navigatorHit(strip, win, left + 5)).toBe(2)
    expect(navigatorHit(strip, win, right - 5)).toBe(3)
    expect(navigatorHit(strip, win, (left + right) / 2)).toBe(1)
    expect(navigatorHit(strip, win, 20)).toBe(1)
  })
})

describe('navigatorDrag — the window after a drag', () => {
  const win = { start: 0.25, end: 0.75 }
  it('the band moves by the fraction, clamped inside [0, 1] with its span kept', () => {
    expect(navigatorDrag(1, win, 0.1)).toEqual({ start: 0.35, end: 0.85 })
    const clamped = navigatorDrag(1, win, 0.5)
    expect(clamped.start).toBeCloseTo(0.5, 9)
    expect(clamped.end).toBeCloseTo(1.0, 9)
  })
  it('the left handle narrows from the start and never crosses the right one', () => {
    expect(navigatorDrag(2, win, 0.1)).toEqual({ start: 0.35, end: 0.75 })
    const pinned = navigatorDrag(2, win, 0.9)
    expect(pinned.end).toBeCloseTo(0.75, 9)
    expect(pinned.end - pinned.start).toBeCloseTo(0.02, 9)
  })
  it('the right handle widens or narrows from the end and never crosses the left one', () => {
    expect(navigatorDrag(3, win, -0.1)).toEqual({ start: 0.25, end: 0.65 })
    const pinned = navigatorDrag(3, win, -0.9)
    expect(pinned.start).toBeCloseTo(0.25, 9)
    expect(pinned.end - pinned.start).toBeCloseTo(0.02, 9)
  })
})
