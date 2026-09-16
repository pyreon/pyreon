import { describe, expect, it } from 'vitest'
import { arcSweep, bezierPoints, graphicDrawCommands } from './graphic'
import type { GraphicElement } from './graphic'
import { graphicCommands } from './option-layer'
import type { DrawCmd } from './types'

/**
 * The round and curved `graphic` elements — `arc`, `ring`, `sector` and
 * `bezierCurve`. Every assertion is on the commands, so it holds for the web
 * canvas, the SVG string and the generated native engines alike.
 */
const TAU = Math.PI * 2
const el = (over: Partial<GraphicElement>): GraphicElement => ({
  kind: 'rect', x: 0, y: 0, w: 0, h: 0, fill: '#111', stroke: '#222', lineWidth: 1,
  text: '', fontSize: 12, align: 'start',
  cx: 0, cy: 0, r: 0, r0: 0, startAngle: 0, endAngle: 0, clockwise: true, points: [],
  ...over,
})
const polys = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'polygon' }> => c.kind === 'polygon')
const lines = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'polyline' }> => c.kind === 'polyline')
const radii = (pts: { x: number; y: number }[], cx: number, cy: number) => pts.map((p) => Math.hypot(p.x - cx, p.y - cy))

describe('graphic — round shapes', () => {
  it('a sector fills from the centre; a ring fills a full band with its hole', () => {
    const sector = polys(graphicDrawCommands([el({ kind: 'sector', cx: 50, cy: 50, r: 20, startAngle: 0, endAngle: Math.PI / 2 })]))[0]!
    const rs = radii(sector.points, 50, 50)
    expect(Math.max(...rs)).toBeCloseTo(20, 6)
    // A sector closes through its centre, so its nearest point IS the centre.
    expect(Math.min(...rs)).toBeCloseTo(0, 6)
    expect(sector.fill).toBe('#111')

    const ring = polys(graphicDrawCommands([el({ kind: 'ring', cx: 10, cy: 10, r: 8, r0: 5 })]))[0]!
    const rr = radii(ring.points, 10, 10)
    expect(Math.max(...rr)).toBeCloseTo(8, 6)
    expect(Math.min(...rr)).toBeCloseTo(5, 6)
  })

  it('an arc is the OUTER edge only, stroked — never closed through the centre', () => {
    const arc = lines(graphicDrawCommands([el({ kind: 'arc', cx: 0, cy: 0, r: 12, startAngle: 0, endAngle: Math.PI, stroke: '#0f0', lineWidth: 3 })]))[0]!
    for (const r of radii(arc.points, 0, 0)) expect(r).toBeCloseTo(12, 6)
    expect(arc.stroke).toBe('#0f0')
    expect(arc.width).toBe(3)
    // Half a turn: it starts at +x and ends at -x.
    expect(arc.points[0]!.x).toBeCloseTo(12, 6)
    expect(arc.points[arc.points.length - 1]!.x).toBeCloseTo(-12, 6)
  })

  it('arcSweep runs forward for clockwise, from the far end for counter-clockwise, and never exceeds a full turn', () => {
    expect(arcSweep(0, Math.PI, true)).toEqual({ x: 0, y: Math.PI })
    // Counter-clockwise walks the same arc from its END.
    expect(arcSweep(0, Math.PI, false)).toEqual({ x: Math.PI, y: TAU })
    // A wrapped sweep completes through zero rather than going backwards.
    const wrapped = arcSweep(Math.PI * 1.5, Math.PI * 0.5, true)
    expect(wrapped.y - wrapped.x).toBeCloseTo(Math.PI, 6)
    const full = arcSweep(0, TAU * 3, true)
    expect(full.y - full.x).toBeCloseTo(TAU, 6)
  })

  it('a bezier samples a cubic and a quadratic through their endpoints', () => {
    const cubic = bezierPoints([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }])
    expect(cubic[0]).toEqual({ x: 0, y: 0 })
    expect(cubic[cubic.length - 1]).toEqual({ x: 10, y: 0 })
    // Symmetric control polygon → the midpoint sits on the axis of symmetry.
    expect(cubic[Math.floor(cubic.length / 2)]!.x).toBeCloseTo(5, 6)
    const quad = bezierPoints([{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }])
    expect(quad[0]).toEqual({ x: 0, y: 0 })
    expect(quad[quad.length - 1]).toEqual({ x: 10, y: 0 })
    expect(quad[Math.floor(quad.length / 2)]!.y).toBeGreaterThan(0)
    // Fewer than three control points describe no curve.
    expect(bezierPoints([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }])
  })
})

describe('graphic — the option facade', () => {
  it('reads arc / ring / sector / bezierCurve off the option with zero warnings, positioned by the element origin', () => {
    const { cmds, warnings } = graphicCommands({
      graphic: [
        { type: 'sector', x: 100, y: 100, shape: { cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: Math.PI / 2 }, style: { fill: '#abc' } },
        { type: 'ring', shape: { cx: 5, cy: 5, r: 4, r0: 2 } },
        { type: 'arc', shape: { cx: 0, cy: 0, r: 6, startAngle: 0, endAngle: 1, clockwise: false } },
        { type: 'bezierCurve', shape: { x1: 0, y1: 0, cpx1: 5, cpy1: 5, x2: 10, y2: 0 } },
      ],
    }, 200, 200)
    expect(warnings).toEqual([])
    const sector = polys(cmds)[0]!
    expect(sector.fill).toBe('#abc')
    for (const r of radii(sector.points.filter((p) => p.x !== 100 || p.y !== 100), 100, 100)) expect(r).toBeCloseTo(10, 6)
    expect(polys(cmds)).toHaveLength(2)
    expect(lines(cmds)).toHaveLength(2)
  })

  it('names an image element and an unknown type instead of drawing nothing silently', () => {
    const { cmds, warnings } = graphicCommands({ graphic: [{ type: 'image', style: { image: 'logo.png' } }, { type: 'compoundPath' }] }, 100, 100)
    expect(cmds).toEqual([])
    expect(warnings.map((w) => w.path)).toEqual(['graphic[0].type', 'graphic[1].type'])
    expect(warnings[0]!.message).toContain('image')
    expect(warnings[1]!.message).toContain('compoundPath')
  })

  it('a group still offsets its children, and the new shapes ride along', () => {
    const { cmds } = graphicCommands({
      graphic: [{ type: 'group', left: 20, top: 30, children: [{ type: 'ring', shape: { cx: 0, cy: 0, r: 5, r0: 1 } }] }],
    }, 100, 100)
    const ring = polys(cmds)[0]!
    for (const r of radii(ring.points, 20, 30)) expect(r).toBeGreaterThan(0.9)
  })
})
