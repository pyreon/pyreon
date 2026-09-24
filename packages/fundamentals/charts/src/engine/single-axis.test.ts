import { describe, expect, it } from 'vitest'
import { hitSingleAxis, layoutSingleAxis, renderSingleAxis } from './single-axis'
import { singleAxisTip } from './chrome'
import { singleAxisToSvg } from './single-axis-web'

const box = { x: 0, y: 0, w: 400, h: 100 }

describe('single axis', () => {
  it('category axis: one tick per category, points at their category, radius by size', () => {
    const l = layoutSingleAxis({ type: 'category', categories: ['a', 'b', 'c'] }, [{ x: 0, size: 1 }, { x: 2, size: 4 }, { x: 1 }], box, { fontSize: 10, radius: 5 })
    expect(l.axis.ticks.map((t) => t.label)).toEqual(['a', 'b', 'c'])
    expect(l.axis.x0).toBe(20)
    expect(l.axis.x1).toBe(380)
    expect(l.points[0]!.at).toEqual({ x: 20, y: 50 })
    expect(l.points[1]!.at.x).toBe(380)
    expect(l.points[2]!.at.x).toBe(200)
    expect(l.points[1]!.radius).toBeCloseTo(10, 9)
    expect(l.points[2]!.radius).toBe(5)
  })
  it('value axis: data or fixed domain, nice ticks, degenerate span centred', () => {
    const l = layoutSingleAxis({ type: 'value' }, [{ x: 10 }, { x: 30 }], box, { fontSize: 10 })
    expect(l.points[0]!.at.x).toBe(20)
    expect(l.points[1]!.at.x).toBe(380)
    expect(l.axis.ticks.length).toBeGreaterThan(2)
    const fixed = layoutSingleAxis({ type: 'value', domain: { min: 0, max: 100 } }, [{ x: 50 }], box, { fontSize: 10 })
    expect(fixed.points[0]!.at.x).toBe(200)
    const flat = layoutSingleAxis({ type: 'value' }, [{ x: 7 }, { x: 7 }], box, { fontSize: 10 })
    expect(flat.points[0]!.at.x).toBe(200)
  })
  it('renders axis + ticks + points (+ opt-in labels, axis name); entrance grows; hit-testing', () => {
    const l = layoutSingleAxis({ type: 'category', categories: ['a', 'b'], name: 'Day' }, [{ x: 0, name: 'p' }, { x: 1 }], box)
    const cmds = renderSingleAxis(l, { showLabels: true })
    expect(cmds.filter((c) => c.kind === 'circle')).toHaveLength(2)
    expect(cmds.filter((c) => c.kind === 'line')).toHaveLength(3)
    expect(cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))).toEqual(['a', 'b', 'Day', 'p'])
    const half = renderSingleAxis(l, { progress: 0.5 })
    const c0 = half.find((c) => c.kind === 'circle')!
    if (c0.kind !== 'circle') throw new Error('circle')
    expect(c0.radius).toBeCloseTo(2.5, 9)
    expect(hitSingleAxis(l, l.points[1]!.at.x + 2, l.points[1]!.at.y)).toBe(1)
    expect(hitSingleAxis(l, 200, 5)).toBe(-1)
  })
  it('singleAxisToSvg renders and describes', () => {
    const svg = singleAxisToSvg({ axis: { type: 'value' }, points: [{ x: 1 }, { x: 2 }], title: 'Ages' })
    expect(svg).toContain('<circle')
    expect(svg).toContain('2 points on a value axis')
  })
})



describe('singleAxisTip — what the pointer reads off a point', () => {
  const points = [{ x: 1, name: 'a' }, { x: 8, name: 'b' }, { x: 4 }]
  const layout = layoutSingleAxis({ name: 'v' }, points, { x: 0, y: 0, w: 200, h: 80 })

  it('answers the hit point with its name and value', () => {
    const p = layout.points[0]!
    expect(singleAxisTip(layout, points, p.at.x, p.at.y)).toEqual(['a', '1'])
  })

  it('an UNNAMED point reads as its value alone, not as a blank line', () => {
    const p = layout.points[2]!
    expect(singleAxisTip(layout, points, p.at.x, p.at.y)).toEqual(['4'])
  })

  it('a miss answers nothing', () => {
    expect(singleAxisTip(layout, points, -50, -50)).toEqual([])
  })

  it('a points list SHORTER than the layout answers nothing rather than reading past it', () => {
    const p = layout.points[1]!
    expect(singleAxisTip(layout, [points[0]!], p.at.x, p.at.y)).toEqual([])
  })
})
