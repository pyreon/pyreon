/**
 * The `clip` / `unclip` draw commands, executed in real Chromium: a command
 * between them paints only inside the clip rect, clips nest, an unmatched
 * `unclip` never undoes the frame's own state, and an unclosed clip does not
 * leak into the next frame.
 */
import { describe, expect, it } from 'vitest'
import { paint } from './canvas-web'
import type { DrawCmd } from './types'

const W = 100
const H = 60
function frame(cmds: DrawCmd[], ctx?: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const c = ctx ?? document.createElement('canvas').getContext('2d')!
  c.canvas.width = W
  c.canvas.height = H
  paint(c, cmds, W, H, 'sans-serif')
  return c
}
const red = (ctx: CanvasRenderingContext2D, x: number, y: number): boolean => {
  const d = ctx.getImageData(x, y, 1, 1).data
  return d[0]! > 200 && d[1]! < 50 && d[2]! < 50 && d[3]! > 200
}
const FULL: DrawCmd = { kind: 'rect', rect: { x: 0, y: 0, w: W, h: H }, fill: '#ff0000' }

describe('clip / unclip on the web canvas', () => {
  it('paints only inside the clip, and paints freely after the unclip', () => {
    const ctx = frame([{ kind: 'clip', rect: { x: 10, y: 10, w: 20, h: 20 } }, FULL, { kind: 'unclip' }])
    expect(red(ctx, 15, 15)).toBe(true)
    expect(red(ctx, 50, 15)).toBe(false)
    const after = frame([{ kind: 'clip', rect: { x: 10, y: 10, w: 20, h: 20 } }, { kind: 'unclip' }, FULL])
    expect(red(after, 50, 15)).toBe(true)
  })

  it('clips nest: the inner one narrows the outer', () => {
    const ctx = frame([
      { kind: 'clip', rect: { x: 0, y: 0, w: 50, h: H } },
      { kind: 'clip', rect: { x: 40, y: 0, w: 60, h: H } },
      FULL,
      { kind: 'unclip' },
      { kind: 'unclip' },
    ])
    expect(red(ctx, 45, 30)).toBe(true)
    expect(red(ctx, 20, 30)).toBe(false)
    expect(red(ctx, 70, 30)).toBe(false)
  })

  it('an unmatched unclip is ignored; an unclosed clip does not reach the next frame', () => {
    const ctx = frame([{ kind: 'unclip' }, FULL])
    expect(red(ctx, 50, 30)).toBe(true)
    const shared = frame([{ kind: 'clip', rect: { x: 0, y: 0, w: 5, h: 5 } }, FULL])
    frame([FULL], shared)
    expect(red(shared, 50, 30)).toBe(true)
  })
})
