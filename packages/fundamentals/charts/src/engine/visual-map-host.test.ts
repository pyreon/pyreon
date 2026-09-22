import { describe, expect, it } from 'vitest'
import { visualMapHost } from './visual-map-host'
import { visualStripOf } from './visual-map'
import type { VisualMapSpec } from './visual-map'
import { visualStripSize } from './visual-strip'

// The same geometry `visual-strip.test.ts`'s `base` fixture uses: fontSize 10,
// itemSize 16, itemLength 100, gap 4 — so the bar top sits at 14 and a value
// 25% down the 100px bar is at +25, matching that file's known coordinates.
const CONTINUOUS: VisualMapSpec = {
  type: 'continuous',
  stops: ['#000000', '#ffffff'],
  domain: [0, 100],
  pieces: [],
  orient: 'vertical',
  text: undefined,
  fontSize: 10,
  labelColor: '#333333',
  itemSize: 16,
  itemLength: 100,
  calculable: true,
  range: [25, 75],
  selected: [],
  inactiveColor: '#cccccc',
}
const PIECEWISE: VisualMapSpec = {
  ...CONTINUOUS,
  type: 'piecewise',
  calculable: false,
  pieces: [{ label: 'high', color: '#ff0000', min: 50 }, { label: 'low', color: '#0000ff', max: 50 }],
  selected: [true, true],
}
/** A box exactly the strip's own size, so `visualStripPlace` anchors it at the origin. */
const boxFor = (spec: VisualMapSpec): { x: number; y: number; w: number; h: number } => {
  const size = visualStripSize(visualStripOf(spec))
  return { x: 0, y: 0, w: size.x, h: size.y }
}

describe('visualMapHost', () => {
  it('current/chartBox/cmds/selection all fall back to "no visualMap" when read() has none', () => {
    const host = visualMapHost(() => undefined)
    expect(host.current()).toBeUndefined()
    const box = { x: 0, y: 0, w: 200, h: 200 }
    expect(host.chartBox(box)).toEqual(box)
    expect(host.cmds(box)).toEqual([])
    expect(host.selection()).toEqual({})
    expect(host.start(box, 0, 0)).toBe(false)
    expect(host.click(box, 0, 0)).toBe(false)
    host.move(box, 0, 0) // no-op: nothing to throw on
    host.end()
    host.track()
  })

  it('chartBox reserves the strip\'s space and cmds renders it, for a real spec', () => {
    const host = visualMapHost(() => CONTINUOUS)
    const box = { x: 0, y: 0, w: 300, h: 300 }
    const reserved = host.chartBox(box)
    expect(reserved.w).toBeLessThan(box.w)
    expect(host.cmds(box).length).toBeGreaterThan(0)
    expect(host.selection()).toEqual({ domain: { min: 0, max: 100 }, inRange: { min: 25, max: 75 }, outColor: '#cccccc' })
  })

  it('a press on a handle starts a drag; move reports the new range; end releases the handle', () => {
    const reports: unknown[] = []
    const host = visualMapHost(() => CONTINUOUS, (s) => reports.push(s))
    const box = boxFor(CONTINUOUS)
    // Off any handle: no drag starts, and a move before a successful start is a no-op.
    expect(host.start(box, 200, 200)).toBe(false)
    host.move(box, 5, 14 + 40)
    expect(reports).toEqual([])
    // On the high handle (value 75, 25% down a 100px bar — visual-strip.test.ts's own coordinates).
    expect(host.start(box, 20, 14 + 25)).toBe(true)
    host.move(box, 5, 14 + 40)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ range: [25, 60] })
    // current() reflects the live drag, not the spec's original range.
    expect(host.current()!.range).toEqual([25, 60])
    host.end()
    // After end(), a move is inert again (handle reset to -1).
    host.move(box, 5, 14 + 10)
    expect(reports).toHaveLength(1)
  })

  it('a click on a piece toggles it and reports; a miss reports nothing', () => {
    const reports: unknown[] = []
    const host = visualMapHost(() => PIECEWISE, (s) => reports.push(s))
    const box = boxFor(PIECEWISE)
    expect(host.click(box, 500, 500)).toBe(false)
    expect(reports).toEqual([])
    expect(host.click(box, 5, 5)).toBe(true)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ selected: [false, true] })
    expect(host.current()!.selected).toEqual([false, true])
    // Toggling again flips it back.
    expect(host.click(box, 5, 5)).toBe(true)
    expect(reports).toHaveLength(2)
    expect(reports[1]).toMatchObject({ selected: [true, true] })
  })

  it('works with no onChange callback at all (an optional dependency, not a required one)', () => {
    const host = visualMapHost(() => PIECEWISE)
    const box = boxFor(PIECEWISE)
    expect(() => host.click(box, 5, 5)).not.toThrow()
    const cont = visualMapHost(() => CONTINUOUS)
    const cbox = boxFor(CONTINUOUS)
    cont.start(cbox, 20, 14 + 25)
    expect(() => cont.move(cbox, 5, 14 + 40)).not.toThrow()
  })
})
