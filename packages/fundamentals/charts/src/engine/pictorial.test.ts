import { describe, expect, it } from 'vitest'
import { clipPolygonToRect, pictorialCommands, rotatePoints, symbolPoints } from './pictorial'
import type { PictorialBar } from './pictorial'
import type { DrawCmd } from './types'

/**
 * ECharts' pictorial keys as draw-list geometry. Every assertion is on the
 * commands, so it holds for the web canvas, the SVG string and the generated
 * native engines alike.
 */
const bar = (over: Partial<PictorialBar> = {}): PictorialBar => ({
  bar: { x: 10, y: 20, w: 10, h: 100 },
  horizontal: false,
  symbol: 'rect',
  repeat: true,
  fill: '#123',
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
const rects = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect').map((c) => c.rect)
const polys = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'polygon' }> => c.kind === 'polygon')

describe('pictorial geometry', () => {
  it('repeats unit cells from the axis end and drops a partial cell without clip', () => {
    const cmds = pictorialCommands(bar({ bar: { x: 10, y: 20, w: 10, h: 35 } }))
    expect(rects(cmds)).toEqual([
      { x: 10, y: 45, w: 10, h: 10 },
      { x: 10, y: 35, w: 10, h: 10 },
      { x: 10, y: 25, w: 10, h: 10 },
    ])
  })

  it('symbolClip keeps the partial cell, clipped to the bar', () => {
    const cmds = pictorialCommands(bar({ bar: { x: 10, y: 20, w: 10, h: 35 }, clip: true }))
    expect(cmds).toHaveLength(4)
    const last = polys(cmds)[3]!
    const ys = last.points.map((p) => p.y)
    expect(Math.min(...ys)).toBe(20)
    expect(Math.max(...ys)).toBe(25)
  })

  it('symbolMargin spaces the cells; symbolPosition end / center move the run along the bar', () => {
    const spaced = rects(pictorialCommands(bar({ bar: { x: 10, y: 20, w: 10, h: 50 }, margin: 5 })))
    expect(spaced.map((r) => r.y)).toEqual([60, 45, 30])
    const single = (position: string) => rects(pictorialCommands(bar({ repeat: false, position, hasBounding: true, boundingLength: 40 })))[0]!
    expect(single('start').y).toBe(80)
    expect(single('end').y).toBe(20)
    expect(single('center').y).toBe(50)
  })

  it('symbolBoundingData sizes the run; with clip the bar shows the covered fraction, without it the whole symbol overhangs', () => {
    const clipped = pictorialCommands(bar({ repeat: false, clip: true, hasBounding: true, boundingLength: 160, symbol: 'triangle' }))
    const ys = polys(clipped)[0]!.points.map((p) => p.y)
    expect(Math.min(...ys)).toBe(20)
    expect(Math.max(...ys)).toBe(120)
    const whole = rects(pictorialCommands(bar({ repeat: false, hasBounding: true, boundingLength: 160 })))[0]!
    expect(whole).toEqual({ x: 10, y: -40, w: 10, h: 160 })
  })

  it('symbolOffset nudges every symbol; symbolRotate turns a rect into a rotated polygon and leaves a circle a circle', () => {
    const nudged = rects(pictorialCommands(bar({ bar: { x: 10, y: 20, w: 10, h: 20 }, offsetX: 3, offsetY: -4 })))
    expect(nudged[0]).toEqual({ x: 13, y: 26, w: 10, h: 10 })
    const turned = pictorialCommands(bar({ bar: { x: 0, y: 0, w: 10, h: 10 }, rotate: 90 }))
    expect(turned[0]!.kind).toBe('polygon')
    const pts = (turned[0] as Extract<DrawCmd, { kind: 'polygon' }>).points
    // A 90° turn of a square about its centre is the same square (up to vertex order).
    for (const p of pts) {
      expect([0, 10]).toContain(Math.round(p.x))
      expect([0, 10]).toContain(Math.round(p.y))
    }
    const round = pictorialCommands(bar({ bar: { x: 0, y: 0, w: 10, h: 10 }, rotate: 45, symbol: 'circle', repeat: false }))
    expect(round[0]!.kind).toBe('polygon') // rotated → polygon form, still 24 points
    expect((round[0] as Extract<DrawCmd, { kind: 'polygon' }>).points).toHaveLength(24)
    expect(pictorialCommands(bar({ bar: { x: 0, y: 0, w: 10, h: 10 }, symbol: 'circle', repeat: false }))[0]!.kind).toBe('circle')
  })

  it('horizontal bars run left to right from the axis end', () => {
    const cmds = rects(pictorialCommands(bar({ horizontal: true, bar: { x: 10, y: 20, w: 35, h: 10 } })))
    expect(cmds.map((r) => r.x)).toEqual([10, 20, 30])
  })

  it('clipPolygonToRect and rotatePoints are exact on the shapes they are used for', () => {
    // A vertex ON the clip edge duplicates itself (harmless to any painter); compare the unique corner set.
    const unique = (pts: { x: number; y: number }[]) => [...new Set(pts.map((p) => `${p.x},${p.y}`))].sort()
    expect(unique(clipPolygonToRect(symbolPoints({ x: 0, y: 0, w: 10, h: 10 }, 'diamond'), { x: 0, y: 0, w: 10, h: 5 }))).toEqual(unique([{ x: 5, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }]))
    expect(clipPolygonToRect(symbolPoints({ x: 0, y: 0, w: 10, h: 10 }, 'rect'), { x: 20, y: 20, w: 5, h: 5 })).toEqual([])
    const r = rotatePoints([{ x: 10, y: 0 }], { x: 0, y: 0 }, 90)
    expect(Math.round(r[0]!.x)).toBe(0)
    expect(Math.round(r[0]!.y)).toBe(10)
  })
})
