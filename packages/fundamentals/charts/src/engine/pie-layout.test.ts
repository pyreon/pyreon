// The pie as `<PieChart pie={…}>` lays it round: the arc config's start,
// direction, min / pad angles, roses and zeros; the empty ring; labels drawn
// with the estimate measurer; and the hit test the chart's taps and tooltip run
// through. Every assertion is on geometry or the draw list.
import { describe, expect, it } from 'vitest'
import { DEFAULT_ARCS, fitCircle, layoutArcsWith, renderPie } from './arc'
import type { ArcConfig, Slice } from './arc'
import { pieHitWith, pieTipAt } from './chrome'
import { PIE_LABEL_DEFAULTS, layoutPieLabels, truncateLabel } from './pie-labels'
import type { PieLabelOptions } from './pie-labels'
import type { DrawCmd } from './types'

const TAU = Math.PI * 2
const slices = (...values: number[]): Slice[] => values.map((value, i) => ({ value, label: `s${i}`, color: `#00000${i}` }))
const arcs = (o: Partial<ArcConfig>): ArcConfig => ({ ...DEFAULT_ARCS, ...o })
const widths = (s: Slice[], o: Partial<ArcConfig>) => layoutArcsWith(s, arcs(o)).map((a) => a.end - a.start)
const box = { x: 0, y: 0, w: 200, h: 200 }
const ofKind = <K extends DrawCmd['kind']>(cmds: DrawCmd[], kind: K) => cmds.filter((c): c is Extract<DrawCmd, { kind: K }> => c.kind === kind)

describe('layoutArcsWith', () => {
  it('counter-clockwise runs the other way round from the same start', () => {
    const cw = layoutArcsWith(slices(1, 3), DEFAULT_ARCS)
    const ccw = layoutArcsWith(slices(1, 3), arcs({ clockwise: false }))
    // Same widths, mirrored about the start.
    expect(ccw.map((a) => a.end - a.start)).toEqual(cw.map((a) => a.end - a.start))
    expect(ccw[0]!.end).toBeCloseTo(DEFAULT_ARCS.start, 9)
    expect(cw[0]!.start).toBeCloseTo(DEFAULT_ARCS.start, 9)
  })

  it('a minAngle widens a sliver and the rest share what is left, by value', () => {
    const w = widths(slices(1, 99), { minAngle: 0.5 })
    expect(w[0]).toBeCloseTo(0.5, 9)
    expect(w[0]! + w[1]!).toBeCloseTo(TAU, 9)
  })

  it('when every slice is widened, the turn is split evenly', () => {
    const w = widths(slices(1, 1, 1), { minAngle: 3 })
    for (const x of w) expect(x).toBeCloseTo(TAU / 3, 9)
  })

  it('a pad angle wider than a slice leaves it a line at its middle', () => {
    const laid = layoutArcsWith(slices(1, 1000), arcs({ padAngle: 0.5 }))
    expect(laid[0]!.end - laid[0]!.start).toBe(0)
    expect(laid[1]!.end - laid[1]!.start).toBeGreaterThan(0)
  })

  it("an 'area' rose gives every slice the same angle; a 'radius' rose also reaches by value", () => {
    for (const w of widths(slices(1, 4), { rose: 'area' })) expect(w).toBeCloseTo(Math.PI, 9)
    const rose = layoutArcsWith(slices(1, 4), arcs({ rose: 'radius' }))
    expect(rose.map((a) => a.reach)).toEqual([0.25, 1])
    expect(layoutArcsWith(slices(1, 4), DEFAULT_ARCS).map((a) => a.reach)).toEqual([1, 1])
  })

  it('zeros are kept when asked, and an all-zero pie splits evenly with zero fractions', () => {
    expect(layoutArcsWith(slices(0, 2), DEFAULT_ARCS)).toHaveLength(1)
    const kept = layoutArcsWith(slices(0, 2), arcs({ zeros: true }))
    expect(kept.map((a) => a.index)).toEqual([0, 1])
    expect(kept[0]!.end - kept[0]!.start).toBe(0)
    const even = layoutArcsWith(slices(0, 0), arcs({ zeros: true }))
    expect(even.map((a) => a.fraction)).toEqual([0, 0])
    for (const a of even) expect(a.end - a.start).toBeCloseTo(Math.PI, 9)
    // A rose over all zeros has nothing to reach toward.
    expect(layoutArcsWith(slices(0, 0), arcs({ zeros: true, rose: 'radius' })).map((a) => a.reach)).toEqual([0, 0])
  })
})

