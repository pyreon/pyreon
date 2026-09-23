/**
 * Pie label layout paths the ECharts differential does not reach: the centre
 * and inside positions, colour inheritance, the bleed margin, `alignTo:
 * 'labelLine'` on the left, the ellipse re-slide's re-truncation, and the
 * overlap / guide-line helpers (`shiftOnY`, `limitLine`) on the shapes that
 * drive their squeeze and clamp branches.
 */
import { describe, expect, it } from 'vitest'
import type { ArcGeometry } from './arc'
import { PIE_LABEL_DEFAULTS, layoutPieLabels, limitLine, shiftOnY, truncateLabel } from './pie-labels'
import type { PieLabelOptions } from './pie-labels'
import type { Rect } from './types'

/** Ten pixels per character, whatever the size — easy to reason about. */
const measure = (text: string): number => text.length * 10

const arc = (index: number, mid: number, color = `#${index}${index}${index}`, span = 0.2): ArcGeometry => ({
  start: mid - span / 2,
  end: mid + span / 2,
  mid,
  slice: { value: 1, label: String(index), color },
  fraction: 0.1,
  index,
  reach: 1,
})

const center = { x: 200, y: 200 }
const bigView: Rect = { x: 0, y: 0, w: 400, h: 400 }
const opts = (o: Partial<PieLabelOptions>): PieLabelOptions => ({ ...PIE_LABEL_DEFAULTS, ...o })

describe('layoutPieLabels — positions and colours', () => {
  it("'center' puts every label at the pie's centre, level, with no guide line", () => {
    const out = layoutPieLabels([arc(0, 0), arc(1, Math.PI)], center, 100, 0, bigView, opts({ position: 'center', texts: ['a', 'b'], rotate: 'radial' }), measure)
    expect(out).toHaveLength(2)
    for (const l of out) {
      expect(l.at).toEqual(center)
      expect(l.align).toBe('middle')
      expect(l.line).toEqual([])
      // A centre label ignores a radial rotation.
      expect(l.rotate).toBe(0)
    }
  })

  it("'inside' sits mid-ring, nudged 3px out along the slice's normal, with no line", () => {
    const [l] = layoutPieLabels([arc(0, 0)], center, 100, 40, bigView, opts({ position: 'inside', texts: ['in'] }), measure)
    expect(l!.at.x).toBeCloseTo(200 + 70 + 3, 9)
    expect(l!.at.y).toBeCloseTo(200, 9)
    expect(l!.align).toBe('middle')
    expect(l!.line).toEqual([])
  })

  it('a slice past the end of `texts` goes unlabelled; one within it is labelled', () => {
    const out = layoutPieLabels([arc(0, 0), arc(1, Math.PI / 2), arc(2, Math.PI)], center, 100, 0, bigView, opts({ texts: ['only'] }), measure)
    expect(out.map((l) => l.index)).toEqual([0])
  })

  it("'inherit' takes the slice's colour; an explicit line colour overrides the slice's", () => {
    const [inh] = layoutPieLabels([arc(0, 0, '#abc')], center, 100, 0, bigView, opts({ texts: ['x'], color: 'inherit', lineColor: '#f00' }), measure)
    expect(inh!.color).toBe('#abc')
    expect(inh!.lineColor).toBe('#f00')
    const [plain] = layoutPieLabels([arc(0, 0, '#abc')], center, 100, 0, bigView, opts({ texts: ['x'], color: '#123' }), measure)
    expect(plain!.color).toBe('#123')
    expect(plain!.lineColor).toBe('#abc')
  })

  it('a label without a guide line (`line: false`) carries an empty line', () => {
    const [l] = layoutPieLabels([arc(0, 0)], center, 100, 0, bigView, opts({ texts: ['x'], line: false }), measure)
    expect(l!.line).toEqual([])
  })
})

