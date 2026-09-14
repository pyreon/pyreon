// The stack/group/waterfall layouts, on the inputs their guard arms exist for:
// an empty series set, a RAGGED set (series of differing lengths), a gap, a
// negative, a clamped gap ratio and a zero column total. Each spec pairs the
// input the arm acts on with the input it must leave alone, so an arm that
// stopped firing shows up as a changed layout rather than as a coverage number.
import { describe, expect, it } from 'vitest'
import {
  layoutGroupedBars,
  layoutGroupedBarsH,
  layoutScatter,
  layoutStackedBars,
  layoutStackedBarsH,
  layoutWaterfall,
  normalizeStack,
  stackCumulative,
  stackHasNegatives,
  stackedExtent,
  waterfallExtent,
} from './stack'
import type { Domain, Rect } from './types'

const PLOT: Rect = { x: 0, y: 0, w: 200, h: 100 }
const D: Domain = { min: 0, max: 10 }
const SIGNED: Domain = { min: -10, max: 10 }

describe('stacked bars — the empty and ragged inputs the guards exist for', () => {
  it('lays nothing out for no series and for series that are all empty, on BOTH axes', () => {
    expect(layoutStackedBars([], PLOT, D, 0.2)).toEqual([])
    expect(layoutStackedBars([[], []], PLOT, D, 0.2)).toEqual([])
    expect(layoutStackedBarsH([], PLOT, D, 0.2)).toEqual([])
    expect(layoutStackedBarsH([[], []], PLOT, D, 0.2)).toEqual([])
    // The control: one real value and both axes lay out one segment.
    expect(layoutStackedBars([[5]], PLOT, D, 0.2)).toHaveLength(1)
    expect(layoutStackedBarsH([[5]], PLOT, D, 0.2)).toHaveLength(1)
  })

  it('a SHORT series contributes nothing past its end — the band count follows the LONGEST', () => {
    const segs = layoutStackedBars([[1, 2, 3], [4]], PLOT, D, 0)
    // Three bands from the long series, one extra segment from the short one.
    expect(segs.filter((s) => s.seriesIndex === 0)).toHaveLength(3)
    expect(segs.filter((s) => s.seriesIndex === 1)).toHaveLength(1)
    expect(segs.find((s) => s.seriesIndex === 1)!.datumIndex).toBe(0)
    const h = layoutStackedBarsH([[1, 2, 3], [4]], PLOT, D, 0)
    expect(h.filter((s) => s.seriesIndex === 1)).toHaveLength(1)
    // The missing cells are not zero-height segments: they are absent.
    expect(segs.every((s) => s.value > 0)).toBe(true)
  })

  it('skips a negative and a gap, and keeps the positives around them stacking', () => {
    const segs = layoutStackedBars([[5, 5], [-3, Number.NaN], [2, 2]], PLOT, D, 0)
    expect(segs.map((s) => [s.seriesIndex, s.datumIndex, s.value])).toEqual([
      [0, 0, 5],
      [2, 0, 2],
      [0, 1, 5],
      [2, 1, 2],
    ])
    // Series 2 sits ON TOP of series 0 (5), not at the floor — the skipped
    // entries contributed nothing to the running total.
    const top = segs.find((s) => s.seriesIndex === 2 && s.datumIndex === 0)!
    expect(top.rect.y + top.rect.h).toBeCloseTo(layoutStackedBars([[5]], PLOT, D, 0)[0]!.rect.y, 9)
    const h = layoutStackedBarsH([[5], [-3], [2]], PLOT, D, 0)
    expect(h.map((s) => s.seriesIndex)).toEqual([0, 2])
    expect(h[1]!.rect.x).toBeCloseTo(PLOT.x + (5 / 10) * PLOT.w, 9)
  })

  it('clamps the gap ratio to 0..0.9 at both ends, on every layout', () => {
    const band = PLOT.w / 2
    // A negative ratio is 0 — the bar fills its band.
    expect(layoutStackedBars([[1, 1]], PLOT, D, -5)[0]!.rect.w).toBeCloseTo(band, 9)
    // A ratio past 0.9 is 0.9 — a tenth of the band, never a zero-width bar.
    expect(layoutStackedBars([[1, 1]], PLOT, D, 4)[0]!.rect.w).toBeCloseTo(band * 0.1, 9)
    // And the unclamped middle still passes through.
    expect(layoutStackedBars([[1, 1]], PLOT, D, 0.5)[0]!.rect.w).toBeCloseTo(band * 0.5, 9)

    const bandH = PLOT.h / 2
    expect(layoutStackedBarsH([[1, 1]], PLOT, D, -5)[0]!.rect.h).toBeCloseTo(bandH, 9)
    expect(layoutStackedBarsH([[1, 1]], PLOT, D, 4)[0]!.rect.h).toBeCloseTo(bandH * 0.1, 9)
    expect(layoutGroupedBarsH([[1, 1]], PLOT, D, -5)[0]!.rect.h).toBeCloseTo(bandH, 9)
    expect(layoutGroupedBarsH([[1, 1]], PLOT, D, 4)[0]!.rect.h).toBeCloseTo(bandH * 0.1, 9)
    expect(layoutWaterfall([1, 1], PLOT, D, -5)[0]!.rect.w).toBeCloseTo(band, 9)
    expect(layoutWaterfall([1, 1], PLOT, D, 4)[0]!.rect.w).toBeCloseTo(band * 0.1, 9)
  })
})

