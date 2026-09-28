/**
 * The dial's drawing branches: label rotation modes, the empty/over-range colour stops,
 * a degenerate range, the auto colours, each element turned off, the detail
 * box's explicit height, the anchor's placement and border, and the
 * non-overlapping progress rings.
 */
import { describe, expect, it } from 'vitest'
import { dialColor, dialLen, iconPoints, pointerPoints, renderDial } from './gauge-dial'
import type { DialSpec } from './gauge-dial'
import { gaugeDial } from './dial'
import type { DrawCmd } from './types'

type TextCmd = Extract<DrawCmd, { kind: 'text' }>
type PolygonCmd = Extract<DrawCmd, { kind: 'polygon' }>
type LineCmd = Extract<DrawCmd, { kind: 'line' }>
type CircleCmd = Extract<DrawCmd, { kind: 'circle' }>

const at = { x: 100, y: 100 }
const texts = (cmds: DrawCmd[]): TextCmd[] => cmds.filter((c): c is TextCmd => c.kind === 'text')
const polygons = (cmds: DrawCmd[]): PolygonCmd[] => cmds.filter((c): c is PolygonCmd => c.kind === 'polygon')
const lines = (cmds: DrawCmd[]): LineCmd[] => cmds.filter((c): c is LineCmd => c.kind === 'line')
const circles = (cmds: DrawCmd[]): CircleCmd[] => cmds.filter((c): c is CircleCmd => c.kind === 'circle')

/** A default dial with one datum, coloured '#00f' by the palette. */
function spec(over: Partial<DialSpec> = {}, value = 50): DialSpec {
  return { ...gaugeDial({ data: [{ value, name: 'n', color: '#00f' }] }), ...over }
}

describe('dialColor edges', () => {
  it('no stops paints black; a fraction past the last stop takes the last colour', () => {
    expect(dialColor([], 0.5)).toBe('#000')
    const stops = [{ at: 0.3, color: 'a' }, { at: 0.6, color: 'b' }]
    expect(dialColor(stops, 0.9)).toBe('b')
    expect(dialColor(stops, 0.45)).toBe('b')
  })

  it('dialLen resolves a percent against the radius and passes pixels through', () => {
    expect(dialLen({ v: 0.25, pct: true }, 80)).toBe(20)
    expect(dialLen({ v: 7, pct: false }, 80)).toBe(7)
  })
})

describe('renderDial label rotation', () => {

  it('radial labels turn with the dial, flipping past a quarter turn', () => {
    const cmds = renderDial(spec({ labelRotate: 'radial' }), at, 100)
    const zero = texts(cmds).find((t) => t.text === '0')!
    // Start angle -225°: rot = 225° + 360° = 585°, past 90° so +180° → 765°, drawn as -765°.
    expect(zero.rotate).toBeCloseTo(-765, 6)
    expect(zero).toMatchObject({ align: 'middle', baseline: 'middle' })
  })


  it('tangential and fixed rotations', () => {
    const tan = texts(renderDial(spec({ labelRotate: 'tangential' }), at, 100)).find((t) => t.text === '0')!
    // rot = 225° - 90° = 135°, drawn as -135°.
    expect(tan.rotate).toBeCloseTo(-135, 6)
    const fixed = texts(renderDial(spec({ labelRotate: 'fixed', labelDegrees: 30 }), at, 100)).find((t) => t.text === '0')!
    expect(fixed.rotate).toBeCloseTo(-30, 6)
  })

  it('an auto label colour takes the axis band at its place', () => {
    const d = spec({ labelColor: '', stops: [{ at: 0.5, color: '#0a0' }, { at: 1, color: '#a00' }] })
    const cmds = texts(renderDial(d, at, 100))
    expect(cmds.find((t) => t.text === '10')!.fill).toBe('#0a0')
    expect(cmds.find((t) => t.text === '90')!.fill).toBe('#a00')
  })
})

