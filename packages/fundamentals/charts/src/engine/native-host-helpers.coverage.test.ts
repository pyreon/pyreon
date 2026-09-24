/**
 * The host-space helpers the native lowering calls: a frame moved into a
 * host's plot space, a dial fitted into a box, and a pie tooltip laid round by
 * explicit arc settings. Each is checked against the function it is defined in
 * terms of, plus a concrete case.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_ARCS, fitCircle } from './arc'
import type { Slice } from './arc'
import { pieTipAt, pieTipWith } from './chrome'
import { frameRect, frameRectAt, frameView, frameViewAt } from './frame'
import type { FrameLength, FrameSpec } from './frame'
import { renderDial, renderDialIn } from './gauge-dial'
import { readGaugeDial } from './option-gauge'

const unset: FrameLength = { mode: '', amount: 0 }
const px = (amount: number): FrameLength => ({ mode: 'px', amount })

function frame(over: Partial<FrameSpec> = {}): FrameSpec {
  return { left: px(10), top: px(20), right: unset, bottom: unset, width: px(100), height: px(80), round: false, centerX: unset, centerY: unset, radius: unset, ...over }
}

describe('frameRectAt / frameViewAt', () => {
  it('are frameRect / frameView moved by (-dx, -dy), size unchanged', () => {
    const spec = frame()
    const r = frameRect(spec, 400, 300)
    expect(frameRectAt(spec, 400, 300, 7, 3)).toEqual({ x: r.x - 7, y: r.y - 3, w: r.w, h: r.h })
    const v = frameView(spec, 400, 300)
    expect(frameViewAt(spec, 400, 300, 7, 3)).toEqual({ x: v.x - 7, y: v.y - 3, w: v.w, h: v.h })
  })

  it('a zero shift is the frame itself, and a round frame keeps its square', () => {
    const spec = frame({ round: true })
    expect(frameRectAt(spec, 400, 300, 0, 0)).toEqual(frameRect(spec, 400, 300))
    const moved = frameRectAt(spec, 400, 300, 5, 5)
    expect(moved.w).toBe(moved.h)
  })
})

describe('renderDialIn', () => {
  it('draws the dial on the circle fitted to the box', () => {
    const spec = readGaugeDial({ data: [{ value: 60, name: 'n' }] }, ['#00f'])
    const box = { x: 0, y: 0, w: 300, h: 200 }
    const fit = fitCircle(box)
    const cmds = renderDialIn(spec, box, ['#00f'])
    expect(cmds.length).toBeGreaterThan(0)
    expect(cmds).toEqual(renderDial(spec, fit.center, fit.radius, ['#00f']))
  })
})

describe('pieTipWith', () => {
  const slices: Slice[] = [
    { value: 1, label: 'a', color: '#f00' },
    { value: 3, label: 'b', color: '#0f0' },
  ]
  const box = { x: 0, y: 0, w: 200, h: 200 }

  it('gives the rows of the slice under the point, by its input index', () => {
    // Clockwise from 12 o'clock: 'a' takes the first quarter (upper right),
    // 'b' the rest (including the lower left).
    const a = pieTipWith(slices, box, 0, DEFAULT_ARCS, 140, 60)
    expect(a.length).toBeGreaterThan(0)
    expect(a).toEqual(pieTipAt(slices, 0))
    expect(pieTipWith(slices, box, 0, DEFAULT_ARCS, 60, 140)).toEqual(pieTipAt(slices, 1))
  })

  it('is empty off the pie', () => {
    expect(pieTipWith(slices, box, 0, DEFAULT_ARCS, 1, 1)).toEqual([])
  })
})
