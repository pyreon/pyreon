// Branch coverage for the polar family's geometry. Each spec pairs the data
// shape an arm acts on with the shape it must LEAVE ALONE — a ragged series
// beside a full one, a NaN beside a finite neighbour, a tall box beside a wide
// one — so a regression that widens an arm fails as loudly as one that closes it.
import { describe, expect, it } from 'vitest'
import { layoutPolar, polarTicks, renderPolar } from './polar'
import type { PolarSeries } from './polar'

const box = { x: 0, y: 0, w: 400, h: 400 }
const cats = (n: number): string[] => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i))
const bar = (values: number[], extra: Partial<PolarSeries> = {}): PolarSeries => ({ name: 'b', kind: 'bar', values, ...extra })
const line = (values: number[], extra: Partial<PolarSeries> = {}): PolarSeries => ({ name: 'l', kind: 'line', values, ...extra })
const radii = (l: ReturnType<typeof layoutPolar>) => l.lines[0]!.points.map((p) => Math.hypot(p.at.x - l.center.x, p.at.y - l.center.y))

describe('polar — the value axis clamps outside the domain', () => {
  it('a value BELOW the domain sits on the hole and one ABOVE sits on the rim', () => {
    const l = layoutPolar({ categories: cats(3), valueDomain: { min: 10, max: 20 } }, [line([5, 15, 40])], box)
    const r = radii(l)
    expect(r[0]!, 'below min clamps to the inner radius').toBeCloseTo(l.innerR, 9)
    expect(r[1]!, 'mid-domain interpolates').toBeCloseTo(l.innerR + (l.outerR - l.innerR) / 2, 9)
    expect(r[2]!, 'above max clamps to the outer radius').toBeCloseTo(l.outerR, 9)
  })
  it('a DEGENERATE domain (min === max) puts every value on the hole rather than dividing by zero', () => {
    const l = layoutPolar({ categories: cats(2), valueDomain: { min: 7, max: 7 } }, [line([1, 99])], box)
    for (const r of radii(l)) expect(r).toBeCloseTo(l.innerR, 9)
  })
})

describe('polar — how the ring is fitted into the box', () => {
  it('the ring is sized by the SHORTER side, whether the box is wide or tall', () => {
    const wide = layoutPolar({ categories: cats(3) }, [bar([1, 2, 3])], { x: 0, y: 0, w: 400, h: 200 })
    const tall = layoutPolar({ categories: cats(3) }, [bar([1, 2, 3])], { x: 0, y: 0, w: 200, h: 400 })
    expect(tall.outerR).toBeCloseTo(wide.outerR, 9)
    expect(tall.center).toEqual({ x: 100, y: 200 })
    expect(wide.center).toEqual({ x: 200, y: 100 })
  })
  it('hiding the labels gives the ring the label gutter back', () => {
    const shown = layoutPolar({ categories: cats(3) }, [bar([1, 2, 3])], box)
    const hidden = layoutPolar({ categories: cats(3) }, [bar([1, 2, 3])], box, { showLabels: false })
    expect(hidden.outerR).toBeGreaterThan(shown.outerR)
    expect(hidden.outerR).toBeCloseTo(200 - 4, 9)
  })
  it('a box too small for the gutter collapses the ring to zero rather than a negative radius', () => {
    const l = layoutPolar({ categories: cats(3) }, [bar([1, 2, 3])], { x: 0, y: 0, w: 10, h: 10 })
    expect(l.outerR).toBe(0)
    expect(l.innerR).toBe(0)
  })
  it('the inner-radius ratio is clamped to 0..0.95 at both ends', () => {
    const negative = layoutPolar({ categories: cats(2) }, [bar([1, 2])], box, { innerRatio: -2 })
    expect(negative.innerR, 'a negative ratio is no hole at all').toBe(0)
    const huge = layoutPolar({ categories: cats(2) }, [bar([1, 2])], box, { innerRatio: 5 })
    expect(huge.innerR / huge.outerR, 'a full hole would leave nothing to draw').toBeCloseTo(0.95, 9)
    const mid = layoutPolar({ categories: cats(2) }, [bar([1, 2])], box, { innerRatio: 0.5 })
    expect(mid.innerR / mid.outerR).toBeCloseTo(0.5, 9)
  })
})