describe('renderDial split lines and ticks', () => {
  it("'auto' split and tick colours follow the bands", () => {
    const d = spec({ splitColor: 'auto', tickColor: 'auto', stops: [{ at: 0.5, color: '#0a0' }, { at: 1, color: '#a00' }] })
    const ls = lines(renderDial(d, at, 100))
    const splits = ls.filter((l) => l.width === d.splitWidth)
    const ticks = ls.filter((l) => l.width === d.tickWidth)
    expect(splits[0]!.stroke).toBe('#0a0')
    expect(splits[splits.length - 1]!.stroke).toBe('#a00')
    expect(new Set(ticks.map((t) => t.stroke))).toEqual(new Set(['#0a0', '#a00']))
  })

  it('a zero distance puts split lines and ticks right at the axis line', () => {
    const d = spec({ splitDistance: 0, tickDistance: 0, labelShow: false })
    const ls = lines(renderDial(d, at, 100))
    // The first split line starts lineWidth (10) in from the rim.
    const first = ls[0]!
    expect(Math.hypot(first.from.x - at.x, first.from.y - at.y)).toBeCloseTo(90, 6)
    const tick = ls.find((l) => l.width === d.tickWidth)!
    expect(Math.hypot(tick.from.x - at.x, tick.from.y - at.y)).toBeCloseTo(90, 6)
  })

  it('without ticks the walk still lands every split line on its step', () => {
    const d = spec({ tickShow: false, labelShow: false })
    const ls = lines(renderDial(d, at, 100))
    expect(ls).toHaveLength(d.splitNumber + 1)
    // The last split line is at -45°: down-right of the centre.
    const last = ls[ls.length - 1]!
    const a = Math.atan2(last.from.y - at.y, last.from.x - at.x)
    expect(a).toBeCloseTo(Math.PI / 4, 6)
  })

  it('every dial element can be turned off', () => {
    const d = spec({ lineShow: false, splitShow: false, tickShow: false, labelShow: false, titleShow: false, detailShow: false, pointerShow: false })
    expect(renderDial(d, at, 100)).toEqual([])
  })
})

describe('renderDial title, detail and anchor', () => {
  it('with the pointer not above, the texts paint after the pointer', () => {
    const cmds = renderDial(spec({ pointerAbove: false }), at, 100)
    const pointer = cmds.findIndex((c) => c.kind === 'polygon' && c.fill === '#00f')
    const title = cmds.findIndex((c) => c.kind === 'text' && c.text === 'n')
    expect(pointer).toBeGreaterThanOrEqual(0)
    expect(title).toBeGreaterThan(pointer)
    const above = renderDial(spec({ pointerAbove: true }), at, 100)
    expect(above.findIndex((c) => c.kind === 'text' && c.text === 'n')).toBeLessThan(above.findIndex((c) => c.kind === 'polygon' && c.fill === '#00f'))
  })

  it('an explicit detail height sizes the box instead of the font', () => {
    const cmds = renderDial(spec({ detailBg: '#eee', detailHeight: 20, detailPadding: [1, 2, 3, 4] }), at, 100)
    expect(cmds.find((c) => c.kind === 'rect')).toMatchObject({ rect: { w: 106, h: 24 } })
  })

  it('a border without a fill draws only the outline', () => {
    const cmds = renderDial(spec({ detailBg: '', detailBorderWidth: 2, detailBorder: '#999' }), at, 100)
    expect(cmds.filter((c) => c.kind === 'rect')).toHaveLength(0)
    const outline = cmds.filter((c) => c.kind === 'polyline')
    expect(outline).toHaveLength(1)
    expect(outline[0]).toMatchObject({ stroke: '#999', width: 2 })
  })

  it("an unset detail colour is the datum's with progress, the band's without", () => {
    const withProgress = texts(renderDial(spec({ detailColor: '', progressShow: true }), at, 100)).find((t) => t.text === '50' && t.size === 30)!
    expect(withProgress.fill).toBe('#00f')
    const bands = [{ at: 0.4, color: '#0a0' }, { at: 1, color: '#a00' }]
    const without = texts(renderDial(spec({ detailColor: '', progressShow: false, stops: bands }), at, 100)).find((t) => t.text === '50' && t.size === 30)!
    expect(without.fill).toBe('#a00')
  })

  it('a non-bold detail carries no weight', () => {
    const detail = texts(renderDial(spec({ detailBold: false }), at, 100)).find((t) => t.size === 30)!
    expect(detail.weight).toBeUndefined()
  })

  it('an above circle anchor with a border is a border disc under a fill disc, painted last', () => {
    const cmds = renderDial(spec({ anchorShow: true, anchorAbove: true, anchorSize: 10, anchorBorderWidth: 2, anchorColor: '#fff', anchorBorder: '#123' }), at, 100)
    const cs = circles(cmds)
    expect(cs).toEqual([
      { kind: 'circle', center: at, radius: 6, fill: '#123' },
      { kind: 'circle', center: at, radius: 4, fill: '#fff' },
    ])
    // z 1 puts the anchor after the pointer (z 0).
    expect(cmds.indexOf(cs[0]!)).toBeGreaterThan(cmds.findIndex((c) => c.kind === 'polygon' && c.fill === '#00f'))
  })

  it('an icon anchor without a border is a single polygon', () => {
    const cmds = renderDial(spec({ anchorShow: true, anchorIcon: 'rect', anchorSize: 10, anchorColor: '#abc' }), at, 100)
    expect(polygons(cmds).filter((p) => p.fill === '#abc')).toHaveLength(1)
    expect(cmds.filter((c) => c.kind === 'polyline')).toHaveLength(0)
  })
})