describe('layoutPieLabels — the room a label is cut to', () => {
  // One label straight right: its text starts at 200 + 100 + 15 + 30 + 5 = 350.
  const one = (view: Rect, bleedMargin: number) =>
    layoutPieLabels([arc(0, 0)], center, 100, 0, view, opts({ texts: ['abcdefghij'], bleedMargin }), measure)[0]!.text

  it('an explicit bleedMargin is the room kept to the edge', () => {
    // 400 - 350 - 0 = 50 of room; 400 - 350 - 20 = 30.
    expect(one(bigView, 0)).toBe(truncateLabel('abcdefghij', 50, 12, measure))
    expect(one(bigView, 20)).toBe(truncateLabel('abcdefghij', 30, 12, measure))
    expect(one(bigView, 20).length).toBeLessThan(one(bigView, 0).length)
  })

  it("ECharts' own margin is 10 on a large chart and 2 on a small one (≤ 200 either way)", () => {
    expect(one(bigView, -1)).toBe(truncateLabel('abcdefghij', 40, 12, measure))
    const short: Rect = { x: 0, y: 0, w: 400, h: 150 }
    expect(one(short, -1)).toBe(truncateLabel('abcdefghij', 48, 12, measure))
  })

  it("`overflow: 'none'` leaves the label whole however little room it has", () => {
    const [l] = layoutPieLabels([arc(0, 0)], center, 100, 0, bigView, opts({ texts: ['abcdefghij'], overflow: 'none', bleedMargin: 0 }), measure)
    expect(l!.text).toBe('abcdefghij')
  })
})

describe("layoutPieLabels — alignTo: 'labelLine' on the left", () => {
  it('every left label ends level with the farthest, and its guide line stretches to it', () => {
    // Two left-hand slices at different angles: their natural text x differ.
    const arcs = [arc(0, Math.PI - 0.2), arc(1, Math.PI + 0.9)]
    const plain = layoutPieLabels(arcs, center, 100, 0, bigView, opts({ texts: ['a', 'b'] }), measure)
    expect(plain[0]!.at.x).not.toBeCloseTo(plain[1]!.at.x, 3)
    const out = layoutPieLabels(arcs, center, 100, 0, bigView, opts({ texts: ['a', 'b'], alignTo: 'labelLine' }), measure)
    const leftmost = Math.min(plain[0]!.at.x, plain[1]!.at.x)
    for (const l of out) {
      expect(l.at.x).toBeCloseTo(leftmost, 9)
      expect(l.align).toBe('end')
      // The line's end sits `distance` short of the text, on its side.
      expect(l.line[2]!.x).toBeCloseTo(leftmost + 5, 9)
    }
  })
})

describe("layoutPieLabels — alignTo: 'labelLine' on the right", () => {
  it('every right label starts level with the farthest', () => {
    const arcs = [arc(0, -0.2), arc(1, 0.9)]
    const plain = layoutPieLabels(arcs, center, 100, 0, bigView, opts({ texts: ['a', 'b'] }), measure)
    expect(plain[0]!.at.x).not.toBeCloseTo(plain[1]!.at.x, 3)
    const out = layoutPieLabels(arcs, center, 100, 0, bigView, opts({ texts: ['a', 'b'], alignTo: 'labelLine' }), measure)
    const rightmost = Math.max(plain[0]!.at.x, plain[1]!.at.x)
    for (const l of out) {
      expect(l.at.x).toBeCloseTo(rightmost, 9)
      expect(l.align).toBe('start')
      expect(l.line[2]!.x).toBeCloseTo(rightmost - 5, 9)
    }
  })
})

