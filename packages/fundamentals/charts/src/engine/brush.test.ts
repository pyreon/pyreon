import { describe, expect, it } from 'vitest'
import { brushBand, brushRange, renderBrushBand } from './brush'
import type { DrawCmd } from './types'

const plot = { x: 40.0, y: 10.0, w: 300.0, h: 150.0 }
const full = { start: 0.0, end: 1.0 }

describe('brushRange — pixels to a GLOBAL inclusive range', () => {
  it('maps a span over the full window to the datum bands it covers, in either drag direction', () => {
    expect(brushRange(plot.x, plot.w, 40, 190, full, 10)).toEqual({ start: 0, end: 4 })
    expect(brushRange(plot.x, plot.w, 190, 40, full, 10)).toEqual({ start: 0, end: 4 })
  })
  it('offsets by the window: the same pixels under [0.5, 1] are the upper half of the rows', () => {
    expect(brushRange(plot.x, plot.w, 40, 190, { start: 0.5, end: 1.0 }, 10)).toEqual({ start: 5, end: 7 })
  })
  it('clamps a span outside the plot to the plot, and a zero-width plot to the window start', () => {
    expect(brushRange(plot.x, plot.w, -100, 1000, full, 10)).toEqual({ start: 0, end: 9 })
    expect(brushRange(plot.x, 0.0, 50, 60, full, 10)).toEqual({ start: 0, end: 0 })
  })
})

describe('brushBand — where a committed selection sits', () => {
  it('spans the datum bands of the selection over the full window', () => {
    const b = brushBand(plot, { start: 2, end: 4 }, full, 10)
    expect(b.visible).toBe(true)
    expect(b.lo).toBeCloseTo(40 + 30 * 2, 9)
    expect(b.hi).toBeCloseTo(40 + 30 * 5, 9)
  })
  it('re-projects under a window and clips to the plot when partly zoomed away', () => {
    const b = brushBand(plot, { start: 2, end: 6 }, { start: 0.5, end: 1.0 }, 10)
    // rows 5..9 are visible (60px each); the selection 2..6 overlaps 5..6.
    expect(b.visible).toBe(true)
    expect(b.lo).toBeCloseTo(40, 9)
    expect(b.hi).toBeCloseTo(40 + 60 * 2, 9)
  })
  it('is invisible when the window zoomed the selection away, or when nothing is visible', () => {
    expect(brushBand(plot, { start: 0, end: 1 }, { start: 0.5, end: 1.0 }, 10).visible).toBe(false)
    expect(brushBand(plot, { start: 0, end: 1 }, full, 0).visible).toBe(false)
  })
})

describe('renderBrushBand — the band', () => {
  it('draws the translucent rect and two dashed edges over the plot height, in plot space', () => {
    const cmds = renderBrushBand(plot, 100, 160, '#8496a5')
    expect(cmds.map((c) => c.kind)).toEqual(['rect', 'line', 'line'])
    const rect = cmds[0] as Extract<DrawCmd, { kind: 'rect' }>
    expect(rect.rect).toEqual({ x: 100, y: 10, w: 60, h: 150 })
    expect(rect.fill).toBe('rgba(99,102,241,0.15)')
    const edge = cmds[1] as Extract<DrawCmd, { kind: 'line' }>
    expect(edge.from).toEqual({ x: 100, y: 10 })
    expect(edge.to).toEqual({ x: 100, y: 160 })
    expect(edge.stroke).toBe('#8496a5')
    expect(edge.dash).toEqual([3, 3])
    expect((cmds[2] as Extract<DrawCmd, { kind: 'line' }>).from.x).toBe(160)
  })
})
