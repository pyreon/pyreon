import { describe, expect, it } from 'vitest'
import { layoutPolar, renderPolar } from './polar'
import { hitPolar } from './polar-hit'
import { polarToSvg } from './family-svg'
import type { PolarSeries } from './polar'

const TAU = Math.PI * 2
const box = { x: 0, y: 0, w: 400, h: 400 }
const axes = { categories: ['a', 'b', 'c', 'd'] }
const bars: PolarSeries[] = [{ name: 'x', kind: 'bar', values: [1, 2, 3, 4] }]

describe('polar layout (categories on the angle axis)', () => {
  it('one sector per category, equal slots, radius proportional to value from the hole', () => {
    const l = layoutPolar(axes, bars, box)
    expect(l.categoryOn).toBe('angle')
    expect(l.sectors).toHaveLength(4)
    expect(l.domain).toEqual({ min: 0, max: 4 })
    for (const s of l.sectors) expect(s.end - s.start).toBeCloseTo((TAU / 4) * 0.8, 9)
    expect(l.sectors[0]!.innerR).toBeCloseTo(l.innerR, 9)
    expect(l.sectors[3]!.outerR).toBeCloseTo(l.outerR, 9)
    expect((l.sectors[1]!.outerR - l.innerR) / (l.sectors[3]!.outerR - l.innerR)).toBeCloseTo(0.5, 9)
    expect(l.sectors[1]!.start - l.sectors[0]!.start).toBeCloseTo(TAU / 4, 9)
    expect(l.categoryLabels.map((c) => c.text)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('grouped bars share a slot side by side; stacked bars accumulate along the radius', () => {
    const grouped = layoutPolar(axes, [bars[0]!, { name: 'y', kind: 'bar', values: [1, 1, 1, 1] }], box)
    const g0 = grouped.sectors.filter((s) => s.index === 0)
    expect(g0).toHaveLength(2)
    expect(g0[1]!.start).toBeCloseTo(g0[0]!.end, 9)
    const stacked = layoutPolar(axes, [{ ...bars[0]!, stack: 's' }, { name: 'y', kind: 'bar', values: [1, 1, 1, 1], stack: 's' }], box)
    expect(stacked.domain).toEqual({ min: 0, max: 5 })
    const s0 = stacked.sectors.filter((s) => s.index === 0)
    expect(s0[1]!.innerR).toBeCloseTo(s0[0]!.outerR, 9)
    expect(s0[1]!.start).toBeCloseTo(s0[0]!.start, 9)
  })
  it('a line series places points at slot centres by value; a fixed domain and start angle apply', () => {
    const l = layoutPolar({ ...axes, valueDomain: { min: 0, max: 8 }, startAngle: 0 }, [{ name: 'l', kind: 'line', values: [4, 8, 0, 4] }], box)
    expect(l.lines).toHaveLength(1)
    const p = l.lines[0]!.points
    const dist = (q: { x: number; y: number }) => Math.hypot(q.x - l.center.x, q.y - l.center.y)
    expect(dist(p[1]!.at)).toBeCloseTo(l.outerR, 9)
    expect(dist(p[0]!.at)).toBeCloseTo(l.outerR / 2, 9)
    expect(p[0]!.at.y).toBeGreaterThan(l.center.y)
    expect(Math.atan2(p[0]!.at.y - l.center.y, p[0]!.at.x - l.center.x)).toBeCloseTo(TAU / 8, 9)
  })
})

describe('polar layout (categories on the radius axis)', () => {
  it('one ring per category; arcs sweep by value; counter-clockwise flips the sweep', () => {
    const l = layoutPolar({ categories: ['a', 'b'], categoryOn: 'radius', valueDomain: { min: 0, max: 10 } }, [{ name: 'x', kind: 'bar', values: [5, 10] }], box)
    expect(l.sectors).toHaveLength(2)
    expect(l.sectors[0]!.end - l.sectors[0]!.start).toBeCloseTo(TAU / 2, 9)
    expect(l.sectors[1]!.end - l.sectors[1]!.start).toBeCloseTo(TAU, 9)
    expect(l.sectors[1]!.innerR).toBeGreaterThan(l.sectors[0]!.outerR)
    const ccw = layoutPolar({ categories: ['a'], categoryOn: 'radius', valueDomain: { min: 0, max: 10 }, clockwise: false }, [{ name: 'x', kind: 'bar', values: [5] }], box)
    expect(ccw.sectors[0]!.end).toBeCloseTo(-Math.PI / 2, 9)
    expect(ccw.sectors[0]!.start).toBeCloseTo(-Math.PI / 2 - Math.PI, 9)
  })
})

describe('polar render + hit', () => {
  it('renders grid rings, sectors, line + points, labels; entrance grows bars', () => {
    const l = layoutPolar(axes, [bars[0]!, { name: 'l', kind: 'line', values: [1, 1, 1, 1] }], box)
    const cmds = renderPolar(l)
    expect(cmds.filter((c) => c.kind === 'polygon')).toHaveLength(4)
    expect(cmds.filter((c) => c.kind === 'circle')).toHaveLength(4)
    expect(cmds.filter((c) => c.kind === 'polyline').length).toBeGreaterThan(1)
    expect(cmds.filter((c) => c.kind === 'text')).toHaveLength(4)
    const half = renderPolar(l, { progress: 0.5 })
    const full = cmds.find((c) => c.kind === 'polygon')!
    const grown = half.find((c) => c.kind === 'polygon')!
    if (full.kind !== 'polygon' || grown.kind !== 'polygon') throw new Error('polygon')
    const far = (pts: { x: number; y: number }[]) => Math.max(...pts.map((p) => Math.hypot(p.x - 200, p.y - 200)))
    expect(far(grown.points)).toBeLessThan(far(full.points))
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
    expect(renderPolar(l, { showGrid: false, showLabels: false }).filter((c) => c.kind === 'text')).toHaveLength(0)
  })
  it('hit-testing returns the sector under a point, a nearby line point, or null', () => {
    const l = layoutPolar(axes, [bars[0]!, { name: 'l', kind: 'line', values: [2, 2, 2, 2] }], box)
    const s = l.sectors[3]!
    const mid = (s.start + s.end) / 2
    const r = (s.innerR + s.outerR) / 2
    const hs = hitPolar(l, l.center.x + Math.cos(mid) * r, l.center.y + Math.sin(mid) * r)
    expect(hs?.kind).toBe('sector')
    if (hs?.kind === 'sector') expect(hs.sector.index).toBe(3)
    const empty = layoutPolar(axes, [{ name: 'l', kind: 'line', values: [2, 2, 2, 2] }], box)
    const p = empty.lines[0]!.points[0]!
    const hp = hitPolar(empty, p.at.x + 2, p.at.y + 2)
    expect(hp?.kind).toBe('point')
    expect(hitPolar(l, l.center.x, l.center.y - l.outerR - 40)).toBeNull()
  })
  it('polarToSvg renders and describes; empty series is fine', () => {
    const svg = polarToSvg({ axes, series: bars, title: 'Wind' })
    expect(svg).toContain('<polygon')
    expect(svg).toContain('1 series over 4 categories, values 0 to 4')
    expect(polarToSvg({ axes: { categories: [] }, series: [] })).toContain('<svg')
  })
})


describe('polar scatter series', () => {
  it('lays out points like a line but renders circles only, at the symbol radius, on both category axes', () => {
    for (const categoryOn of ['angle', 'radius'] as const) {
      const scatter: PolarSeries = { name: 's', kind: 'scatter', values: [1, 2, 3, 4], radius: 6 }
      const l = layoutPolar({ ...axes, categoryOn }, [scatter], box)
      const asLine = layoutPolar({ ...axes, categoryOn }, [{ ...scatter, kind: 'line', radius: undefined }], box)
      expect(l.lines[0]!.points.map((p) => p.at)).toEqual(asLine.lines[0]!.points.map((p) => p.at))
      expect(l.lines[0]!.scatter).toBe(true)
      expect(l.lines[0]!.radius).toBe(6)
      expect(asLine.lines[0]!.radius).toBe(2.5)
      const cmds = renderPolar(l, { progress: 1 })
      expect(cmds.filter((c) => c.kind === 'polyline' && c.stroke === l.lines[0]!.color)).toHaveLength(0)
      expect(cmds.filter((c) => c.kind === 'circle' && c.radius === 6)).toHaveLength(4)
      expect(renderPolar(asLine, { progress: 1 }).filter((c) => c.kind === 'polyline' && c.stroke === l.lines[0]!.color)).toHaveLength(1)
      // The points are hittable exactly as line points are.
      const p = l.lines[0]!.points[2]!
      expect(hitPolar(l, p.at.x, p.at.y)).toMatchObject({ kind: 'point', point: { series: 0, index: 2 } })
    }
  })

})