describe('renderPie', () => {
  it('with no slices draws the empty ring when asked, from the start whichever way it runs', () => {
    expect(renderPie([], box, { innerRadius: 0, showLabels: true, labelColor: '#fff', fontSize: 11 })).toEqual([])
    for (const clockwise of [true, false]) {
      const cmds = renderPie(slices(0), box, { innerRadius: 0.5, showLabels: true, labelColor: '#fff', fontSize: 11, empty: '#eeeeee', arcs: arcs({ clockwise }) })
      expect(cmds).toHaveLength(1)
      expect(cmds[0]).toMatchObject({ kind: 'polygon', fill: '#eeeeee' })
    }
  })

  it('skips a zero-width slice rather than drawing a degenerate polygon', () => {
    const cmds = renderPie(slices(0, 2), box, { innerRadius: 0, showLabels: false, labelColor: '#fff', fontSize: 11, arcs: arcs({ zeros: true }) })
    expect(ofKind(cmds, 'polygon')).toHaveLength(1)
  })

  it('outside labels with no measurer are sized by the estimate, drawn with guide lines in the slice colour', () => {
    const labels: PieLabelOptions = { ...PIE_LABEL_DEFAULTS, texts: ['Alpha', 'Beta'], color: 'inherit' }
    const cmds = renderPie(slices(1, 3), { x: 100, y: 100, w: 200, h: 200 }, { innerRadius: 0, showLabels: true, labelColor: '#999', fontSize: 11, labels, view: { x: 0, y: 0, w: 400, h: 400 } })
    const texts = ofKind(cmds, 'text')
    expect(texts.map((t) => t.text).sort()).toEqual(['Alpha', 'Beta'])
    expect(texts.every((t) => t.fill.startsWith('#00000'))).toBe(true)
    expect(ofKind(cmds, 'polyline')).toHaveLength(2)
  })

  it('a rotated label carries its rotation; a level one carries none', () => {
    const base = { innerRadius: 0, showLabels: true, labelColor: '#999', fontSize: 11, view: { x: 0, y: 0, w: 400, h: 400 } }
    const level = ofKind(renderPie(slices(1, 3), box, { ...base, labels: { ...PIE_LABEL_DEFAULTS, texts: ['a', 'b'] } }), 'text')
    expect(level.every((t) => t.rotate === undefined)).toBe(true)
    const turned = ofKind(renderPie(slices(1, 3), box, { ...base, labels: { ...PIE_LABEL_DEFAULTS, texts: ['a', 'b'], rotate: 'fixed', rotateDegrees: 30 } }), 'text')
    expect(turned).toHaveLength(2)
    for (const t of turned) expect(t.rotate).toBeCloseTo(-30, 9)
  })

  it('without labels, a sliver goes unlabelled and a real slice shows its percentage', () => {
    const texts = ofKind(renderPie(slices(1, 99), box, { innerRadius: 0, showLabels: true, labelColor: '#fff', fontSize: 11 }), 'text')
    expect(texts.map((t) => t.text)).toEqual(['99%'])
  })
})