describe('polar — the domain scan over ragged, non-finite and negative data', () => {
  it('a series SHORTER than the category list contributes only the values it has', () => {
    const l = layoutPolar({ categories: cats(4) }, [bar([1, 2])], box)
    expect(l.domain).toEqual({ min: 0, max: 2 })
    expect(l.sectors, 'and lays out only those two').toHaveLength(2)
    expect(l.sectors.map((s) => s.index)).toEqual([0, 1])
  })
  it('a NaN or Infinity is skipped while its finite neighbours are kept', () => {
    const l = layoutPolar({ categories: cats(4) }, [bar([1, Number.NaN, Number.POSITIVE_INFINITY, 3])], box)
    expect(l.domain).toEqual({ min: 0, max: 3 })
    expect(l.sectors.map((s) => s.index), 'the two holes leave gaps, they do not shift the rest').toEqual([0, 3])
  })
  it('a NEGATIVE value pulls the domain minimum below zero', () => {
    const l = layoutPolar({ categories: cats(3) }, [bar([-4, 1, 6])], box)
    expect(l.domain).toEqual({ min: -4, max: 6 })
  })
  it('a negative value inside a STACK pulls the minimum down by the running total', () => {
    const l = layoutPolar({ categories: cats(2) }, [bar([-3, 1], { stack: 's' }), bar([-2, 1], { name: 'b2', stack: 's' })], box)
    expect(l.domain, 'the stacked TOP is what the domain sees, not each value').toEqual({ min: -5, max: 2 })
  })
  it('grouped and stacked series in the same chart get separate columns', () => {
    const l = layoutPolar({ categories: cats(2) }, [bar([1, 1], { stack: 's' }), bar([2, 2], { name: 'g' }), bar([1, 1], { name: 'b3', stack: 's' })], box)
    // The stack tops to 2; the lone grouped series tops to 2 as well.
    expect(l.domain).toEqual({ min: 0, max: 2 })
    const first = l.sectors.filter((s) => s.index === 0)
    expect(first, 'three series, three sectors per category').toHaveLength(3)
    const stacked = first.filter((s) => s.series !== 1)
    expect(stacked[1]!.innerR, 'the two stack members share a column and accumulate').toBeCloseTo(stacked[0]!.outerR, 9)
    expect(stacked[0]!.start, 'while the grouped series sits in its own slot').not.toBeCloseTo(first[1]!.start, 9)
  })
})

describe('polar — a line series skips the values it does not have', () => {
  it('a short line and a NaN both leave the point out rather than placing it at zero', () => {
    const l = layoutPolar({ categories: cats(4) }, [line([1, Number.NaN, 3])], box)
    expect(l.lines[0]!.points.map((p) => p.index)).toEqual([0, 2])
  })
  it('a line with NO usable values still yields an (empty) line, not a missing one', () => {
    const l = layoutPolar({ categories: cats(3) }, [line([Number.NaN, Number.NaN, Number.NaN])], box)
    expect(l.lines).toHaveLength(1)
    expect(l.lines[0]!.points).toEqual([])
  })
})

describe('polar — categories on the RADIUS axis', () => {
  const radial = { categories: cats(3), categoryOn: 'radius' as const, valueDomain: { min: 0, max: 10 } }
  it('a line series is placed on ring centres and keeps its own colour', () => {
    const l = layoutPolar(radial, [line([5, 10, 0], { color: '#abcdef' })], box)
    expect(l.lines[0]!.color).toBe('#abcdef')
    const r = radii(l)
    expect(r[0]!).toBeLessThan(r[1]!)
    expect(r[1]!).toBeLessThan(r[2]!)
  })
  it('a line and a bar in the same radial chart each take their own pass', () => {
    const l = layoutPolar(radial, [bar([5, 5, 5]), line([1, 2, 3])], box)
    expect(l.sectors).toHaveLength(3)
    expect(l.lines).toHaveLength(1)
    expect(l.lines[0]!.series, 'the line keeps its ORIGINAL series index').toBe(1)
  })
  it('a ragged radial bar and a NaN are skipped, exactly as on the angle axis', () => {
    const l = layoutPolar(radial, [bar([5, Number.NaN])], box)
    expect(l.sectors.map((s) => s.index)).toEqual([0])
  })
  it('a ragged radial LINE is skipped too', () => {
    const l = layoutPolar(radial, [line([5, Number.NaN])], box)
    expect(l.lines[0]!.points.map((p) => p.index)).toEqual([0])
  })
  it('two grouped radial bars split each ring between them', () => {
    const l = layoutPolar(radial, [bar([10, 10, 10]), bar([10, 10, 10], { name: 'b2' })], box)
    const ring0 = l.sectors.filter((s) => s.index === 0)
    expect(ring0).toHaveLength(2)
    expect(ring0[1]!.innerR, 'the second column starts where the first ends').toBeCloseTo(ring0[0]!.outerR, 9)
  })
  it('NO categories collapses the ring width to zero instead of dividing by zero', () => {
    const l = layoutPolar({ categories: [], categoryOn: 'radius' }, [bar([])], box)
    expect(l.sectors).toEqual([])
    expect(l.categoryLabels).toEqual([])
    expect(Number.isFinite(l.outerR)).toBe(true)
  })
})

