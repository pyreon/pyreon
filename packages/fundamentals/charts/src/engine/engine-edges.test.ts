// Engine paths a public input reaches that no other spec drove: a `path`
// decal and image tiling (a mark's `pattern`), a clip region through the RTL
// mirror, the transpose and the morphing tween (a `DrawCmd` any custom layer
// can emit), a pinned `yDomain` (the public prop takes a full `Domain`,
// with a fixed step or inverted), a tap on a stacked series under `selectedMode: 'series'`, the
// boxplot hit the native hosts call, and a box laid out by its keys.
import { describe, expect, it } from 'vitest'
import { hitBoxplotChart } from './boxplot-chart'
import { tweenCmds, universalTweenCmds } from './cmd-tween'
import { frameView } from './frame'
import type { FrameLength, FrameSpec } from './frame'
import { patternImageCells, patternMarks } from './pattern'
import { plotHitSeriesIn } from './plot-hit'
import { defaultTheme, layoutChart } from './render'
import type { ChartSpec, Series } from './render'
import { mirrorCmds, transposeCmds } from './rtl'
import { makeTicks, scaleLinear } from './scale'
import type { ChartPattern, DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6

describe('pattern decals', () => {
  const base: ChartPattern = { kind: 'symbols', color: '#123456', spacing: 10, width: 8 }

  it('a path decal draws each ring of its shape per cell, scaled by the width', () => {
    // One triangle ring and a degenerate two-point ring (too few to fill).
    const shape = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }]
    const marks = patternMarks({ ...base, symbol: 'path', shape, shapeRings: [3, 2] }, { x: 0, y: 0, w: 20, h: 20 })
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.every((m) => m.kind === 'polygon' && m.points.length === 3)).toBe(true)
    // A ring count past the shape stops at the shape's end.
    expect(patternMarks({ ...base, symbol: 'path', shape, shapeRings: [9] }, { x: 0, y: 0, w: 20, h: 20 }).every((m) => m.kind === 'polygon' && m.points.length === 5)).toBe(true)
  })

  it('a separate row pitch spaces the rows; an image pattern has no marks of its own', () => {
    const tight = patternMarks({ ...base, spacingY: 3 }, { x: 0, y: 0, w: 20, h: 20 }).length
    const loose = patternMarks({ ...base, spacingY: 30 }, { x: 0, y: 0, w: 20, h: 20 }).length
    expect(tight).toBeGreaterThan(loose)
    expect(patternMarks({ ...base, kind: 'image' }, { x: 0, y: 0, w: 20, h: 20 })).toEqual([])
  })
})

describe('image pattern tiling', () => {
  const img: ChartPattern = { kind: 'image', color: '', spacing: 0, width: 0, image: 'data:,' }
  const box = { x: 5, y: 5, w: 40, h: 30 }

  it('repeat tiles both axes from the canvas origin at the natural size', () => {
    const cells = patternImageCells(img, box, 20, 20)
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 20, h: 20 })
    expect(cells).toHaveLength(3 * 2)
  })

  it('repeat-x and repeat-y tile one axis; no-repeat draws one copy at the origin', () => {
    expect(patternImageCells({ ...img, repeat: 'repeat-x' }, box, 20, 20).every((c) => c.y === 0)).toBe(true)
    expect(patternImageCells({ ...img, repeat: 'repeat-y' }, box, 20, 20).every((c) => c.x === 0)).toBe(true)
    expect(patternImageCells({ ...img, repeat: 'no-repeat' }, box, 20, 20)).toEqual([{ x: 0, y: 0, w: 20, h: 20 }])
  })

  it('an image of unknown size has no tiles yet', () => {
    expect(patternImageCells(img, box, 0, 20)).toEqual([])
  })

  it('a grid decal centres the image in each cell, keeping its aspect', () => {
    const cells = patternImageCells({ ...img, repeat: 'grid', spacing: 20, width: 10 }, { x: 0, y: 0, w: 40, h: 20 }, 40, 20)
    expect(cells).toEqual([
      { x: 5, y: 7.5, w: 10, h: 5 },
      { x: 25, y: 7.5, w: 10, h: 5 },
    ])
    const tall = patternImageCells({ ...img, repeat: 'grid', spacing: 20, spacingY: 20, width: 10 }, { x: 0, y: 0, w: 20, h: 20 }, 20, 40)
    expect(tall).toEqual([{ x: 7.5, y: 5, w: 5, h: 10 }])
    // An unknown image size is drawn square; a tiny width and pitch are floored.
    expect(patternImageCells({ ...img, repeat: 'grid', spacing: 1, width: 0 }, { x: 0, y: 0, w: 2, h: 2 }, 0, 0)).toEqual([{ x: 0.75, y: 0.75, w: 0.5, h: 0.5 }])
  })
})

