// The lines series on the inputs its animation loop has to survive: degenerate
// polylines, a zero or negative period, trail lengths outside 0..1, a head at
// the very start of a line (no trail yet), missing per-line colours/widths,
// and the polyline helpers at their edges. The trail moves every frame, so a
// NaN here is a flickering or vanishing shape rather than a one-off glitch.
import { describe, expect, it } from 'vitest'
import { linesCommands, pathLength, pointAlong, subPath } from './lines'
import type { LinesSeries } from './lines'

const PLOT = { x: 0, y: 0, w: 100, h: 100 }
const D = { min: 0, max: 100 }
const series = (over: Partial<LinesSeries> = {}): LinesSeries => ({
  coords: [[0, 0, 100, 0]],
  colors: ['#f00'],
  widths: [2],
  effect: true,
  period: 4,
  trailLength: 0.5,
  effectColor: '',
  symbolSize: 6,
  ...over,
})
const kinds = (s: LinesSeries, t: number) => linesCommands(s, PLOT, D, D, t).map((c) => c.kind)

describe('polyline helpers', () => {
  const L = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }]

  it('pointAlong on an empty line is the origin, and past the end clamps to the last point', () => {
    expect(pointAlong([], 5)).toEqual({ x: 0, y: 0 })
    expect(pointAlong(L, 1000)).toEqual({ x: 30, y: 40 })
  })

  it('pathLength sums every segment', () => {
    expect(pathLength(L)).toBe(70)
    expect(pathLength([{ x: 1, y: 1 }])).toBe(0)
  })

  it('subPath is empty for a one-point line or an empty / reversed window', () => {
    expect(subPath([{ x: 0, y: 0 }], 0, 5)).toEqual([])
    expect(subPath(L, 10, 10)).toEqual([])
    expect(subPath(L, 20, 10)).toEqual([])
  })

  it('subPath includes an interior vertex only when the window strictly contains it', () => {
    // The corner sits at distance 30.
    expect(subPath(L, 10, 50)).toContainEqual({ x: 30, y: 0 })
    expect(subPath(L, 31, 50)).not.toContainEqual({ x: 30, y: 0 })
  })
})

describe('linesCommands — the static half', () => {
  it('a line with fewer than two points draws nothing', () => {
    expect(linesCommands(series({ coords: [[5, 5]], effect: false }), PLOT, D, D, 0)).toEqual([])
  })

  it('missing per-line colours and widths fall back to the defaults', () => {
    const [c] = linesCommands(series({ colors: [], widths: [], effect: false }), PLOT, D, D, 0)
    expect(c!.kind === 'polyline' && [c!.stroke, c!.width]).toEqual(['#334155', 1.5])
  })

  it('with the effect off, only the lines are drawn', () => {
    expect(kinds(series({ effect: false }), 1)).toEqual(['polyline'])
  })
})

describe('linesCommands — the moving trail', () => {
  it('draws the line, then a trail and a head', () => {
    expect(kinds(series(), 2)).toEqual(['polyline', 'polyline', 'circle'])
  })

  it('a non-positive period falls back to the default rather than dividing by zero', () => {
    for (const period of [0, -3]) {
      for (const c of linesCommands(series({ period }), PLOT, D, D, 1)) {
        if (c.kind === 'circle') expect(Number.isFinite(c.center.x)).toBe(true)
      }
    }
  })

  it('trail length is clamped: negative draws no trail, above one is a whole line', () => {
    expect(kinds(series({ trailLength: -1 }), 2)).toEqual(['polyline', 'circle'])
    const long = linesCommands(series({ trailLength: 5 }), PLOT, D, D, 2)
    expect(long.map((c) => c.kind)).toEqual(['polyline', 'polyline', 'circle'])
  })

  it('at time zero the head is at the start, so there is no trail behind it yet', () => {
    expect(kinds(series(), 0)).toEqual(['polyline', 'circle'])
  })

  it('an explicit effect colour paints the head; otherwise the line colour does', () => {
    const head = (s: LinesSeries) => linesCommands(s, PLOT, D, D, 1).find((c) => c.kind === 'circle')!
    expect(head(series({ effectColor: '#0f0' })).kind === 'circle' && head(series({ effectColor: '#0f0' })).fill).toBe('#0f0')
    expect(head(series()).kind === 'circle' && head(series()).fill).toBe('#f00')
    expect(head(series({ colors: [] })).kind === 'circle' && head(series({ colors: [] })).fill).toBe('#334155')
  })

  it('the trail is one pixel wider than a line of unknown width', () => {
    const trail = linesCommands(series({ widths: [] }), PLOT, D, D, 2).filter((c) => c.kind === 'polyline')[1]!
    expect(trail.kind === 'polyline' && trail.width).toBe(2.5)
  })

  it('a zero-LENGTH line (both points equal) draws its line but no head', () => {
    expect(kinds(series({ coords: [[50, 50, 50, 50]] }), 1)).toEqual(['polyline'])
  })

  it('a one-point line is skipped by the trail loop too', () => {
    expect(kinds(series({ coords: [[5, 5]] }), 1)).toEqual([])
  })
})