describe('renderDial pointer and progress', () => {
  it("pointer colour: 'auto' takes the band, an explicit colour wins, else the datum's", () => {
    const bands = [{ at: 0.4, color: '#0a0' }, { at: 1, color: '#a00' }]
    const dataAuto = { ...spec().data[0]!, pointerColor: 'auto' }
    const auto = polygons(renderDial(spec({ stops: bands, lineShow: false, data: [dataAuto] }), at, 100))
    expect(auto.map((p) => p.fill)).toEqual(['#a00'])
    const dataOwn = { ...spec().data[0]!, pointerColor: '#f0f' }
    const own = polygons(renderDial(spec({ lineShow: false, data: [dataOwn] }), at, 100))
    expect(own.map((p) => p.fill)).toEqual(['#f0f'])
  })

  it("progress colour: 'auto' takes the band, an explicit colour wins", () => {
    const bands = [{ at: 0.4, color: '#0a0' }, { at: 1, color: '#a00' }]
    const base = { ...spec().data[0]!, progressColor: 'auto' }
    const auto = polygons(renderDial(spec({ stops: bands, lineShow: false, pointerShow: false, progressShow: true, data: [base] }), at, 100))
    expect(auto.map((p) => p.fill)).toEqual(['#a00'])
    const own = polygons(renderDial(spec({ lineShow: false, pointerShow: false, progressShow: true, data: [{ ...base, progressColor: '#ff0' }] }), at, 100))
    expect(own.map((p) => p.fill)).toEqual(['#ff0'])
  })

  it('a degenerate range puts the value at the start, and progress spans nothing', () => {
    const d = spec({ min: 5, max: 5, lineShow: false, progressShow: true, splitShow: false, tickShow: false, labelShow: false }, 5)
    const cmds = renderDial(d, at, 100)
    // The needle points at the start angle, -225° (canvas 135°): down-left of the centre.
    const needle = polygons(cmds).find((p) => p.points.length === 4)!
    const tip = needle.points[2]!
    expect(Math.atan2(tip.y - at.y, tip.x - at.x)).toBeCloseTo((135 * Math.PI) / 180, 6)
    const arc = polygons(cmds).find((p) => p.points.length !== 4)!
    const angles = new Set(arc.points.map((p) => Math.atan2(p.y - at.y, p.x - at.x).toFixed(6)))
    expect(angles.size).toBe(1)
  })

  it('an unclipped progress runs past the end of the dial', () => {
    const d = spec({ lineShow: false, pointerShow: false, progressShow: true, splitShow: false, tickShow: false, labelShow: false, detailShow: false, titleShow: false }, 150)
    const clipped = polygons(renderDial({ ...d, progressClip: true }, at, 100))[0]!
    const free = polygons(renderDial({ ...d, progressClip: false }, at, 100))[0]!
    expect(free.points.length).toBeGreaterThanOrEqual(clipped.points.length)
    // Clipped ends at -45° (the dial's end); unclipped sweeps 1.5× the dial, to 180°.
    const reach = (p: PolygonCmd): number => Math.max(...p.points.map((q) => Math.round(Math.atan2(q.y - at.y, q.x - at.x) * 1e6)))
    expect(reach(free)).toBeGreaterThan(reach(clipped))
  })

})

describe('pointerPoints and iconPoints', () => {
  it('a wide needle has a short tail (k = 1), a thin one a longer tail (k = 2)', () => {
    // Pointing up (-PI/2) the local frame is the canvas frame; the tail is point 0.
    const wide = pointerPoints({ x: 0, y: 0 }, -Math.PI / 2, 30, 10, 0, 0)
    expect(wide[0]!.y).toBeCloseTo(10, 9)
    const thin = pointerPoints({ x: 0, y: 0 }, -Math.PI / 2, 30, 5, 0, 0)
    expect(thin[0]!.y).toBeCloseTo(10, 9)
    expect(thin[2]!.y).toBeCloseTo(-30, 9)
  })

  it("'emptyCircle' draws as a circle", () => {
    const cell = { x: 0, y: 0, w: 10, h: 10 }
    expect(iconPoints('emptyCircle', cell)).toEqual(iconPoints('circle', cell))
  })
})
