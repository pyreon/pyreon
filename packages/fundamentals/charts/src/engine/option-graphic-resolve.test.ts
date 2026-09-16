// ECharts' `graphic` option resolved to engine elements, on the shapes the
// happy-path suite does not drive: every root form, the position anchors, a
// nested group's offset, the per-type point readers, the unsupported types
// (image named separately), and the text/alignment/default fields. Authored
// config crossing to every target — each loss must be named, never silent.
import { describe, expect, it } from 'vitest'
import { graphicElements } from './option-layer'

const W = 400
const H = 300
const els = (graphic: unknown) => graphicElements({ graphic }, W, H)

describe('roots', () => {
  it('accepts an array, an {elements} object, and a single element', () => {
    const one = { type: 'rect', shape: { width: 10, height: 10 } }
    expect(els([one]).elements).toHaveLength(1)
    expect(els({ elements: [one, one] }).elements).toHaveLength(2)
    expect(els(one).elements).toHaveLength(1)
  })

  it('no graphic, or a non-object entry, yields nothing and no warning', () => {
    expect(els(undefined)).toEqual({ elements: [], warnings: [] })
    expect(els([7, null, 'x']).elements).toEqual([])
  })
})

describe('position anchors', () => {
  const shape = { width: 20, height: 10 }
  const at = (e: Record<string, unknown>) => {
    const [g] = els([{ type: 'rect', shape, ...e }]).elements
    return { x: g!.x, y: g!.y }
  }

  it('explicit x/y', () => {
    expect(at({ x: 5, y: 6 })).toEqual({ x: 5, y: 6 })
  })

  it('right / bottom anchor from the far edge, net of the element size', () => {
    expect(at({ right: 10, bottom: 20 })).toEqual({ x: W - 10 - 20, y: H - 20 - 10 })
  })

  it('left / top win over right / bottom', () => {
    expect(at({ left: 3, right: 10, top: 4, bottom: 20 })).toEqual({ x: 3, y: 4 })
  })

  it('a circle takes its size from its radius for anchoring', () => {
    const [g] = els([{ type: 'circle', shape: { r: 5 }, right: 0 }]).elements
    expect(g!.x).toBe(W - 10)
  })
})

describe('groups', () => {
  it('offset their children by the group position', () => {
    const [g] = els([{ type: 'group', x: 100, y: 50, children: [{ type: 'rect', x: 1, y: 2, shape: { width: 1, height: 1 } }] }]).elements
    expect({ x: g!.x, y: g!.y }).toEqual({ x: 101, y: 52 })
  })

  it('a group with no children array contributes nothing', () => {
    expect(els([{ type: 'group', children: 'nope' }]).elements).toEqual([])
  })
})

describe('per-type point readers', () => {
  it('line reads its two endpoints, skipping a non-numeric pair', () => {
    expect(els([{ type: 'line', shape: { x1: 0, y1: 0, x2: 5, y2: 5 } }]).elements[0]!.points).toHaveLength(2)
    expect(els([{ type: 'line', shape: { x1: 'a', y1: 0, x2: 5, y2: 5 } }]).elements[0]!.points).toHaveLength(1)
  })

  it('polygon / polyline read [x, y] pairs and ignore anything else', () => {
    const pts = els([{ type: 'polygon', shape: { points: [[0, 0], [5, 0], 'bad', [5, 5]] } }]).elements[0]!.points
    expect(pts).toHaveLength(3)
    expect(els([{ type: 'polyline', shape: { points: 'nope' } }]).elements[0]!.points).toEqual([])
  })

  it('bezierCurve is a quadratic without cp2 and a cubic with it', () => {
    const quad = els([{ type: 'bezierCurve', shape: { x1: 0, y1: 0, cpx1: 5, cpy1: 5, x2: 10, y2: 0 } }]).elements[0]!
    expect(quad.kind).toBe('bezier')
    expect(quad.points).toHaveLength(3)
    const cubic = els([{ type: 'bezierCurve', shape: { x1: 0, y1: 0, cpx1: 5, cpy1: 5, cpx2: 8, cpy2: 5, x2: 10, y2: 0 } }]).elements[0]!
    expect(cubic.points).toHaveLength(4)
  })
})

describe('unsupported types are named and skipped', () => {
  it('image gets its own explanation', () => {
    const r = els([{ type: 'image' }])
    expect(r.elements).toEqual([])
    expect(r.warnings[0]!.message).toContain('bitmap')
    expect(r.warnings[0]!.path).toBe('graphic[0].type')
  })

  it('any other unknown type is named with the supported list', () => {
    const r = els([{ type: 'star' }])
    expect(r.elements).toEqual([])
    expect(r.warnings[0]!.message).toContain('"star"')
  })

  it('a missing type is unknown, not silently a rect', () => {
    expect(els([{}]).warnings).toHaveLength(1)
  })
})

describe('fields and defaults', () => {
  it('fill defaults, stroke falls back to fill, lineWidth defaults to 1', () => {
    const [g] = els([{ type: 'rect', shape: { width: 1, height: 1 } }]).elements
    expect(g!.fill).toBe('#334155')
    expect(g!.stroke).toBe(g!.fill)
    expect(g!.lineWidth).toBe(1)
    const [s] = els([{ type: 'rect', style: { fill: '#f00', stroke: '#0f0', lineWidth: 3 }, shape: { width: 1, height: 1 } }]).elements
    expect([s!.fill, s!.stroke, s!.lineWidth]).toEqual(['#f00', '#0f0', 3])
  })

  it('text is stringified, and textAlign maps center/right, anything else to start', () => {
    const t = (style: Record<string, unknown>) => els([{ type: 'text', style }]).elements[0]!
    expect(t({ text: 42 }).text).toBe('42')
    expect(t({}).text).toBe('')
    expect(t({ textAlign: 'center' }).align).toBe('middle')
    expect(t({ textAlign: 'right' }).align).toBe('end')
    expect(t({ textAlign: 'left' }).align).toBe('start')
    // A non-text element carries no text even if style has one.
    expect(els([{ type: 'rect', style: { text: 'x' }, shape: { width: 1, height: 1 } }]).elements[0]!.text).toBe('')
  })

  it('rect carries its shape offset in cx/cy; round shapes carry their centre', () => {
    const [r] = els([{ type: 'rect', shape: { x: 3, y: 4, width: 1, height: 1 } }]).elements
    expect([r!.cx, r!.cy]).toEqual([3, 4])
    const [c] = els([{ type: 'circle', shape: { cx: 7, cy: 8, r: 2 } }]).elements
    expect([c!.cx, c!.cy]).toEqual([7, 8])
  })

  it('clockwise defaults true and only an explicit false turns it off', () => {
    expect(els([{ type: 'arc', shape: { r: 5 } }]).elements[0]!.clockwise).toBe(true)
    expect(els([{ type: 'arc', shape: { r: 5, clockwise: false } }]).elements[0]!.clockwise).toBe(false)
  })
})