describe('grouped bars, horizontal — the flipped frame', () => {
  it('lays nothing out for no series and for all-empty series', () => {
    expect(layoutGroupedBarsH([], PLOT, D, 0.2)).toEqual([])
    expect(layoutGroupedBarsH([[], []], PLOT, D, 0.2)).toEqual([])
    expect(layoutGroupedBarsH([[1]], PLOT, D, 0.2)).toHaveLength(1)
  })

  it('a bar left of the zero line starts at its value; a gap draws a zero-width bar AT the line', () => {
    const segs = layoutGroupedBarsH([[-4, 4, Number.NaN]], PLOT, SIGNED, 0)
    const zeroX = PLOT.x + PLOT.w / 2
    // Negative: x is the VALUE side, width reaches back to zero.
    expect(segs[0]!.rect.x).toBeCloseTo(PLOT.x + (6 / 20) * PLOT.w, 9)
    expect(segs[0]!.rect.x + segs[0]!.rect.w).toBeCloseTo(zeroX, 9)
    // Positive: x is the zero line.
    expect(segs[1]!.rect.x).toBeCloseTo(zeroX, 9)
    // Gap: nothing to see, pinned at the line.
    expect(segs[2]!.rect.w).toBeCloseTo(0, 9)
    expect(segs[2]!.rect.x).toBeCloseTo(zeroX, 9)
    expect(segs[2]!.value).toBe(0)
  })

  it('a DESCENDING value axis still produces a positive-width rect anchored at the smaller x', () => {
    // A reversed domain maps a larger value to a SMALLER x, so the segment's
    // start and end swap; the rect is built from the min and the |delta|.
    const seg = layoutStackedBarsH([[4]], PLOT, { min: 10, max: 0 }, 0)[0]!
    expect(seg.rect.w).toBeCloseTo((4 / 10) * PLOT.w, 9)
    expect(seg.rect.x).toBeCloseTo(PLOT.x + PLOT.w - (4 / 10) * PLOT.w, 9)
    expect(seg.rect.x).toBeGreaterThanOrEqual(PLOT.x)
    // The ascending control anchors at the axis floor instead.
    expect(layoutStackedBarsH([[4]], PLOT, { min: 0, max: 10 }, 0)[0]!.rect.x).toBeCloseTo(PLOT.x, 9)
  })

  it('a SHORT series reads as zero in the bands past its end, not as a missing bar', () => {
    const segs = layoutGroupedBarsH([[3, 3], [1]], PLOT, D, 0)
    // Both series get a bar in BOTH bands — grouped geometry is a joint layout.
    expect(segs).toHaveLength(4)
    const missing = segs.find((s) => s.seriesIndex === 1 && s.datumIndex === 1)!
    expect(missing.value).toBe(0)
    expect(missing.rect.w).toBeCloseTo(0, 9)
  })

  it('an all-positive domain puts the baseline at the domain FLOOR, not at an off-scale zero', () => {
    const positive = layoutGroupedBarsH([[10]], PLOT, { min: 5, max: 10 }, 0)
    expect(positive[0]!.rect.x).toBeCloseTo(PLOT.x, 9)
    expect(positive[0]!.rect.w).toBeCloseTo(PLOT.w, 9)
    // The signed control still measures from the real zero, mid-plot.
    const signed = layoutGroupedBarsH([[10]], PLOT, SIGNED, 0)
    expect(signed[0]!.rect.x).toBeCloseTo(PLOT.x + PLOT.w / 2, 9)
  })
})

