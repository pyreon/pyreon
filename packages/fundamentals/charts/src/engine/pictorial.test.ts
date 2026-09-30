// Pictorial bars as draw-list geometry. Every assertion is on the commands, so
// it holds for the web canvas, the SVG string and the generated native engines
// alike.
import { describe, expect, it } from 'vitest'
import { pictorialCommands, symbolPoints } from './pictorial'
import type { PictorialBar } from './pictorial'
import type { DrawCmd } from './types'

const bar = (over: Partial<PictorialBar> = {}): PictorialBar => ({
  bar: { x: 10, y: 20, w: 10, h: 100 },
  horizontal: false,
  symbol: 'rect',
  repeat: true,
  fill: '#123',
  ...over,
})
const rects = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect').map((c) => c.rect)
const CELL = { x: 0, y: 0, w: 10, h: 20 }

describe('symbolPoints — one outline per symbol', () => {
  it('circle is a 24-gon inscribed in the SHORTER side', () => {
    const pts = symbolPoints(CELL, 'circle')
    expect(pts).toHaveLength(24)
    for (const p of pts) expect(Math.hypot(p.x - 5, p.y - 10)).toBeCloseTo(5, 6)
  })

  it('diamond and triangle have their own vertex counts; anything else is the cell rectangle', () => {
    expect(symbolPoints(CELL, 'diamond')).toHaveLength(4)
    expect(symbolPoints(CELL, 'triangle')).toHaveLength(3)
    for (const s of ['rect', 'roundRect', '']) expect(symbolPoints(CELL, s), s).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }])
  })
})

describe('pictorialCommands', () => {
  it('repeats unit cells from the axis end and drops a partial last cell', () => {
    expect(rects(pictorialCommands(bar({ bar: { x: 10, y: 20, w: 10, h: 35 } })))).toEqual([
      { x: 10, y: 45, w: 10, h: 10 },
      { x: 10, y: 35, w: 10, h: 10 },
      { x: 10, y: 25, w: 10, h: 10 },
    ])
  })

  it('a whole bar of cells stops exactly at the end', () => {
    expect(pictorialCommands(bar())).toHaveLength(10)
  })

  it('a horizontal bar repeats left to right from the axis end', () => {
    expect(rects(pictorialCommands(bar({ horizontal: true, bar: { x: 10, y: 20, w: 35, h: 10 } }))).map((r) => r.x)).toEqual([10, 20, 30])
  })

  it('a zero-width bar has no unit to repeat and draws nothing', () => {
    expect(pictorialCommands(bar({ bar: { x: 0, y: 0, w: 0, h: 100 } }))).toEqual([])
  })

  it('without repeat, one symbol fills the whole bar', () => {
    expect(pictorialCommands(bar({ repeat: false }))).toEqual([{ kind: 'rect', rect: { x: 10, y: 20, w: 10, h: 100 }, fill: '#123' }])
    expect(pictorialCommands(bar({ repeat: false, horizontal: true, bar: { x: 0, y: 0, w: 50, h: 10 } }))).toEqual([{ kind: 'rect', rect: { x: 0, y: 0, w: 50, h: 10 }, fill: '#123' }])
  })

  it('each symbol draws its own shape: a circle in the shorter side, a diamond / triangle as a polygon', () => {
    const [circle] = pictorialCommands(bar({ repeat: false, symbol: 'circle' }))
    expect(circle).toEqual({ kind: 'circle', center: { x: 15, y: 70 }, radius: 5, fill: '#123' })
    for (const symbol of ['diamond', 'triangle']) {
      const cmds = pictorialCommands(bar({ symbol, bar: { x: 0, y: 0, w: 10, h: 20 } }))
      expect(cmds).toHaveLength(2)
      expect(cmds.every((c) => c.kind === 'polygon')).toBe(true)
    }
  })
})
