// The graphic layer on the inputs that must draw NOTHING rather than a broken
// shape: too few vertices, a non-positive radius, an empty sweep, an unknown
// kind — plus the sweep normaliser's wrap and clamp. `graphic` is authored
// config crossing to every target, so each guard is reachable and each
// silent-nothing needs a spec saying it is intended.
import { describe, expect, it } from 'vitest'
import { arcSweep, bezierPoints, graphicDrawCommands, graphicElementCommands } from './graphic'
import type { GraphicElement } from './graphic'

const el = (over: Partial<GraphicElement>): GraphicElement => ({
  kind: 'rect',
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  fill: '#000',
  stroke: '#000',
  lineWidth: 1,
  text: '',
  fontSize: 12,
  align: 'start',
  cx: 0,
  cy: 0,
  r: 10,
  r0: 0,
  startAngle: 0,
  endAngle: Math.PI / 2,
  clockwise: true,
  points: [],
  ...over,
})

const line2 = [{ x: 0, y: 0 }, { x: 5, y: 5 }]

describe('shapes that need vertices draw nothing without enough of them', () => {
  it('polygon, polyline and bezier need at least two points', () => {
    for (const kind of ['polygon', 'polyline', 'bezier']) {
      expect(graphicElementCommands(el({ kind, points: [] })), `${kind} empty`).toEqual([])
      expect(graphicElementCommands(el({ kind, points: [{ x: 1, y: 1 }] })), `${kind} one`).toEqual([])
    }
  })

  it('with enough points each emits exactly one command', () => {
    expect(graphicElementCommands(el({ kind: 'polygon', points: [...line2, { x: 0, y: 5 }] }))).toHaveLength(1)
    expect(graphicElementCommands(el({ kind: 'polyline', points: line2 }))).toHaveLength(1)
  })
})

describe('radial shapes draw nothing with a non-positive radius or an empty sweep', () => {
  it('ring, sector and arc all refuse r <= 0', () => {
    for (const kind of ['ring', 'sector', 'arc']) {
      expect(graphicElementCommands(el({ kind, r: 0 })), `${kind} r=0`).toEqual([])
      expect(graphicElementCommands(el({ kind, r: -3 })), `${kind} r<0`).toEqual([])
    }
  })

  it('sector and arc refuse an EMPTY sweep', () => {
    for (const kind of ['sector', 'arc']) {
      expect(graphicElementCommands(el({ kind, startAngle: 1, endAngle: 1 })), kind).toEqual([])
    }
  })

  it('with a positive radius and a real sweep each emits one command', () => {
    expect(graphicElementCommands(el({ kind: 'ring', r: 10, r0: 4 }))).toHaveLength(1)
    expect(graphicElementCommands(el({ kind: 'sector' }))).toHaveLength(1)
    expect(graphicElementCommands(el({ kind: 'arc' }))).toHaveLength(1)
  })
})

describe('text alignment', () => {
  it('maps middle and end, and anything else to start', () => {
    const align = (a: string) => {
      const [c] = graphicElementCommands(el({ kind: 'text', text: 't', align: a }))
      return c!.kind === 'text' ? c!.align : ''
    }
    expect(align('middle')).toBe('middle')
    expect(align('end')).toBe('end')
    expect(align('left')).toBe('start')
  })
})

describe('an unknown kind', () => {
  it('draws nothing rather than guessing', () => {
    expect(graphicElementCommands(el({ kind: 'star' }))).toEqual([])
  })
})

describe('arcSweep — normalising the angle pair', () => {
  it('a clockwise pair that runs backwards is wrapped forward a full turn', () => {
    const s = arcSweep(1, 0.5, true)
    expect(s.y).toBeGreaterThan(s.x)
  })

  it('a sweep longer than a full turn is clamped to exactly one', () => {
    const s = arcSweep(0, Math.PI * 5, true)
    expect(s.y - s.x).toBeCloseTo(Math.PI * 2, 9)
  })

  it('counter-clockwise walks the same region from the other end', () => {
    const cw = arcSweep(0, 1, true)
    const ccw = arcSweep(0, 1, false)
    expect(ccw).not.toEqual(cw)
  })
})

describe('bezierPoints', () => {
  it('fewer than three controls is not a curve and is returned as given', () => {
    expect(bezierPoints(line2)).toBe(line2)
  })

  it('a quadratic and a cubic are both sampled into many points', () => {
    expect(bezierPoints([...line2, { x: 10, y: 0 }]).length).toBeGreaterThan(3)
    expect(bezierPoints([...line2, { x: 10, y: 0 }, { x: 15, y: 5 }]).length).toBeGreaterThan(4)
  })
})

describe('graphicDrawCommands', () => {
  it('concatenates in order and skips elements that draw nothing', () => {
    const out = graphicDrawCommands([el({ kind: 'rect' }), el({ kind: 'ring', r: 0 }), el({ kind: 'circle' })])
    expect(out.map((c) => c.kind)).toEqual(['rect', 'circle'])
  })
})