describe('cumulative tops, extents and shares over RAGGED input', () => {
  it('stackCumulative reads a missing cell as zero and carries the running total', () => {
    expect(stackCumulative([[1, 2, 3], [10]])).toEqual([
      [1, 2, 3],
      [11, 2, 3],
    ])
    // A negative contributes nothing, matching the bar layout.
    expect(stackCumulative([[5], [-5]])).toEqual([[5], [5]])
  })

  it('stackedExtent totals the POSITIVES per column over a ragged set, and floors an empty stack at 1', () => {
    expect(stackedExtent([[1, 2], [3]])).toEqual({ min: 0, max: 4 })
    expect(stackedExtent([[1, 2], [3, Number.NaN]])).toEqual({ min: 0, max: 4 })
    expect(stackedExtent([[-1, -2]])).toEqual({ min: 0, max: 1 })
    expect(stackedExtent([])).toEqual({ min: 0, max: 1 })
  })

  it('stackHasNegatives reports the value a stack would drop, and nothing otherwise', () => {
    expect(stackHasNegatives([[1, 2], [3, -1]])).toBe(true)
    expect(stackHasNegatives([[1, 2], [3, 0]])).toBe(false)
    expect(stackHasNegatives([[Number.NaN]])).toBe(false)
  })

  it('normalizeStack: a short series reads as zero in the total; a zero column stays 0 and a gap stays a gap', () => {
    // Column 1's total comes only from the long series (the short one has no cell there).
    expect(normalizeStack([[1, 3], [1]])).toEqual([[0.5, 1], [0.5]])
    // A column whose positives sum to zero maps its finite values to 0 …
    const zeroCol = normalizeStack([[0, 4], [-2, 4]])
    expect(zeroCol[0]![0]).toBe(0)
    expect(zeroCol[1]![0]).toBe(0)
    expect(zeroCol[0]![1]).toBe(0.5)
    // … while a gap survives as a gap rather than being flattened to 0.
    expect(Number.isNaN(normalizeStack([[Number.NaN]])[0]![0]!)).toBe(true)
  })
})

describe('waterfall', () => {
  it('lays nothing out for no values, and skips a gap while keeping the running total', () => {
    expect(layoutWaterfall([], PLOT, D, 0.2)).toEqual([])
    const steps = layoutWaterfall([4, Number.NaN, 2], PLOT, D, 0)
    expect(steps.map((s) => [s.datumIndex, s.start, s.end])).toEqual([
      [0, 0, 4],
      [2, 4, 6],
    ])
  })

  it('waterfallExtent spans every running total, and gives a flat run a unit of room', () => {
    expect(waterfallExtent([5, -8, 2])).toEqual({ min: -3, max: 5 })
    expect(waterfallExtent([])).toEqual({ min: 0, max: 1 })
    expect(waterfallExtent([Number.NaN])).toEqual({ min: 0, max: 1 })
  })
})

describe('grouped bars + scatter, vertical', () => {
  it('a gap draws a zero-height bar at the zero line; a real value grows from it', () => {
    const segs = layoutGroupedBars([[Number.NaN, 6]], PLOT, D, 0)
    expect(segs[0]!.rect.h).toBeCloseTo(0, 9)
    expect(segs[0]!.value).toBe(0)
    expect(segs[1]!.rect.h).toBeCloseTo((6 / 10) * PLOT.h, 9)
    expect(layoutGroupedBars([], PLOT, D, 0)).toEqual([])
    expect(layoutGroupedBars([[]], PLOT, D, 0)).toEqual([])
  })

  it('layoutScatter pairs x and y and stops at the SHORTER channel', () => {
    const pts = layoutScatter([0, 5, 10], [0, 10], PLOT, D, D)
    expect(pts).toHaveLength(2)
    expect(pts[0]).toEqual({ x: 0, y: 100 })
    expect(pts[1]).toEqual({ x: 100, y: 0 })
  })
})
