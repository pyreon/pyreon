import { describe, expect, it } from 'vitest'
import { brushRange, clampWindow, isFullWindow, panWindow, sliceRange, zoomWindow } from './zoom'

describe('zoom window math', () => {
  it('clamps into [0,1] preserving span', () => {
    expect(clampWindow({ start: -0.2, end: 0.3 })).toEqual({ start: 0, end: 0.5 })
    const w = clampWindow({ start: 0.8, end: 1.4 })
    expect(w.start).toBeCloseTo(0.4, 9)
    expect(w.end).toBeCloseTo(1.0, 9)
  })

  it('enforces the minimum span so zoom cannot trap itself', () => {
    const w = clampWindow({ start: 0.5, end: 0.5001 })
    expect(w.end - w.start).toBeCloseTo(0.02, 9)
  })

  it('zoom keeps the datum under the cursor fixed', () => {
    // Center at 25% of the window: after zooming, the same GLOBAL fraction
    // must still sit at 25% of the new window.
    const w = zoomWindow({ start: 0.0, end: 1.0 }, 0.5, 0.25)
    const globalCenter = 0.25
    expect((globalCenter - w.start) / (w.end - w.start)).toBeCloseTo(0.25, 9)
    expect(w.end - w.start).toBeCloseTo(0.5, 9)
  })

  it('zoom out past everything clamps to the full window', () => {
    const w = zoomWindow({ start: 0.2, end: 0.8 }, 5.0, 0.5)
    expect(isFullWindow(w)).toBe(true)
  })

  it('pan shifts by a fraction of the CURRENT span and clamps at the edges', () => {
    const w = panWindow({ start: 0.4, end: 0.6 }, 0.5)
    expect(w.start).toBeCloseTo(0.5, 9)
    expect(w.end).toBeCloseTo(0.7, 9)
    expect(panWindow({ start: 0.8, end: 1.0 }, 1.0)).toEqual({ start: 0.8, end: 1 })
  })

  it('sliceRange is never empty and covers the ends exactly', () => {
    expect(sliceRange({ start: 0.0, end: 1.0 }, 10)).toEqual({ from: 0, to: 10 })
    expect(sliceRange({ start: 0.25, end: 0.75 }, 8)).toEqual({ from: 2, to: 6 })
    expect(sliceRange({ start: 0.99, end: 1.0 }, 10)).toEqual({ from: 9, to: 10 })
    expect(sliceRange({ start: 0.5, end: 0.5 }, 10).to).toBeGreaterThan(sliceRange({ start: 0.5, end: 0.5 }, 10).from)
    expect(sliceRange({ start: 0.0, end: 1.0 }, 0)).toEqual({ from: 0, to: 0 })
  })

  it('brushRange maps pixels through the window to GLOBAL inclusive indices', () => {
    // Full window, 100px plot, 10 rows: pixels 20..40 → 20%..40% → rows 2..3.
    expect(brushRange(0, 100, 20, 40, { start: 0, end: 1 }, 10)).toEqual({ start: 2, end: 3 })
    // Zoomed to the back half: the same pixels land in rows 6..6 (global).
    const r = brushRange(0, 100, 20, 30, { start: 0.5, end: 1 }, 10)
    expect(r.start).toBe(6)
    expect(r.end).toBeGreaterThanOrEqual(r.start)
    // Leftward drags normalize; off-plot pixels clamp.
    expect(brushRange(0, 100, 40, 20, { start: 0, end: 1 }, 10)).toEqual({ start: 2, end: 3 })
    expect(brushRange(0, 100, -50, 500, { start: 0, end: 1 }, 10)).toEqual({ start: 0, end: 9 })
  })
})

describe('zoom window edge cases (coverage of the clamps)', () => {
  it('zoomWindow clamps an out-of-range centre fraction to the window ends', () => {
    const win = { start: 0.2, end: 0.6 }
    const left = zoomWindow(win, 0.5, -3)
    const right = zoomWindow(win, 0.5, 7)
    // Anchored at the left end the start does not move; at the right end the end does not move.
    expect(left.start).toBeCloseTo(0.2, 9)
    expect(right.end).toBeCloseTo(0.6, 9)
  })
  it('zoomWindow on a degenerate zero-span window still returns a valid window', () => {
    const z = zoomWindow({ start: 0.4, end: 0.4 }, 2, 0.5)
    expect(z.end - z.start).toBeGreaterThan(0)
    expect(z.start).toBeGreaterThanOrEqual(0)
    expect(z.end).toBeLessThanOrEqual(1)
  })
  it('sliceRange clamps every bound: from below zero, from past the end, to past n, to before from', () => {
    expect(sliceRange({ start: -0.5, end: 0.1 }, 10)).toEqual({ from: 0, to: 1 })
    expect(sliceRange({ start: 1.5, end: 2 }, 10)).toEqual({ from: 9, to: 10 })
    expect(sliceRange({ start: 0.95, end: 0.96 }, 10)).toEqual({ from: 9, to: 10 })
    expect(sliceRange({ start: 0, end: 0 }, 10)).toEqual({ from: 0, to: 1 })
  })
  it('brushRange over a zero-width plot maps everything to the window start', () => {
    const r = brushRange(10, 0, 50, 90, { start: 0.5, end: 1 }, 10)
    expect(r.start).toBe(5)
    expect(r.end).toBe(5)
  })
})
