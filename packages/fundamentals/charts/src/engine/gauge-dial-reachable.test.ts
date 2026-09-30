// `<GaugeChart dial={gaugeDial(…)}>` on the options no other spec drove: round
// caps on the axis line and the progress arc, a dial fitted into a box, an
// outlined anchor of either shape, an icon pointer, stacked (non-overlapping)
// progress arcs and a counter-clockwise dial. Assertions are on the draw list.
import { describe, expect, it } from 'vitest'
import { fitCircle } from './arc'
import { gaugeDial } from './dial'
import { iconPoints, renderDial, renderDialIn, sausagePolygon } from './gauge-dial'
import type { DrawCmd } from './types'

const center = { x: 100, y: 100 }
const ofKind = <K extends DrawCmd['kind']>(cmds: DrawCmd[], kind: K) => cmds.filter((c): c is Extract<DrawCmd, { kind: K }> => c.kind === kind)

describe('sausagePolygon', () => {
  it('is a band with a half circle past each end, centred on the band', () => {
    const pts = sausagePolygon(center, 50, 30, 0, Math.PI / 2)
    // Every point lies within the outer radius plus nothing, and the caps reach
    // the band's middle radius ± half its width.
    for (const p of pts) expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeLessThanOrEqual(50 + 1e-9)
    // The start cap reaches BEFORE angle 0: below the x axis (negative y side).
    expect(pts.some((p) => p.y < center.y - 1)).toBe(true)
  })

  it('a negative inner radius clamps to the centre', () => {
    const pts = sausagePolygon(center, 20, -5, 0, 1)
    for (const p of pts) expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeLessThanOrEqual(20 + 1e-9)
  })
})

describe('round caps', () => {
  it('lineRound and progressRound draw sausages, square ends do not', () => {
    const square = renderDial(gaugeDial({ data: [40], progressShow: true }), center, 80)
    const round = renderDial(gaugeDial({ data: [40], lineRound: true, progressShow: true, progressRound: true }), center, 80)
    // A sausage carries its two 13-point caps on top of the arc samples.
    const longest = (cmds: DrawCmd[]) => Math.max(...ofKind(cmds, 'polygon').map((p) => p.points.length))
    expect(longest(round)).toBeGreaterThan(longest(square))
    expect(ofKind(round, 'polygon').length).toBe(ofKind(square, 'polygon').length)
  })

  it('a full-turn band keeps square ends even when round is asked', () => {
    const full = gaugeDial({ data: [100], startAngle: 90, endAngle: -270, lineRound: true })
    const cmds = renderDial(full, center, 80)
    expect(ofKind(cmds, 'polygon').length).toBeGreaterThan(0)
  })
})

describe('renderDialIn', () => {
  it('is renderDial on the circle fitted into the box, a datum without a colour taking the palette', () => {
    const dial = gaugeDial({ data: [25, 75] })
    const box = { x: 10, y: 20, w: 300, h: 200 }
    const fit = fitCircle(box)
    expect(renderDialIn(dial, box, ['#aa0000', '#00aa00'])).toEqual(renderDial(dial, fit.center, fit.radius, ['#aa0000', '#00aa00']))
    const pointers = ofKind(renderDialIn(dial, box, ['#aa0000', '#00aa00']), 'polygon').filter((p) => p.fill === '#aa0000' || p.fill === '#00aa00')
    expect(pointers.map((p) => p.fill).sort()).toEqual(['#00aa00', '#aa0000'])
  })
})

describe('anchor', () => {
  it('an outlined circle anchor is a border ring under the fill', () => {
    const cmds = renderDial(gaugeDial({ data: [10], anchorShow: true, anchorSize: 10, anchorBorderWidth: 2, anchorColor: '#ffffff', anchorBorder: '#000000' }), center, 80)
    const ring = ofKind(cmds, 'circle').find((c) => c.fill === '#000000')!
    const fill = ofKind(cmds, 'circle').find((c) => c.fill === '#ffffff')!
    expect(ring.radius).toBe(6)
    expect(fill.radius).toBe(4)
    expect(cmds.indexOf(ring)).toBeLessThan(cmds.indexOf(fill))
  })

  it('a plain circle anchor is one circle; a shaped anchor with a border is outlined', () => {
    const plain = renderDial(gaugeDial({ data: [10], anchorShow: true, anchorSize: 10, anchorColor: '#123456' }), center, 80)
    expect(ofKind(plain, 'circle').find((c) => c.fill === '#123456')!.radius).toBe(5)
    const shaped = renderDial(gaugeDial({ data: [10], anchorShow: true, anchorIcon: 'diamond', anchorSize: 10, anchorBorderWidth: 1.5, anchorBorder: '#abcdef' }), center, 80)
    const outline = ofKind(shaped, 'polyline').find((c) => c.stroke === '#abcdef')!
    // The outline closes back on its first point.
    expect(outline.points[0]).toEqual(outline.points[outline.points.length - 1])
    expect(outline.points).toHaveLength(5)
  })
})

describe('pointer and progress', () => {
  it('an icon pointer is the icon turned to the value; the arrow starts at its cell centre', () => {
    const arrow = iconPoints('arrow', { x: 0, y: 0, w: 6, h: 12 })
    expect(arrow[0]).toEqual({ x: 3, y: 6 })
    expect(arrow).toHaveLength(4)
    const cmds = renderDial(gaugeDial({ data: [{ value: 50, pointerColor: '#ff00ff' }], pointerIcon: 'arrow' }), center, 80)
    expect(ofKind(cmds, 'polygon').find((p) => p.fill === '#ff00ff')!.points).toHaveLength(4)
  })

  it('non-overlapping progress arcs step inward, one ring per value', () => {
    const cmds = renderDial(gaugeDial({ data: [{ value: 50, progressColor: '#111111' }, { value: 50, progressColor: '#222222' }], progressShow: true, progressOverlap: false, lineWidth: 20 }), center, 80)
    const reach = (fill: string) => Math.max(...ofKind(cmds, 'polygon').find((p) => p.fill === fill)!.points.map((p) => Math.hypot(p.x - center.x, p.y - center.y)))
    expect(reach('#111111')).toBeCloseTo(80, 6)
    expect(reach('#222222')).toBeCloseTo(70, 6)
  })

  it('a counter-clockwise dial points the other way for the same value', () => {
    const cw = renderDial(gaugeDial({ data: [{ value: 25, pointerColor: '#0000ff' }], startAngle: 180, endAngle: 0 }), center, 80)
    const ccw = renderDial(gaugeDial({ data: [{ value: 25, pointerColor: '#0000ff' }], startAngle: 180, endAngle: 0, clockwise: false }), center, 80)
    const tip = (cmds: DrawCmd[]) => {
      const pts = ofKind(cmds, 'polygon').find((p) => p.fill === '#0000ff')!.points
      return pts.reduce((a, b) => (Math.hypot(b.x - center.x, b.y - center.y) > Math.hypot(a.x - center.x, a.y - center.y) ? b : a))
    }
    // Clockwise from 9 o'clock over the top: a quarter lands upper-left; counter-clockwise, lower-left.
    expect(tip(cw).y).toBeLessThan(center.y)
    expect(tip(ccw).y).toBeGreaterThan(center.y)
  })
})