describe('polar — ticks', () => {
  it('a collapsed range yields the single value rather than an empty axis', () => {
    expect(polarTicks(5, 5)).toEqual([5])
    expect(polarTicks(5, 1)).toEqual([5])
  })
  it('round-ish steps are chosen for each decade', () => {
    // raw = span/3 -> the step is the 1/2/5 multiple of the decade below it.
    expect(polarTicks(0, 10), 'raw 3.33 -> step 2').toEqual([0, 2, 4, 6, 8, 10])
    expect(polarTicks(0, 30), 'raw 10 -> step 10').toEqual([0, 10, 20, 30])
    expect(polarTicks(0, 3), 'raw 1 -> step 1').toEqual([0, 1, 2, 3])
    // 0.3/3 is 0.09999999999999999 in binary, so the decade scan lands one
    // below and the 5-multiple wins — the step is rounded, the RANGE is exact.
    expect(polarTicks(0, 0.3)).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3])
    expect(polarTicks(0, 18), 'raw 6 -> step 5').toEqual([0, 5, 10, 15])
    expect(polarTicks(2, 8), 'the first tick is the first step AT or above lo').toEqual([2, 4, 6, 8])
  })
})

describe('polar — render', () => {
  const layout = layoutPolar({ categories: cats(4) }, [bar([1, 2, 3, 4]), line([4, 3, 2, 1], { name: 'l' })], box)
  const kinds = (cmds: ReturnType<typeof renderPolar>) => cmds.map((c) => c.kind)

  it('progress is clamped at both ends — below 0 draws nothing, above 1 is the settled frame', () => {
    const settled = renderPolar(layout)
    expect(renderPolar(layout, { progress: 5 })).toEqual(settled)
    const none = renderPolar(layout, { progress: -1, showGrid: false })
    expect(kinds(none), 'no bar survives zero progress').not.toContain('polygon')
    expect(kinds(none), 'and no line is drawn either').not.toContain('polyline')
  })
  it('at zero progress the bars have no extent, so every sector is skipped', () => {
    const cmds = renderPolar(layout, { progress: 0, showGrid: false, showLabels: false })
    expect(cmds).toEqual([])
  })
  it('labels are drawn only on the SETTLED frame', () => {
    expect(kinds(renderPolar(layout, { showGrid: false }))).toContain('text')
    expect(kinds(renderPolar(layout, { showGrid: false, progress: 0.5 }))).not.toContain('text')
    expect(kinds(renderPolar(layout, { showGrid: false, showLabels: false }))).not.toContain('text')
  })
  it('a partially drawn line with a single point yields dots but no polyline', () => {
    // 4 points at progress 0.3 -> floor(4 * 0.3) = 1 point.
    const cmds = renderPolar(layout, { progress: 0.3, showGrid: false, showLabels: false })
    const circles = cmds.filter((c) => c.kind === 'circle')
    expect(circles).toHaveLength(1)
    expect(cmds.some((c) => c.kind === 'polyline'), 'one point is not a line').toBe(false)
    const more = renderPolar(layout, { progress: 0.9, showGrid: false, showLabels: false })
    expect(more.filter((c) => c.kind === 'polyline'), 'three points are').toHaveLength(1)
  })
  it('the angle-axis grid is a set of rings, one per tick', () => {
    const cmds = renderPolar(layout, { showLabels: false })
    const rings = cmds.filter((c) => c.kind === 'polyline' && c.stroke === '#e2e8f0')
    expect(rings.length).toBeGreaterThan(0)
    expect(renderPolar(layout, { showLabels: false, showGrid: false }).filter((c) => (c as { stroke?: string }).stroke === '#e2e8f0')).toHaveLength(0)
  })
  it('the RADIUS-axis grid is eight spokes plus the rim, not rings', () => {
    const radial = layoutPolar({ categories: cats(2), categoryOn: 'radius', valueDomain: { min: 0, max: 10 } }, [bar([5, 10])], box)
    const cmds = renderPolar(radial, { showLabels: false })
    expect(cmds.filter((c) => c.kind === 'line' && c.stroke === '#e2e8f0')).toHaveLength(8)
    expect(cmds.filter((c) => c.kind === 'polyline' && c.stroke === '#e2e8f0'), 'and one rim').toHaveLength(1)
  })
  it('on the radius axis the entrance sweeps the ANGLE, leaving the radii alone', () => {
    const radial = layoutPolar({ categories: cats(1), categoryOn: 'radius', valueDomain: { min: 0, max: 10 } }, [bar([10])], box)
    const half = renderPolar(radial, { progress: 0.5, showGrid: false, showLabels: false })
    const full = renderPolar(radial, { showGrid: false, showLabels: false })
    const spanOf = (cmds: ReturnType<typeof renderPolar>) => {
      const pts = (cmds[0] as { points: { x: number; y: number }[] }).points
      const xs = pts.map((p) => p.x)
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(spanOf(half)).toBeLessThan(spanOf(full))
  })
  it('a tick at or inside the hole is skipped rather than drawn as a zero ring', () => {
    const holed = layoutPolar({ categories: cats(2), valueDomain: { min: 0, max: 10 } }, [bar([5, 10])], box, { innerRatio: 0 })
    const cmds = renderPolar(holed, { showLabels: false })
    const rings = cmds.filter((c) => c.kind === 'polyline' && c.stroke === '#e2e8f0')
    expect(rings.length, 'the tick at the domain minimum lands on r = 0').toBe(holed.ticks.length - 1)
  })
})
