import { describe, expect, it } from 'vitest'
import { compileOption, DEFAULT_DECALS } from './option'
import { patternMarks } from './pattern'
import type { DrawCmd } from './types'

const box = { x: 10, y: 20, w: 60, h: 40 }
const slopes = (marks: DrawCmd[]): number[] =>
  [...new Set(marks.flatMap((m) => (m.kind === 'line' ? [Math.round(((m.to.y - m.from.y) / (m.to.x - m.from.x)) * 1000) / 1000] : [])))].sort()

describe('patternMarks — the one geometry every painter draws', () => {
  it('stripes run at 45° by default, at their angle when given, and a cross adds the perpendicular set', () => {
    expect(slopes(patternMarks({ kind: 'diagonal', color: '#000', spacing: 6, width: 1 }, box))).toEqual([-1])
    expect(slopes(patternMarks({ kind: 'diagonal', color: '#000', spacing: 6, width: 1, angle: -45 }, box))).toEqual([1])
    expect(slopes(patternMarks({ kind: 'cross', color: '#000', spacing: 6, width: 1 }, box))).toEqual([-1, 1])
  })

  it('stripes cover the whole box: some line passes every corner region', () => {
    const lines = patternMarks({ kind: 'diagonal', color: '#000', spacing: 4, width: 1, angle: 30 }, box).filter((m): m is Extract<DrawCmd, { kind: 'line' }> => m.kind === 'line')
    const near = (px: number, py: number): boolean =>
      lines.some((l) => {
        const dx = l.to.x - l.from.x
        const dy = l.to.y - l.from.y
        return Math.abs((px - l.from.x) * dy - (py - l.from.y) * dx) / Math.hypot(dx, dy) <= 2.1
      })
    for (const [px, py] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) expect(near(px!, py!)).toBe(true)
  })

  it('symbols tile their shape at the pitch, sized by width, and rotate with the texture', () => {
    const tri = patternMarks({ kind: 'symbols', color: '#123', spacing: 10, width: 4, symbol: 'triangle', spacingY: 12 }, box)
    expect(tri.every((m) => m.kind === 'polygon' && m.points.length === 3 && m.fill === '#123')).toBe(true)
    const circles = patternMarks({ kind: 'symbols', color: '#123', spacing: 10, width: 4, symbol: 'circle' }, box)
    expect(circles.every((m) => m.kind === 'circle' && m.radius === 2)).toBe(true)
    const rect = patternMarks({ kind: 'symbols', color: '#123', spacing: 10, width: 4, symbol: 'rect' }, box)[0]!
    const turned = patternMarks({ kind: 'symbols', color: '#123', spacing: 10, width: 4, symbol: 'rect', angle: 30 }, box)[0]!
    if (rect.kind !== 'polygon' || turned.kind !== 'polygon') throw new Error('polygon')
    const edge = (p: { x: number; y: number }[]) => Math.atan2(p[1]!.y - p[0]!.y, p[1]!.x - p[0]!.x) * (180 / Math.PI)
    expect(edge(turned.points) - edge(rect.points)).toBeCloseTo(30, 6)
    expect(patternMarks({ kind: 'symbols', color: '#123', spacing: 10, width: 4, symbol: 'diamond' }, box).every((m) => m.kind === 'polygon' && m.points.length === 4)).toBe(true)
    // A pin: a rounded head over a single point at the bottom; an arrow: four points, pointing up.
    const pin = patternMarks({ kind: 'symbols', color: '#123', spacing: 10, width: 8, symbol: 'pin' }, box)[0]!
    if (pin.kind !== 'polygon') throw new Error('pin')
    expect(pin.points.length).toBeGreaterThan(6)
    expect(Math.max(...pin.points.map((q) => q.y))).toBe(pin.points[pin.points.length - 1]!.y)
    const arrow = patternMarks({ kind: 'symbols', color: '#123', spacing: 10, width: 8, symbol: 'arrow' }, box)[0]!
    expect(arrow.kind === 'polygon' && arrow.points.length).toBe(4)
  })
})

describe('decals from the option', () => {
  it('names a decal symbol the engine cannot draw and tiles rects instead', () => {
    const c = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { decal: { symbol: 'star' } }, data: [1] }] })
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].itemStyle.decal.symbol'])
    expect(c.spec.series[0]!.pattern!.symbol).toBe('rect')
  })

  it('path:// and image:// decal symbols map to a path symbol and an image grid', () => {
    const c = compileOption({ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [
      { type: 'bar', itemStyle: { decal: { symbol: 'path://M0 0L10 0L5 10Z' } }, data: [1] },
      { type: 'bar', itemStyle: { decal: { symbol: 'image://data:image/png;base64,AAAA' } }, data: [2] },
    ] })
    expect(c.warnings).toEqual([])
    expect(c.spec.series[0]!.pattern).toMatchObject({ kind: 'symbols', symbol: 'path', shapeRings: [3] })
    // Fitted into a unit box centred on 0, aspect kept.
    expect(c.spec.series[0]!.pattern!.shape).toEqual([{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 }])
    expect(c.spec.series[1]!.pattern).toMatchObject({ kind: 'image', repeat: 'grid', image: 'data:image/png;base64,AAAA' })
  })

  it('aria.decal.show gives every series without its own decal a distinct default; an explicit decal still wins', () => {
    const c = compileOption({
      aria: { decal: { show: true } },
      xAxis: { data: ['a'] },
      yAxis: {},
      series: [
        { type: 'bar', data: [1] },
        { type: 'bar', data: [2] },
        { type: 'bar', itemStyle: { decal: { symbol: 'circle' } }, data: [3] },
      ],
    })
    expect(c.warnings).toEqual([])
    expect(c.spec.series[0]!.pattern).toEqual(DEFAULT_DECALS[0])
    expect(c.spec.series[1]!.pattern).toEqual(DEFAULT_DECALS[1])
    expect(c.spec.series[1]!.pattern).not.toEqual(DEFAULT_DECALS[0])
    expect(c.spec.series[2]!.pattern!.symbol).toBe('circle')
    const off = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
    expect(off.spec.series[0]!.pattern).toBeUndefined()
  })
})