describe('clip regions through the frame transforms', () => {
  const clip: DrawCmd[] = [{ kind: 'clip', rect: { x: 10, y: 20, w: 30, h: 40 } }, { kind: 'rect', rect: { x: 10, y: 20, w: 30, h: 40 }, fill: '#000' }, { kind: 'unclip' }]

  it('the RTL mirror moves a clip with the content it clips', () => {
    const m = mirrorCmds(clip, 100)
    expect(m[0]).toEqual({ kind: 'clip', rect: { x: 60, y: 20, w: 30, h: 40 } })
    expect(m[2]).toEqual({ kind: 'unclip' })
    expect((m[1] as Extract<DrawCmd, { kind: 'rect' }>).rect.x).toBe(60)
  })

  it('the transpose swaps a clip region with its content', () => {
    const t = transposeCmds(clip)
    expect(t[0]).toEqual({ kind: 'clip', rect: { x: 20, y: 10, w: 40, h: 30 } })
    expect(t[2]).toEqual({ kind: 'unclip' })
  })

  it('both tweens carry a clip through at once, and settle on the target', () => {
    const shifted: DrawCmd[] = [{ kind: 'clip', rect: { x: 0, y: 0, w: 5, h: 5 } }, { kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 }, fill: '#000' }, { kind: 'unclip' }]
    const same = tweenCmds(shifted, clip, 0.5)
    expect(same).toHaveLength(3)
    expect(same[0]).toEqual(clip[0])
    expect(same[2]).toEqual(clip[2])
    const from: DrawCmd[] = [{ kind: 'circle', center: { x: 0, y: 0 }, radius: 3, fill: '#000' }]
    const mid = universalTweenCmds(from, clip, 0.5)
    expect(mid.find((c) => c.kind === 'clip')).toEqual(clip[0])
    expect(mid.find((c) => c.kind === 'unclip')).toEqual(clip[2])
    expect(universalTweenCmds(from, clip, 1)).toBe(clip)
    // A clip as the SOURCE is a region to grow from, like a rect.
    const grown = universalTweenCmds([clip[0]!], [{ kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 }, fill: '#000' }], 0)
    expect(grown[0]).toMatchObject({ kind: 'rect', rect: { x: 10, y: 20, w: 30, h: 40 } })
  })
})

describe('a pinned value domain', () => {
  it('an inverted domain maps its min to the far end', () => {
    expect(scaleLinear({ min: 0, max: 10 }, 0, 100, 2)).toBe(20)
    expect(scaleLinear({ min: 0, max: 10, inverse: true }, 0, 100, 2)).toBe(80)
  })

  it('a fixed step ticks at the step and adds a bound that is not a multiple of it', () => {
    const ticks = makeTicks({ min: 3, max: 27, step: 10 }, 0, 100, 5)
    expect(ticks.map((t) => t.value)).toEqual([3, 10, 20, 27])
    // Bounds that ARE multiples add nothing extra.
    expect(makeTicks({ min: 0, max: 20, step: 10 }, 0, 100, 5).map((t) => t.value)).toEqual([0, 10, 20])
  })

})

describe('plotHitSeriesIn over a stacked set', () => {
  it('names the stacked series whose segment top is nearest the tap, and -1 far away', () => {
    const series = (values: number[]): Series => ({ kind: 'stacked', values, color: '#000', width: 1, radius: 3, label: 'S' })
    const spec: ChartSpec = { width: 300, height: 200, categories: ['a', 'b'], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: false, series: [series([2, 2]), series([2, 2])] }
    const l = layoutChart(spec, measure)
    // A stacked series has rects, so the bar pass answers inside a segment; its
    // marker anchor (the segment top) answers just above it, outside every rect.
    const band = l.plot.w / 2
    const x = l.plot.x + band / 2
    const top = l.plot.y + l.plot.h / 2
    expect(plotHitSeriesIn(spec, l, x, l.plot.y - 1e6, 10)).toBe(-1)
    expect([0, 1]).toContain(plotHitSeriesIn(spec, l, x, top - 2, 30))
  })
})

describe('hitBoxplotChart', () => {
  it('answers against the same frame the chart paints', () => {
    const rows = [
      { min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [] },
      { min: 2, q1: 3, median: 4, q3: 5, max: 6, outliers: [] },
    ]
    const w = 300
    const h = 200
    // The left half of the plot is box 0, the right half box 1; off the plot is a miss.
    const left = hitBoxplotChart(2, w, h, ['a', 'b'], 11, measure, w * 0.35, h / 2, rows)
    const right = hitBoxplotChart(2, w, h, ['a', 'b'], 11, measure, w * 0.8, h / 2, rows)
    expect([left, right]).toEqual([0, 1])
    expect(hitBoxplotChart(2, w, h, ['a', 'b'], 11, measure, -10, -10, rows)).toBe(-1)
  })
})

describe('frameView', () => {
  const unset: FrameLength = { mode: '', amount: 0 }
  const px = (amount: number): FrameLength => ({ mode: 'px', amount })
  const pct = (amount: number): FrameLength => ({ mode: 'pct', amount })
  const kw = (mode: string): FrameLength => ({ mode, amount: 0 })
  const frame = (o: Partial<FrameSpec>): FrameSpec => ({ left: unset, top: unset, right: unset, bottom: unset, width: unset, height: unset, ...o })

  it('an unset box fills the chart', () => {
    expect(frameView(frame({}), 400, 300)).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })

  it('percent lengths and the centre / start / end keywords place a sized box', () => {
    expect(frameView(frame({ width: pct(50), height: pct(50), left: kw('center'), top: kw('center') }), 400, 300)).toEqual({ x: 100, y: 75, w: 200, h: 150 })
    expect(frameView(frame({ width: px(100), height: px(50), left: kw('end'), top: kw('start') }), 400, 300)).toEqual({ x: 300, y: 0, w: 100, h: 50 })
  })

  it('a sized box set from the right / bottom sits against those edges; an unsized one stretches to them', () => {
    expect(frameView(frame({ width: px(100), height: px(50), right: px(10), bottom: px(20) }), 400, 300)).toEqual({ x: 290, y: 230, w: 100, h: 50 })
    expect(frameView(frame({ left: px(10), top: px(10), right: px(20), bottom: pct(10) }), 400, 300)).toEqual({ x: 10, y: 10, w: 370, h: 260 })
    // An unknown mode reads as unset.
    expect(frameView(frame({ width: { mode: 'huh', amount: 7 } }), 400, 300).w).toBe(400)
  })
})