describe('layoutPieLabels — the ellipse re-slide re-cuts a moved label', () => {
  // Five labels crowded round 3 o'clock, forced apart vertically, then slid
  // back onto the guide lines' ellipse — which moves them in x too.
  const arcs = [-0.08, -0.04, 0, 0.04, 0.08].map((m, i) => arc(i, m, '#000', 0.04))
  const texts = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc', 'dddddddddddd', 'eeeeeeeeeeee']
  const narrow: Rect = { x: 0, y: 0, w: 420, h: 400 }

  it('labels are pushed apart so none overlap (at least one box height between neighbours)', () => {
    const out = layoutPieLabels(arcs, center, 100, 0, narrow, opts({ texts }), measure)
    const ys = out.map((l) => l.at.y).sort((a, b) => a - b)
    for (let k = 1; k < ys.length; k++) expect(ys[k]! - ys[k - 1]!).toBeGreaterThanOrEqual(14 - 1e-9)
  })

  it('each label is cut to the room left at its new x, from its whole text', () => {
    const out = layoutPieLabels(arcs, center, 100, 0, narrow, opts({ texts }), measure)
    for (const l of out) {
      const room = 420 - l.at.x - 10
      expect(l.text).toBe(truncateLabel(texts[l.index]!, room, 12, measure))
      expect(measure(l.text)).toBeLessThanOrEqual(room)
    }
    // A label that slid inward keeps more of its text than the outermost one.
    const lengths = out.map((l) => l.text.length)
    expect(Math.max(...lengths)).toBeGreaterThan(Math.min(...lengths))
  })

  it("with `overflow: 'none'` the moved labels stay whole", () => {
    const out = layoutPieLabels(arcs, center, 100, 0, narrow, opts({ texts, overflow: 'none' }), measure)
    expect(out.map((l) => l.text)).toEqual(texts)
  })

  it('a label that now fits after sliding in gets its whole text back', () => {
    // Wide enough that each whole label fits at its slid-back x, but narrow
    // enough that the outermost starting position did not.
    const short = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee']
    const view: Rect = { x: 0, y: 0, w: 400, h: 400 }
    const out = layoutPieLabels(arcs, center, 100, 0, view, opts({ texts: short }), measure)
    for (const l of out) {
      const room = 400 - l.at.x - 10
      expect(l.text).toBe(room > 40 ? short[l.index]! : truncateLabel(short[l.index]!, room, 12, measure))
    }
  })
})

describe('shiftOnY', () => {
  it('a lone label is never adjusted', () => {
    expect(shiftOnY([0], [50], 10, 0, 100)).toEqual({ order: [0], ys: [50], adjusted: false })
  })

  it('pushes overlapping boxes down past their predecessors, in position order', () => {
    const r = shiftOnY([0, 1, 2], [12, 10, 11], 10, 0, 200)
    expect(r.order).toEqual([1, 2, 0])
    expect(r.ys).toEqual([10, 20, 30])
    expect(r.adjusted).toBe(true)
  })

  it('a column over the top closes the gaps below it to come back inside', () => {
    const r = shiftOnY([0, 1, 2], [100, 101, 250], 10, 100, 300)
    // The top box's top edge starts 5 above the bound; the 130px gap below absorbs it.
    expect(r.ys[0]).toBeCloseTo(105, 9)
    expect(r.ys[1]).toBeCloseTo(115, 9)
    expect(r.ys[2]).toBeCloseTo(250, 9)
  })

  it('a column over the bottom closes the gaps above it to come back inside', () => {
    const r = shiftOnY([0, 1, 2], [50, 199, 200], 10, 0, 200)
    expect(r.ys[0]).toBeCloseTo(50, 9)
    expect(r.ys[1]).toBeCloseTo(185, 9)
    expect(r.ys[2]).toBeCloseTo(195, 9)
  })

  it('a tight column below the bottom moves up into the room at the top', () => {
    const r = shiftOnY([0, 1, 2], [95, 96, 97], 10, 0, 100)
    expect(r.ys).toEqual([75, 85, 95])
  })

  it('with no room anywhere, the boxes overlap evenly rather than leave the bounds (bottom)', () => {
    const r = shiftOnY([0, 1, 2, 3], [5, 6, 7, 20], 10, 0, 32)
    expect(r.ys).toEqual([5, 12, 19, 26])
    expect(r.ys[3]! + 5).toBeLessThanOrEqual(32)
  })

  it('with no room anywhere, the boxes overlap evenly rather than leave the bounds (top)', () => {
    const r = shiftOnY([0, 1], [-10, -9], 10, 0, 15)
    expect(r.ys[0]! - 5).toBeGreaterThanOrEqual(0)
    expect(r.ys[1]! + 5).toBeLessThanOrEqual(15)
  })

  it('a column too tall for both bounds overlaps evenly from each end', () => {
    // Three 10px boxes in a 20px band: over the top AND the bottom by 5.
    expect(shiftOnY([0, 1, 2], [100, 101, 102], 10, 100, 120).ys).toEqual([106, 110, 114])
  })

  it('takes what room the other bound has, then closes gaps for the rest', () => {
    // After the first squeeze the column is still 3 over the bottom with only
    // 2 of room at the top: it moves up 2, and the last gap gives up the other 1.
    const r = shiftOnY([0, 1, 2, 3], [5, 6, 7, 50], 10, -2, 40)
    expect(r.ys.map((y) => Math.round(y * 1e9) / 1e9)).toEqual([3, 13, 23, 35])
  })

  it('squeezes existing gaps when one bound overruns and the other has only part of the room', () => {
    // Too low by more than the headroom at the top: the rest comes out of the gaps.
    const r = shiftOnY([0, 1, 2], [2, 40, 60], 10, 0, 62)
    expect(r.ys[0]! - 5).toBeGreaterThanOrEqual(-1e-9)
    expect(r.ys[2]! + 5).toBeLessThanOrEqual(62 + 1e-9)
    for (let k = 1; k < 3; k++) expect(r.ys[k]! - r.ys[k - 1]!).toBeGreaterThanOrEqual(10 - 1e-9)
  })
})

