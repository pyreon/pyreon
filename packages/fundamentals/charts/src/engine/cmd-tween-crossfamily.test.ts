// `universalTweenCmds` is the morph used when two frames do NOT share a shape
// — a series kind flip, an item-count change. Its per-kind "where does this
// target start from" arm (`targetAtSource`) decides whether a new shape grows
// out of the shape it replaced or out of nothing, and every kind has its own
// answer. The existing tween suites drive the same-shape path, so these arms
// were unreached.
import { describe, expect, it } from 'vitest'
import { universalTweenCmds } from './cmd-tween'
import type { DrawCmd } from './types'

const rect = (x: number, y: number, w: number, h: number): DrawCmd => ({
  kind: 'rect',
  rect: { x, y, w, h },
  fill: '#000',
})
const line = (): DrawCmd => ({ kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, stroke: '#000', width: 1 })
const poly = (n: number): DrawCmd => ({
  kind: 'polygon',
  points: Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
  fill: '#000',
})
const polyline = (n: number): DrawCmd => ({
  kind: 'polyline',
  points: Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
  stroke: '#000',
  width: 1,
})
const circle = (): DrawCmd => ({ kind: 'circle', center: { x: 5, y: 5 }, radius: 3, fill: '#000' })
const text = (size: number): DrawCmd => ({
  kind: 'text',
  text: 'hi',
  at: { x: 5, y: 5 },
  fill: '#000',
  size,
  align: 'start',
  baseline: 'top',
})

describe('universalTweenCmds — the settled frames', () => {
  it('e >= 1 is exactly the target list', () => {
    const to = [rect(0, 0, 4, 4)]
    expect(universalTweenCmds([circle()], to, 1)).toBe(to)
  })

  it('a same-shape pair delegates to the ordinary tween', () => {
    const out = universalTweenCmds([rect(0, 0, 10, 10)], [rect(10, 10, 10, 10)], 0.5)
    expect(out).toHaveLength(1)
    expect(out[0]!.kind).toBe('rect')
  })
})

describe('universalTweenCmds — a target grows out of the shape it replaces', () => {
  it('a rect starts at the SOURCE box, whatever kind the source was', () => {
    // The source circle spans (2,2)-(8,8); at e=0 the incoming rect should sit
    // on that box rather than at its own destination.
    const out = universalTweenCmds([circle()], [rect(100, 100, 5, 5)], 0)
    const r = out[0]!
    expect(r.kind === 'rect' && r.rect).toEqual({ x: 2, y: 2, w: 6, h: 6 })
  })

  it('a line starts as the source box diagonal', () => {
    const out = universalTweenCmds([circle()], [line()], 0)
    const l = out[0]!
    expect(l.kind === 'line' && l.from).toEqual({ x: 2, y: 2 })
    expect(l.kind === 'line' && l.to).toEqual({ x: 8, y: 8 })
  })

  it('a polygon and a polyline start collapsed onto the source CENTRE, keeping their point count', () => {
    const [p] = universalTweenCmds([circle()], [poly(4)], 0)
    expect(p!.kind === 'polygon' && p!.points).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ])

    const [pl] = universalTweenCmds([circle()], [polyline(3)], 0)
    expect(pl!.kind === 'polyline' && pl!.points).toHaveLength(3)
  })

  it('a circle starts centred on the source with a radius covering its larger side', () => {
    const out = universalTweenCmds([rect(0, 0, 20, 10)], [circle()], 0)
    const c = out[0]!
    expect(c.kind === 'circle' && c.center).toEqual({ x: 10, y: 5 })
    expect(c.kind === 'circle' && c.radius).toBe(10)
  })

  it('text starts at the source centre, inheriting a text source’s size and otherwise starting from 0', () => {
    const fromText = universalTweenCmds([text(20)], [text(10)], 0)[0]!
    // A text-to-text source hands over its own size, so the glyph scales
    // rather than popping in from nothing.
    expect(fromText.kind === 'text' && fromText.size).toBe(20)

    const fromRect = universalTweenCmds([rect(0, 0, 10, 10)], [text(10)], 0)[0]!
    expect(fromRect.kind === 'text' && fromRect.size).toBe(0)
  })
})

describe('universalTweenCmds — pairing and leftovers', () => {
  it('a target prefers a source of its OWN kind before falling back to any spare', () => {
    // Two sources, one circle and one rect; the incoming rect must claim the
    // rect, leaving the circle for the second target.
    const out = universalTweenCmds([circle(), rect(0, 0, 2, 2)], [rect(50, 50, 5, 5), circle()], 0)
    const r = out[0]!
    expect(r.kind === 'rect' && r.rect).toEqual({ x: 0, y: 0, w: 2, h: 2 })
  })

  it('a target with NO source left starts collapsed rather than at its destination', () => {
    const out = universalTweenCmds([], [rect(10, 20, 30, 40)], 0)
    const r = out[0]!
    expect(r.kind === 'rect' && r.rect.w).toBe(0)
    expect(r.kind === 'rect' && r.rect.h).toBe(0)
  })

  it('an unclaimed SOURCE keeps animating out instead of vanishing on the first frame', () => {
    const out = universalTweenCmds([rect(0, 0, 10, 10), circle()], [rect(0, 0, 10, 10)], 0.5)
    // One morphing target plus the leaving circle.
    expect(out).toHaveLength(2)
    expect(out[1]!.kind).toBe('circle')
  })

  it('a zero-point polygon source contributes an empty box rather than throwing', () => {
    const out = universalTweenCmds([poly(0)], [rect(10, 10, 4, 4)], 0)
    const r = out[0]!
    expect(r.kind === 'rect' && r.rect).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})