describe('layoutPieLabels — rotation and edge alignment', () => {
  const center = { x: 200, y: 200 }
  const view = { x: 0, y: 0, w: 400, h: 400 }
  const laid = layoutArcsWith(slices(1, 1, 1, 1), DEFAULT_ARCS)
  const measure = (t: string) => t.length * 10
  const place = (o: Partial<PieLabelOptions>) => layoutPieLabels(laid, center, 100, 0, view, { ...PIE_LABEL_DEFAULTS, texts: ['a', 'b', 'c', 'd'], ...o }, measure)

  it("'radial' turns each label along its slice's radius, flipping the left half upright", () => {
    const r = place({ rotate: 'radial' })
    expect(r.every((l) => l.rotate !== 0 || Math.abs(Math.sin(laid[l.index]!.mid)) < 1e-9)).toBe(true)
    // Opposite slices across the vertical read the same way up.
    expect(new Set(r.map((l) => Math.round(l.rotate))).size).toBeGreaterThan(1)
  })

  it("'tangential' turns an outside label; 'tangential-noflip' only turns an inside one", () => {
    expect(place({ rotate: 'tangential' }).some((l) => l.rotate !== 0)).toBe(true)
    expect(place({ rotate: 'tangential-noflip' }).every((l) => l.rotate === 0)).toBe(true)
    expect(place({ rotate: 'tangential-noflip', position: 'inside' }).some((l) => l.rotate !== 0)).toBe(true)
    // A centre label never turns (unless fixed).
    expect(place({ rotate: 'radial', position: 'center' }).every((l) => l.rotate === 0)).toBe(true)
  })

  it("alignTo 'edge' puts labels at the view's edges, a fraction or a pixel distance in", () => {
    const pct = place({ alignTo: 'edge', edgePercent: 0.1 })
    for (const l of pct) {
      if (l.align === 'start') expect(l.at.x).toBeCloseTo(40, 6)
      else expect(l.at.x).toBeCloseTo(360, 6)
    }
    const px = place({ alignTo: 'edge', edgePercent: -1, edgeDistance: 7 })
    expect(px.some((l) => Math.abs(l.at.x - 7) < 1e-6 || Math.abs(l.at.x - 393) < 1e-6)).toBe(true)
  })
})

describe('truncateLabel', () => {
  it('no room is no text; text that fits stays whole', () => {
    expect(truncateLabel('abc', 1, 10, (t) => t.length * 10)).toBe('')
    expect(truncateLabel('ab', 100, 10, (t) => t.length * 10)).toBe('ab')
  })
})

describe('pieHitWith / pieTipAt', () => {
  it('names the slice under the point by its input index, a skipped slice not counting', () => {
    const s = slices(0, 1, 3)
    const fit = fitCircle(box)
    // Clockwise from 12 o'clock: slice 1 takes the first quarter (upper right).
    expect(pieHitWith(s, box, 0, DEFAULT_ARCS, fit.center.x + 40, fit.center.y - 40)).toBe(1)
    expect(pieHitWith(s, box, 0, DEFAULT_ARCS, fit.center.x - 40, fit.center.y + 40)).toBe(2)
    expect(pieHitWith(s, box, 0, DEFAULT_ARCS, 0, 0)).toBe(-1)
    // A donut's hole is a miss.
    expect(pieHitWith(s, box, 0.5, DEFAULT_ARCS, fit.center.x + 1, fit.center.y - 1)).toBe(-1)
  })

  it('a rose slice is only as long as its reach', () => {
    const s = slices(1, 4)
    const fit = fitCircle(box)
    const cfg = arcs({ rose: 'radius' })
    const mid = layoutArcsWith(s, cfg)[0]!.mid
    const near = { x: fit.center.x + Math.cos(mid) * fit.radius * 0.2, y: fit.center.y + Math.sin(mid) * fit.radius * 0.2 }
    const far = { x: fit.center.x + Math.cos(mid) * fit.radius * 0.8, y: fit.center.y + Math.sin(mid) * fit.radius * 0.8 }
    expect(pieHitWith(s, box, 0, cfg, near.x, near.y)).toBe(0)
    expect(pieHitWith(s, box, 0, cfg, far.x, far.y)).toBe(-1)
  })

  it('the tip reads the slice and its share; out of range is empty', () => {
    const s = slices(1, 3)
    expect(pieTipAt(s, 1)).toEqual(['s1', '3 (75%)'])
    expect(pieTipAt(s, -1)).toEqual([])
    expect(pieTipAt(s, 9)).toEqual([])
  })
})