describe('limitLine', () => {
  it('leaves the elbow alone when both limits are off', () => {
    expect(limitLine(0, 0, 10, 0, 0, 1, 1, 0, 0, 0)).toEqual({ x: 10, y: 0 })
  })

  it('leaves a degenerate line (elbow on the slice point) alone', () => {
    expect(limitLine(0, 0, 0, 0, 20, 0, 1, 0, 90, 90)).toEqual({ x: 0, y: 0 })
  })

  it('a line that doubles back has its elbow slid along the second leg', () => {
    const p = limitLine(0, 0, 10, 0, 0, 1, 1, 0, 90, 0)
    // On the segment (10,0)→(0,1).
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(10)
    expect(p.y).toBeCloseTo(1 - p.x / 10, 9)
    // …far enough that the turn at the elbow is now a right angle.
    const ax = 0 - p.x
    const ay = 0 - p.y
    const bx = 0 - p.x
    const by = 1 - p.y
    expect((ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by)).toBeCloseTo(0, 6)
  })

  it('when the corrected elbow would pass the end, it stops at the end', () => {
    expect(limitLine(0, 0, 10, 0, 9, 0.1, 1, 0, 90, 0)).toEqual({ x: 9, y: 0.1 })
  })

  it('a vertical second leg is parametrised on y', () => {
    const p = limitLine(1, 0, 0, 10, 0, 0, 0, 1, 90, 0)
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeGreaterThanOrEqual(-1e-9)
    expect(p.y).toBeLessThan(10)
  })

  it('a first leg too far off the surface normal has its elbow slid out along the second leg', () => {
    const p = limitLine(0, 0, 0, 10, 20, 10, 1, 0, 0, 30)
    expect(p.y).toBe(10)
    // The first leg now makes exactly 30° with the normal.
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.PI / 6, 9)
  })

  it('a surface correction that would pass the end stops at the end', () => {
    expect(limitLine(0, 0, 0, 10, 1, 10, 1, 0, 0, 30)).toEqual({ x: 1, y: 10 })
  })

  it('a second leg itself too far off the normal puts the elbow at the end', () => {
    expect(limitLine(0, 0, 10, 0, 10, -20, 0, 1, 0, 30)).toEqual({ x: 10, y: -20 })
  })

  it('a vertical second leg is parametrised on y in the surface pass too', () => {
    const p = limitLine(0, 0, 10, -2, 10, -20, 0, -1, 0, 30)
    expect(p.x).toBe(10)
    expect(p.y).toBeLessThan(-2)
    expect(p.y).toBeGreaterThan(-20)
    // The first leg now makes 30° with the normal (straight up).
    expect(Math.acos(-p.y / Math.hypot(p.x, p.y))).toBeCloseTo(Math.PI / 6, 9)
  })
})
